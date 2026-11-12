// US-30 · Permanently delete what's already in the Trash, only after I confirm, and nothing else.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmp, write } = require('./helpers');
const { Engine } = require('../../backend/engine');
const { Executor } = require('../../backend/executor');
const { validate } = require('../../backend/validator');
const { PLAN_SCHEMA, makePlan } = require('../../backend/planner');

function setup() {
  const folder = tmp();
  write(path.join(folder, 'notes.txt'), 'keep me');
  const trash = tmp();
  write(path.join(trash, 'old portfolio.mov'), 'x'.repeat(200000));
  write(path.join(trash, 'Old Project', 'a.js'), 'x'.repeat(5000));
  const engine = new Engine({ dataDir: tmp(), apiKey: '', home: tmp(), trashDir: trash });
  engine.profile.setZone(folder, 'free');
  engine.scanFolder(folder);
  return { folder, trash, engine };
}

const del = (id, p) => ({ id, op: 'delete_from_trash', path: p, dest: '', keep: '', reason: 'already in the Trash' });

test('US-30 "empty my trash" plans a permanent delete for each item in the Trash, every one unchecked with a warning', async () => {
  const { trash, engine } = setup();
  const plan = await engine.plan('Empty my trash');
  const ops = plan.actions.filter((a) => a.op === 'delete_from_trash');
  assert.deepStrictEqual(ops.map((a) => path.basename(a.path)).sort(), ['Old Project', 'old portfolio.mov']);
  assert.ok(ops.every((a) => path.dirname(a.path) === trash), 'only top-level Trash items');
  assert.ok(ops.every((a) => a.checked === false && /permanent/i.test(a.note)), JSON.stringify(ops));
  assert.ok(plan.actions.every((a) => a.op === 'delete_from_trash'), 'nothing outside the Trash');
});

test('US-30 the validator rejects permanent deletes outside the Trash, escapes like "..", and the Trash folder itself (edge cases)', () => {
  const { folder, trash, engine } = setup();
  const ctx = { scan: engine.snapshot, findings: [], profile: engine.profile, home: engine.home, trashDir: trash };
  const outside = validate({ actions: [del('a1', path.join(folder, 'notes.txt'))] }, ctx);
  assert.strictEqual(outside.ok, false);
  assert.match(outside.errors[0].message, /only items already in the Trash/i);
  assert.strictEqual(validate({ actions: [del('a2', path.join(trash, '..', path.basename(folder), 'notes.txt'))] }, ctx).ok, false);
  assert.strictEqual(validate({ actions: [del('a3', trash)] }, ctx).ok, false);
  assert.strictEqual(validate({ actions: [del('a4', path.join(trash, 'missing.mov'))] }, ctx).ok, false);
  const inside = validate({ actions: [del('a5', path.join(trash, 'old portfolio.mov'))] }, ctx);
  assert.strictEqual(inside.ok, true, JSON.stringify(inside.errors));
  assert.ok(inside.needsApproval.includes('a5'), 'always asks');
});

test('US-30 approving without the confirmation deletes nothing; confirming deletes for real, and undo says it cannot bring it back', async () => {
  const { trash, engine } = setup();
  const plan = await engine.plan('Empty my trash');
  const ids = plan.actions.map((a) => a.id);
  const refused = engine.execute(plan.planId, ids);
  assert.strictEqual(refused.ok, false);
  assert.match(refused.errors.join(' '), /confirm/i);
  assert.ok(fs.existsSync(path.join(trash, 'old portfolio.mov')), 'nothing deleted without confirmation');

  const again = await engine.plan('Empty my trash');
  const done = engine.execute(again.planId, again.actions.map((a) => a.id), { confirmPermanent: true });
  assert.strictEqual(done.ok, true, JSON.stringify(done.errors));
  assert.deepStrictEqual(fs.readdirSync(trash), []);
  const undo = engine.undo();
  assert.strictEqual(undo.undone, 0);
  assert.ok(!fs.existsSync(path.join(trash, 'old portfolio.mov')));
});

test('US-30 the executor itself refuses a permanent delete outside the Trash, even if the validator were skipped', () => {
  const folder = tmp();
  const victim = write(path.join(folder, 'thesis.docx'), 'irreplaceable');
  const ex = new Executor(tmp(), { trashDir: tmp() });
  const run = ex.run([del('a1', victim)]);
  assert.strictEqual(run.results[0].ok, false);
  assert.ok(fs.existsSync(victim));
});

test('US-30 with Claude, the Trash contents are in the request and delete_from_trash is an allowed action', async () => {
  const { trash, engine } = setup();
  const requests = [];
  const client = { beta: { messages: { create: async (req) => { requests.push(req); return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ summary: 's', actions: [], questions: [] }) }] }; } } } };
  await makePlan({ request: 'Empty my trash', scan: engine.snapshot, dev: [], findings: [], profile: engine.profile, trashItems: engine.trashItems, client });
  assert.match(requests[0].messages[0].content, /trash_items/);
  assert.match(requests[0].messages[0].content, /old portfolio\.mov/);
  assert.ok(PLAN_SCHEMA.properties.actions.items.properties.op.enum.includes('delete_from_trash'));
  assert.match(requests[0].system, /delete_from_trash/);
  assert.ok(trash);
});
