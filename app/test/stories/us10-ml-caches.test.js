// US-10 (#11) · ML model caches.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { tmp, write, age } = require('./helpers');
const TODO = { todo: 'US-10 (#11): ML cache cleanup not built yet' };

function hfCache(home, name, days) {
  const dir = path.join(home, '.cache', 'huggingface', 'hub', `models--${name.replace('/', '--')}`);
  write(path.join(dir, 'snapshots', 'abc', 'model.safetensors'), 'w'.repeat(64 * 1024));
  age(dir, days);
  return dir;
}

test('US-10 each cached model shows name, size, last used, and re-download time', TODO, () => {
  const { mlItems } = require('../../backend/ecosystems/ml');
  const home = tmp();
  hfCache(home, 'meta-llama/Llama-3-8B', 60);
  const [item] = mlItems({ home });
  assert.strictEqual(item.model, 'meta-llama/Llama-3-8B');
  assert.ok(item.bytes > 0 && item.lastUsed);
  assert.match(item.reason, /minutes? to re-download/);
});

test('US-10 models unused for 30 days are offered; recent ones only if named', TODO, () => {
  const { mlItems } = require('../../backend/ecosystems/ml');
  const home = tmp();
  hfCache(home, 'old/model', 45);
  hfCache(home, 'new/model', 3);
  const offered = mlItems({ home }).filter((i) => i.offered).map((i) => i.model);
  assert.deepStrictEqual(offered, ['old/model']);
  assert.ok(mlItems({ home, named: ['new/model'] }).find((i) => i.model === 'new/model').offered);
});

test('US-10 a model the user trained or saved outside the download cache is never offered', TODO, () => {
  const { mlItems } = require('../../backend/ecosystems/ml');
  const home = tmp();
  write(path.join(home, 'research', 'checkpoints', 'my-model.pt'), 'x');
  assert.ok(!mlItems({ home }).some((i) => i.path.includes('research')));
});
