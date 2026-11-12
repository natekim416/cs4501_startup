// US-04 (#5) · Protect the projects I care about, once.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmp, write, makeJsProject } = require('./helpers');
const { Engine } = require('../../backend/engine');
const { scan } = require('../../backend/scanner');
const { validate } = require('../../backend/validator');

// A temp folder that's removed when the test ends.
function tempDir(t) {
  const dir = tmp();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function setup(t, names, opts = {}) {
  const root = tempDir(t);
  for (const n of names) makeJsProject(root, n);
  const dataDir = tempDir(t);
  const engine = new Engine({ dataDir, apiKey: '', ...opts });
  engine.profile.setZone(root, 'free');
  return { root, engine, dataDir };
}

// True if any action in the plan is inside a folder with this name.
const touches = (plan, name) => plan.actions.some((a) => a.path.split(path.sep).includes(name));

// A stand-in for the Anthropic SDK that returns the queued plans in order (see llm-planner.test.js).
function fakeClient(plans) {
  const requests = [];
  const reply = (p) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(p) }] });
  return { requests, beta: { messages: { create: async (req) => (requests.push(req), reply(plans.shift())) } } };
}

test('US-04 protected projects are skipped in every later plan and listed as protected', async (t) => {
  const { root, engine } = setup(t, ['capstone-team7', 'portfolio-site', 'cs3140-hw1']);
  engine.profile.protect('capstone-team7');
  engine.profile.protect('portfolio-site');
  engine.scanFolder(root);
  const plan = await engine.plan('Free up space');
  assert.ok(plan.actions.every((a) => !/capstone-team7|portfolio-site/.test(a.path)));
  assert.deepStrictEqual(plan.protected.sort(), ['capstone-team7', 'portfolio-site']);
});

test('US-04 a saved pattern like capstone-* protects new matching projects', async (t) => {
  const { root, engine } = setup(t, ['capstone-v2']);
  engine.profile.protect('capstone-*');
  engine.scanFolder(root);
  const plan = await engine.plan('Free up space');
  assert.strictEqual(plan.actions.length, 0);
});

test('US-04 removing a protection from DINO MEMORY lets the project appear again', async (t) => {
  const { root, engine } = setup(t, ['capstone-team7']);
  engine.profile.protect('capstone-team7');
  engine.profile.unprotect('capstone-team7');
  engine.scanFolder(root);
  const plan = await engine.plan('Free up space');
  assert.ok(plan.actions.some((a) => a.path.includes('capstone-team7')));
});

test('US-04 "always keep" in chat saves the projects it names, plans nothing, and lasts after a restart', async (t) => {
  const { root, engine, dataDir } = setup(t, ['capstone-team7', 'portfolio-site', 'cs3140-hw1']);
  engine.scanFolder(root);
  const reply = await engine.plan('Always keep capstone-team7 and portfolio-site');
  assert.strictEqual(reply.actions.length, 0);
  assert.strictEqual(reply.memoryChanged, true);
  assert.match(reply.summary, /capstone-team7 and portfolio-site/);
  assert.deepStrictEqual([...engine.profile.data.protected].sort(), ['capstone-team7', 'portfolio-site']);

  // A restart reads the same saved profile, so later plans still skip them and say so.
  const again = new Engine({ dataDir, apiKey: '' });
  again.scanFolder(root);
  const plan = await again.plan('Free up space');
  assert.ok(touches(plan, 'cs3140-hw1'));
  assert.ok(!touches(plan, 'capstone-team7') && !touches(plan, 'portfolio-site'));
  assert.match(plan.summary, /left out capstone-team7 and portfolio-site/);
});

test('US-04 "keep anything on my resume" asks which projects to keep, then saves the ones picked', async (t) => {
  const { root, engine } = setup(t, ['capstone-team7', 'portfolio-site', 'cs3140-hw1']);
  engine.scanFolder(root);
  const ask = await engine.plan('Keep anything on my resume');
  assert.strictEqual(ask.actions.length, 0);
  const q = ask.questions.find((x) => x.pick === 'protect');
  assert.ok(q, 'should ask which projects to keep instead of guessing');
  assert.deepStrictEqual(q.options, ['capstone-team7', 'cs3140-hw1', 'portfolio-site']);
  assert.deepStrictEqual(engine.profile.data.protected, []);

  const saved = engine.protect(['capstone-team7', 'portfolio-site']);
  assert.match(saved.summary, /capstone-team7 and portfolio-site/);
  const plan = await engine.plan('Free up space');
  assert.deepStrictEqual(plan.protected, ['capstone-team7', 'portfolio-site']);
  assert.ok(touches(plan, 'cs3140-hw1'));
});

test('US-04 a protection said inside a cleanup request is saved, and the rest of the request still runs', async (t) => {
  const { root, engine } = setup(t, ['cs3140-final', 'cs3140-hw1', 'capstone-team7']);
  engine.scanFolder(root);
  const plan = await engine.plan("Never touch cs3140-final, but I'm done with the rest of CS 3140");
  assert.deepStrictEqual(engine.profile.data.protected, ['cs3140-final']);
  assert.ok(touches(plan, 'cs3140-hw1'));
  assert.ok(!touches(plan, 'cs3140-final'));
  assert.ok(!touches(plan, 'capstone-team7'), 'only CS 3140 was named');
  assert.deepStrictEqual(plan.protected, ['cs3140-final']);
});

test('US-04 the validator rejects any action inside a protected project, wherever the plan came from', (t) => {
  const { root, engine } = setup(t, ['capstone-team7']);
  engine.profile.data.protected = ['capstone-*']; // as a restart loads it from the saved profile
  const plan = { actions: [{ id: 'a1', op: 'delete_rebuildable', path: path.join(root, 'capstone-team7', 'node_modules'), reason: 'old dependencies' }] };
  const check = validate(plan, { scan: scan(root), findings: [], profile: engine.profile, named: [], home: tempDir(t), condaExports: {} });
  assert.strictEqual(check.ok, false);
  assert.match(check.errors[0].message, /capstone-team7 is protected/);
});

test("US-04 Claude can't get around it: a protected project it proposes is rejected and left out", async (t) => {
  const root = tempDir(t);
  const keep = makeJsProject(root, 'capstone-team7');
  const old = makeJsProject(root, 'cs3140-hw1');
  const del = (id, dir) => ({ id, op: 'delete_rebuildable', path: path.join(dir, 'node_modules'), dest: '', keep: '', reason: `${path.basename(dir)}: old dependencies` });
  const bad = { summary: 'free space', questions: [], actions: [del('a1', keep), del('a2', old)] };
  const client = fakeClient([bad, bad, bad]);
  const engine = new Engine({ dataDir: tempDir(t), apiKey: '', llmClient: client });
  engine.profile.setZone(root, 'free');
  engine.profile.data.protected = ['capstone-team7'];
  engine.scanFolder(root);
  const plan = await engine.plan('Free up space');
  assert.ok(!touches(plan, 'capstone-team7'));
  assert.ok(touches(plan, 'cs3140-hw1'));
  assert.match(plan.attempts[0].errors.join('\n'), /capstone-team7 is protected/);
  assert.match(client.requests[0].messages[0].content, /protected_projects/);
  assert.match(client.requests[0].system, /protected_projects/, 'the rules tell Claude what the list means');
});

// Added after the code (no red phase). Each was checked to fail with the code it covers taken out.
test('US-04 nothing moves into a protected folder either', (t) => {
  const root = tempDir(t);
  write(path.join(root, 'notes.txt'), 'notes');
  write(path.join(root, 'portfolio', 'index.html'), '<h1>me</h1>');
  const engine = new Engine({ dataDir: tempDir(t), apiKey: '' });
  engine.profile.setZone(root, 'free');
  engine.profile.data.protected = ['portfolio'];
  const plan = { actions: [{ id: 'a1', op: 'move', path: path.join(root, 'notes.txt'), dest: path.join(root, 'portfolio'), reason: 'tidy up' }] };
  const check = validate(plan, { scan: scan(root), findings: [], profile: engine.profile, named: [], home: tempDir(t), condaExports: {} });
  assert.strictEqual(check.ok, false);
  assert.match(check.errors[0].message, /portfolio is protected .*nothing moves into it/);
});

test('US-04 protecting the scanned folder itself leaves everything in it alone, on the first try', async (t) => {
  const root = tempDir(t);
  write(path.join(root, 'CS4501_Lecture3.pdf'), 'lecture'); // would be sorted into School/CS4501
  write(path.join(root, 'Resume.pdf'), 'first draft'); // two versions: would ask what to do
  write(path.join(root, 'Resume_FINAL.pdf'), 'final draft');
  write(path.join(root, 'photo.jpg'), 'same bytes'); // a duplicate: would go to the Trash
  write(path.join(root, 'photo (1).jpg'), 'same bytes');
  write(path.join(root, 'free_vst_crack.command'), '#!/bin/sh\n'); // flagged: would be quarantined
  const engine = new Engine({ dataDir: tempDir(t), apiKey: '' });
  engine.profile.setZone(root, 'free');
  engine.profile.data.protected = [path.basename(root)];
  engine.scanFolder(root);
  assert.ok(engine.findings.length, 'the test needs a file the malware scan flags');
  const plan = await engine.plan('Organize everything and free up space');
  assert.deepStrictEqual(plan.actions, []);
  assert.ok(!plan.questions.some((q) => /versions/.test(q.text)), 'no question about files it will leave alone');
  assert.strictEqual(plan.attempts.length, 1, 'nothing was proposed and then rejected');
  assert.deepStrictEqual(plan.protected, [path.basename(root)]);
});

test('US-04 "always keep a, b" protects every project in the list', async (t) => {
  const { root, engine } = setup(t, ['capstone-team7', 'portfolio-site', 'cs3140-hw1']);
  engine.scanFolder(root);
  const reply = await engine.plan('Always keep capstone-team7, portfolio-site');
  assert.deepStrictEqual([...engine.profile.data.protected].sort(), ['capstone-team7', 'portfolio-site']);
  assert.strictEqual(reply.actions.length, 0);
});

test('US-04 with nothing here to keep, it says so instead of asking, and an empty pick saves nothing', async (t) => {
  const root = tempDir(t);
  write(path.join(root, 'notes.txt'), 'notes');
  const engine = new Engine({ dataDir: tempDir(t), apiKey: '' });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const reply = await engine.plan('Keep anything on my resume');
  assert.match(reply.summary, /didn't find any projects/);
  assert.deepStrictEqual(reply.questions, []);
  assert.throws(() => engine.protect([]), /Pick at least one/);
  assert.deepStrictEqual(engine.profile.data.protected, []);
});

test("US-04 a protected folder that isn't a code project is left alone too, on the first try", async (t) => {
  const root = tempDir(t);
  write(path.join(root, 'portfolio', 'headshot.jpg'), 'same bytes');
  write(path.join(root, 'portfolio', 'headshot copy.jpg'), 'same bytes');
  write(path.join(root, 'notes.txt'), 'other bytes');
  write(path.join(root, 'notes (1).txt'), 'other bytes');
  const engine = new Engine({ dataDir: tempDir(t), apiKey: '' });
  engine.profile.setZone(root, 'free');
  engine.profile.data.protected = ['portfolio'];
  engine.scanFolder(root);
  const plan = await engine.plan('Free up space');
  assert.ok(!touches(plan, 'portfolio'));
  assert.ok(plan.actions.some((a) => a.path.includes('notes')), 'the rest of the folder is still cleaned');
  assert.strictEqual(plan.attempts.length, 1);
  assert.deepStrictEqual(plan.protected, ['portfolio']);
});

test('US-04 a protection is a project name or a pattern, never a path', (t) => {
  const { engine } = setup(t, []);
  for (const bad of ['', '   ', '/Users/me/code/capstone', '../capstone', 'code/capstone', null]) {
    assert.throws(() => engine.profile.protect(bad), /project name/);
  }
  engine.profile.protect('capstone-*');
  engine.profile.protect('capstone-*');
  engine.profile.unprotect('not-there');
  assert.deepStrictEqual(engine.profile.data.protected, ['capstone-*']);
  assert.strictEqual(engine.profile.protectedPattern('Capstone-V2'), 'capstone-*', 'macOS names ignore case');
  assert.strictEqual(engine.profile.protectedPattern('my-capstone'), null, 'a pattern matches the whole name');
});
