// The Claude path. These use a fake Anthropic client, so they run offline and are deterministic,
// but they exercise the real prompt, schema, retry loop, and validator.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmp, makeJsProject } = require('./stories/helpers');
const { makePlan, PLAN_SCHEMA } = require('../backend/planner');
const { Engine } = require('../backend/engine');

// A stand-in for the Anthropic SDK: returns the queued plans in order and records every request.
function fakeClient(plans) {
  const requests = [];
  return {
    requests,
    beta: {
      messages: {
        create: async (req) => {
          requests.push(req);
          const next = plans.shift();
          if (next && next.stop_reason) return { stop_reason: next.stop_reason, content: [] };
          return { stop_reason: 'end_turn', content: [{ type: 'text', text: typeof next === 'string' ? next : JSON.stringify(next) }] };
        },
      },
    },
  };
}

function devFolder() {
  const root = tmp();
  const done = makeJsProject(root, 'cs3140-hw1');
  const dirty = makeJsProject(root, 'hoohacks-2026', { dirty: true });
  const engine = new Engine({ dataDir: tmp(), apiKey: '', llmClient: null });
  return { root, done, dirty, engine };
}

const del = (id, p, project) => ({ id, op: 'delete_rebuildable', path: p, dest: '', keep: '', reason: `${project}: old dependencies` });

test('LLM-1 the request sent to Claude lists rebuildable items and allows delete_rebuildable in the schema', async () => {
  const { root, engine } = devFolder();
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const client = fakeClient([{ summary: 's', actions: [], questions: [] }]);
  await makePlan({ request: "I'm done with CS 3140", scan: engine.snapshot, dev: engine.dev, findings: [], profile: engine.profile, client });
  const body = client.requests[0].messages[0].content;
  assert.match(body, /rebuildable_items/);
  assert.match(body, /cs3140-hw1/);
  assert.ok(PLAN_SCHEMA.properties.actions.items.properties.op.enum.includes('delete_rebuildable'));
  assert.match(client.requests[0].system, /delete_rebuildable/);
});

test('LLM-2 Claude proposes an unprovable deletion, the validator rejects it, the reason goes back, and the corrected plan passes', async () => {
  const { root, done, dirty } = devFolder();
  const bad = { summary: 'free space', questions: [], actions: [del('a1', path.join(done, 'node_modules'), 'cs3140-hw1'), del('a2', path.join(dirty, 'node_modules'), 'hoohacks-2026')] };
  const fixed = { summary: 'free space', questions: [], actions: [del('a1', path.join(done, 'node_modules'), 'cs3140-hw1')] };
  const client = fakeClient([bad, fixed]);
  const engine = new Engine({ dataDir: tmp(), apiKey: '', llmClient: client });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const plan = await engine.plan("I'm done with CS 3140 and the hackathon");
  assert.strictEqual(plan.mode, 'llm');
  assert.deepStrictEqual(plan.attempts.map((a) => a.ok), [false, true]);
  assert.match(plan.attempts[0].errors.join(' '), /hoohacks-2026 has uncommitted changes/);
  const retryPrompt = client.requests[1].messages[0].content;
  assert.match(retryPrompt, /FAILED validation/);
  assert.match(retryPrompt, /uncommitted changes/);
  assert.deepStrictEqual(plan.actions.map((a) => a.id), ['a1']);
});

test('LLM-3 if Claude never fixes it, only the safe part is shown and the user is asked', async () => {
  const { root, done, dirty } = devFolder();
  const bad = () => ({ summary: 's', questions: [], actions: [del('a1', path.join(done, 'node_modules'), 'cs3140-hw1'), del('a2', path.join(dirty, 'node_modules'), 'hoohacks-2026')] });
  const client = fakeClient([bad(), bad(), bad()]);
  const engine = new Engine({ dataDir: tmp(), apiKey: '', llmClient: client });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const plan = await engine.plan('Free up space');
  assert.strictEqual(client.requests.length, 3);
  assert.deepStrictEqual(plan.actions.map((a) => a.id), ['a1']);
  assert.match(plan.questions[0].text, /couldn't make every step safe after 3 tries/);
});

test('LLM-4 Claude output that is not valid JSON becomes a validator error, not a crash', async () => {
  const { root, done } = devFolder();
  const client = fakeClient(['not json at all', { summary: 's', questions: [], actions: [del('a1', path.join(done, 'node_modules'), 'cs3140-hw1')] }]);
  const engine = new Engine({ dataDir: tmp(), apiKey: '', llmClient: client });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const plan = await engine.plan('Free up space');
  assert.deepStrictEqual(plan.attempts.map((a) => a.ok), [false, true]);
  assert.match(plan.attempts[0].errors[0], /JSON object/);
});

test('LLM-5 a refusal from the model is reported, not silently treated as an empty plan', async () => {
  const { root } = devFolder();
  const client = fakeClient([{ stop_reason: 'refusal' }]);
  const engine = new Engine({ dataDir: tmp(), apiKey: '', llmClient: client });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  await assert.rejects(engine.plan('Free up space'), /declined/);
});

test('LLM-6 only file names and metadata are sent to Claude, never file contents', async () => {
  const { root, done, engine } = devFolder();
  fs.writeFileSync(path.join(done, 'secret-notes.txt'), 'MY SSN IS 123-45-6789');
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const client = fakeClient([{ summary: 's', actions: [], questions: [] }]);
  await makePlan({ request: 'x', scan: engine.snapshot, dev: engine.dev, findings: [], profile: engine.profile, client });
  const body = client.requests[0].messages[0].content;
  assert.match(body, /secret-notes\.txt/);
  assert.doesNotMatch(body, /123-45-6789/);
});

test('LLM-7 Claude is told each project\'s course, how long since it changed, and whether it has uncommitted work', async () => {
  const root = tmp();
  makeJsProject(root, 'cs3140-hw1');
  makeJsProject(root, 'hoohacks-2026', { dirty: true, ageDays: 3 });
  const engine = new Engine({ dataDir: tmp(), apiKey: '' });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const client = fakeClient([{ summary: 's', actions: [], questions: [] }]);
  await makePlan({ request: 'x', scan: engine.snapshot, dev: engine.dev, findings: [], profile: engine.profile, client });
  const sent = JSON.parse(client.requests[0].messages[0].content.split('metadata only):\n')[1]);
  const hw = sent.rebuildable_items.find((i) => i.project === 'cs3140-hw1');
  assert.strictEqual(hw.course, 'CS 3140');
  assert.ok(hw.last_changed_days >= 59, String(hw.last_changed_days));
  assert.strictEqual(hw.uncommitted, false);
  const hack = sent.projects.find((p) => p.name === 'hoohacks-2026');
  assert.strictEqual(hack.uncommitted, true);
});
