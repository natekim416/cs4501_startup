// US-10 (#11) · ML model caches.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { tmp, write, age } = require('./helpers');

function hfCache(home, name, days) {
  const dir = path.join(home, '.cache', 'huggingface', 'hub', `models--${name.replace('/', '--')}`);
  write(path.join(dir, 'snapshots', 'abc', 'model.safetensors'), 'w'.repeat(64 * 1024));
  age(dir, days);
  return dir;
}

test('US-10 each cached model shows name, size, last used, and re-download time', () => {
  const { mlItems } = require('../../backend/ecosystems/ml');
  const home = tmp();
  hfCache(home, 'meta-llama/Llama-3-8B', 60);
  const [item] = mlItems({ home });
  assert.strictEqual(item.model, 'meta-llama/Llama-3-8B');
  assert.ok(item.bytes > 0 && item.lastUsed);
  assert.match(item.reason, /minutes? to re-download/);
});

test('US-10 models unused for 30 days are offered; recent ones only if named', () => {
  const { mlItems } = require('../../backend/ecosystems/ml');
  const home = tmp();
  hfCache(home, 'old/model', 45);
  hfCache(home, 'new/model', 3);
  const offered = mlItems({ home }).filter((i) => i.offered).map((i) => i.model);
  assert.deepStrictEqual(offered, ['old/model']);
  assert.ok(mlItems({ home, named: ['new/model'] }).find((i) => i.model === 'new/model').offered);
});

test('US-10 a model the user trained or saved outside the download cache is never offered', () => {
  const { mlItems } = require('../../backend/ecosystems/ml');
  const home = tmp();
  write(path.join(home, 'research', 'checkpoints', 'my-model.pt'), 'x');
  assert.ok(!mlItems({ home }).some((i) => i.path.includes('research')));
});

test('US-10 "clear old Hugging Face models" plans only the unused download, deletes it, and undo says it re-downloads', async () => {
  const fs = require('fs');
  const { Engine } = require('../../backend/engine');
  const home = tmp();
  const old = hfCache(home, 'old/model', 45);
  const fresh = hfCache(home, 'new/model', 3);
  write(path.join(home, 'research', 'checkpoints', 'my-model.pt'), 'mine');
  const folder = tmp();
  const engine = new Engine({ dataDir: tmp(), apiKey: '', home, trashDir: tmp() });
  engine.profile.setZone(folder, 'free');
  engine.profile.setZone(path.join(home, '.cache'), 'free');
  engine.scanFolder(folder);
  const plan = await engine.plan('Clear my old Hugging Face models');
  assert.deepStrictEqual(plan.actions.map((a) => a.path), [old]);
  const run = engine.execute(plan.planId, plan.actions.map((a) => a.id));
  assert.strictEqual(run.ok, true, JSON.stringify(run.errors));
  assert.ok(!fs.existsSync(old) && fs.existsSync(fresh) && fs.existsSync(path.join(home, 'research', 'checkpoints', 'my-model.pt')));
  assert.match(engine.undo().notes.join(' '), /re-downloads/);
});

test('US-10 the validator refuses a model folder the ML check didn\'t offer (recent, or not in the download cache)', () => {
  const { Engine } = require('../../backend/engine');
  const { validate } = require('../../backend/validator');
  const home = tmp();
  const fresh = hfCache(home, 'new/model', 3);
  const folder = tmp();
  const engine = new Engine({ dataDir: tmp(), apiKey: '', home, trashDir: tmp() });
  engine.profile.setZone(path.join(home, '.cache'), 'free');
  engine.scanFolder(folder);
  const res = validate({ actions: [{ id: 'a1', op: 'delete_rebuildable', path: fresh, dest: '', keep: '', reason: 'x' }] }, { scan: engine.snapshot, findings: [], profile: engine.profile, home, ml: engine.ml });
  assert.strictEqual(res.ok, false);
});

test('US-10 naming a recently used model in the request offers it, matched as a whole name, not a word inside "models"', async () => {
  const { Engine } = require('../../backend/engine');
  const home = tmp();
  const fresh = hfCache(home, 'meta-llama/Llama-3-8B', 3);
  const engine = new Engine({ dataDir: tmp(), apiKey: '', home, trashDir: tmp() });
  engine.profile.setZone(path.join(home, '.cache'), 'free');
  engine.scanFolder(tmp());
  assert.deepStrictEqual((await engine.plan('Remove the Llama-3-8B model')).actions.map((a) => a.path), [fresh]);
  assert.deepStrictEqual((await engine.plan('Clear my old models')).actions, []);
});
