// US-10 end to end: the planner, both safety gates, executor, and undo. Never real caches.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { Engine } = require('../backend/engine');
const { tmp, write, age } = require('./stories/helpers');

const REV = 'a'.repeat(40);
function fixture({ recent = false, llm = false } = {}) {
  const home = tmp();
  const root = path.join(home, 'Downloads');
  fs.mkdirSync(root);
  const model = 'org/model';
  const cache = path.join(home, '.cache', 'huggingface', 'hub', 'models--org--model');
  const payload = write(path.join(cache, 'snapshots', REV, 'weights.safetensors'), 'x'.repeat(4096));
  age(cache, recent ? 3 : 60);
  const action = { id: 'ml1', op: 'remove_ml_model', path: cache, dest: '', keep: '', reason: 'Downloaded model.' };
  const llmClient = llm ? { beta: { messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ summary: 'Model cleanup', actions: [action], questions: [] }) }] }) } } } : null;
  const engine = new Engine({ dataDir: tmp(), home, apiKey: '', llmClient,
    dockerRun: () => { throw new Error('Docker unavailable'); }, xcodeRun: () => { throw new Error('No Xcode'); }, diskFree: () => 1000000 });
  engine.profile.setZone(root, 'free');
  engine.openFolder(root);
  return { engine, home, root, model, cache, payload, action };
}

test('ML-INTEGRATION scan lists metadata and a cleanup preview leaves every model file untouched', async () => {
  const { engine, root, cache, payload } = fixture();
  const before = fs.statSync(payload);
  const info = engine.openFolder(root);
  assert.equal(info.modelCaches[0].model, 'org/model');
  assert.equal(info.modelCaches[0].bytes, 4096);
  const plan = await engine.plan('Clean model caches');
  assert.deepEqual(plan.actions.filter((a) => a.op === 'remove_ml_model').map((a) => a.path), [cache]);
  assert.ok(plan.needsApproval.includes(plan.actions[0].id));
  assert.equal(engine.executor.history.length, 0);
  assert.equal(fs.statSync(payload).mtimeMs, before.mtimeMs);
  assert.equal(fs.statSync(payload).atimeMs, before.atimeMs);
});

test('ML-INTEGRATION approved old cache is removed, and Undo honestly explains downloading it again', async () => {
  const { engine, cache } = fixture();
  const plan = await engine.plan('Clean model caches');
  const result = engine.execute(plan.planId, plan.actions.map((a) => a.id));
  assert.equal(result.ok, true);
  assert.ok(!fs.existsSync(cache));
  const undo = engine.undo();
  assert.equal(undo.undone, 0);
  assert.equal(undo.needsRebuild.length, 0);
  assert.match(undo.notes.join(' '), /downloads again.*Hugging Face/i);
});

test('ML-INTEGRATION recent models need their exact name, never just a partial name', async () => {
  const { engine, cache } = fixture({ recent: true });
  for (const request of ['Clean model caches', 'Clean model', 'Clean org']) {
    const plan = await engine.plan(request);
    assert.ok(!plan.actions.some((a) => a.op === 'remove_ml_model'), request);
  }
  const named = await engine.plan('Clean model cache org/model');
  assert.ok(named.actions.some((a) => a.path === cache));
  assert.ok(fs.existsSync(cache));
});

test('ML-INTEGRATION the validator rejects an LLM trying to clean a recent model the user did not name', async () => {
  const { engine, cache } = fixture({ recent: true, llm: true });
  const plan = await engine.plan('Clean model caches');
  assert.ok(plan.attempts.every((a) => a.ok === false));
  assert.deepEqual(plan.actions, []);
  assert.ok(fs.existsSync(cache));
});

test('ML-INTEGRATION a normal sorting request cannot expand into cleaning model caches', async () => {
  const { engine, cache } = fixture({ llm: true });
  const plan = await engine.plan('Sort my lecture notes');
  assert.deepEqual(plan.actions, []);
  assert.match(plan.attempts[0].errors.join(' '), /not requested/);
  assert.ok(fs.existsSync(cache));
});

test('ML-INTEGRATION sorting notes about models still cannot authorize model deletion', async () => {
  const { engine, cache } = fixture({ llm: true });
  const plan = await engine.plan('Sort my model notes');
  assert.deepEqual(plan.actions, []);
  assert.ok(fs.existsSync(cache));
});

test('ML-INTEGRATION a model explicitly kept in the request never becomes eligible by mentioning its name', async () => {
  const { engine, cache } = fixture({ recent: true });
  const plan = await engine.plan('Clean model caches, but keep org/model');
  assert.ok(!plan.actions.some((a) => a.path === cache));
  assert.ok(fs.existsSync(cache));
});

test('ML-INTEGRATION keeping one old model still permits previewing a different old model', async () => {
  const { engine, home, cache } = fixture();
  const other = path.join(home, '.cache', 'huggingface', 'hub', 'models--other--download');
  write(path.join(other, 'snapshots', REV, 'weights.safetensors'), 'other');
  age(other, 60);
  const plan = await engine.plan('Clean model caches, but keep org/model');
  assert.ok(!plan.actions.some((a) => a.path === cache));
  assert.ok(plan.actions.some((a) => a.path === other));
  assert.ok(fs.existsSync(cache) && fs.existsSync(other));
});

test('ML-INTEGRATION a newly used model is refused between preview and approval', async () => {
  const { engine, cache, payload } = fixture();
  const plan = await engine.plan('Clean model caches');
  fs.utimesSync(payload, new Date(), new Date());
  const result = engine.execute(plan.planId, plan.actions.map((a) => a.id));
  assert.equal(result.ok, false);
  assert.ok(fs.existsSync(cache));
});

test('ML-INTEGRATION changing a model to NEVER after preview prevents execution', async () => {
  const { engine, cache } = fixture();
  const plan = await engine.plan('Clean model caches');
  engine.profile.setZone(cache, 'never');
  const result = engine.execute(plan.planId, plan.actions.map((a) => a.id));
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /NEVER/);
  assert.ok(fs.existsSync(cache));
});

test('ML-INTEGRATION secrets or local training files added after preview stop execution', async () => {
  const { engine, cache } = fixture();
  const plan = await engine.plan('Clean model caches');
  const file = write(path.join(cache, 'snapshots', REV, 'optimizer.pt'), 'cannot download this again');
  const result = engine.execute(plan.planId, plan.actions.map((a) => a.id));
  assert.equal(result.ok, false);
  assert.equal(fs.readFileSync(file, 'utf8'), 'cannot download this again');
});

test('ML-INTEGRATION the LLM cannot use the model op to delete a project checkpoint outside the cache', async () => {
  const { engine, home, cache, action } = fixture({ llm: true });
  const precious = write(path.join(home, 'research', 'trained.pt'), 'irreplaceable');
  action.path = precious;
  const plan = await engine.plan('Clean model caches');
  assert.deepEqual(plan.actions, []);
  assert.equal(fs.readFileSync(precious, 'utf8'), 'irreplaceable');
  assert.ok(fs.existsSync(cache));
});

test('ML-INTEGRATION external-link substitution after preview leaves outside data intact', async (t) => {
  const { engine, home, cache } = fixture();
  const plan = await engine.plan('Clean model caches');
  const precious = write(path.join(home, 'research', 'trained.pt'), 'irreplaceable');
  const link = path.join(cache, 'snapshots', REV, 'outside.pt');
  try { fs.symlinkSync(precious, link, 'file'); }
  catch (err) { if (err.code === 'EPERM') return t.skip('Windows file symlinks unavailable'); throw err; }
  const result = engine.execute(plan.planId, plan.actions.map((a) => a.id));
  assert.equal(result.ok, false);
  assert.equal(fs.readFileSync(precious, 'utf8'), 'irreplaceable');
});
