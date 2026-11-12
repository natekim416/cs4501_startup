// US-10 (#11) · ML model caches.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmp, write, age } = require('./helpers');
const { mlItems, mlProof, removeMlItem, checkOpenLocks, TORCH_URLS } = require('../../backend/ecosystems/ml');
const REV = 'a'.repeat(40);

function hfCache(home, name, days) {
  const dir = path.join(home, '.cache', 'huggingface', 'hub', `models--${name.replace('/', '--')}`);
  write(path.join(dir, 'snapshots', REV, 'model.safetensors'), 'w'.repeat(64 * 1024));
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

test('US-10 the last-use signal includes access time, and scanning does not advance model access times', () => {
  const home = tmp();
  const dir = hfCache(home, 'old/model', 60);
  const payload = path.join(dir, 'snapshots', REV, 'model.safetensors');
  const before = fs.statSync(payload);
  assert.ok(mlItems({ home })[0].offered);
  assert.ok(mlItems({ home })[0].offered);
  assert.strictEqual(fs.statSync(payload).atimeMs, before.atimeMs);
  fs.utimesSync(payload, new Date(), new Date(before.mtimeMs));
  const item = mlItems({ home })[0];
  assert.strictEqual(item.offered, false);
  assert.ok(Date.parse(item.lastUsed) >= Date.now() - 10000);
});

test('US-10 naming a different model or partial model does not waive the 30-day rule', () => {
  const home = tmp();
  hfCache(home, 'new/model', 3);
  for (const named of [[], ['model'], ['new'], ['other/model']]) assert.strictEqual(mlItems({ home, named })[0].offered, false);
});

test('US-10 exact inactivity boundary is 30 days, and future/unknown dates stay unoffered', () => {
  const home = tmp();
  const dir = hfCache(home, 'old/model', 60);
  const payload = path.join(dir, 'snapshots', REV, 'model.safetensors');
  const now = Date.now();
  const boundary = new Date(now - 30 * 864e5);
  fs.utimesSync(payload, boundary, boundary);
  assert.strictEqual(mlItems({ home, now })[0].offered, true);
  assert.strictEqual(mlItems({ home, now: now - 1000 })[0].offered, false);
  fs.utimesSync(payload, new Date(now + 864e5), new Date(now + 864e5));
  assert.strictEqual(mlItems({ home, now })[0].offered, false);
});

test('US-10 removal revalidates and deletes only one exact old downloaded model', () => {
  const home = tmp();
  const old = hfCache(home, 'old/model', 60);
  const keep = hfCache(home, 'keep/model', 60);
  const outside = write(path.join(home, 'research', 'my-model.pt'), 'trained');
  assert.ok(mlProof(old, { home }).ok);
  const removed = removeMlItem(old, { home });
  assert.ok(removed.bytes > 0);
  assert.ok(!fs.existsSync(old));
  assert.ok(fs.existsSync(keep));
  assert.strictEqual(fs.readFileSync(outside, 'utf8'), 'trained');
});

test('US-10 a recently accessed model is refused at execution even if the preview was old', () => {
  const home = tmp();
  const dir = hfCache(home, 'old/model', 60);
  assert.ok(mlItems({ home })[0].offered);
  const payload = path.join(dir, 'snapshots', REV, 'model.safetensors');
  fs.utimesSync(payload, new Date(), new Date());
  assert.throws(() => removeMlItem(dir, { home }), /30 days/);
  assert.ok(fs.existsSync(dir));
  assert.ok(mlProof(dir, { home, named: ['old/model'] }).ok);
});

test('US-10 malformed cache names, cache parents, traversal, relative paths, and outside models never pass proof', () => {
  const home = tmp();
  const dir = hfCache(home, 'old/model', 60);
  const hf = path.dirname(dir);
  for (const target of [hf, path.dirname(hf), path.join(dir, 'snapshots'), `${dir}${path.sep}..${path.sep}${path.basename(dir)}`, 'models--old--model', path.join(home, 'research', 'saved.pt')]) {
    assert.strictEqual(mlProof(target, { home, named: ['old/model'] }).ok, false, target);
  }
  write(path.join(hf, 'models--..--private', 'snapshots', REV, 'x'), 'x');
  assert.ok(!mlItems({ home }).some((i) => i.model.includes('private')));
});

for (const extra of ['.env', 'id_rsa', 'private.key', 'trainer_state.json', 'optimizer.pt', 'checkpoint-100/weights.pt']) {
  test(`US-10 locally saved or secret data ${extra} blocks the entire model, even if named`, () => {
    const home = tmp();
    const dir = hfCache(home, 'old/model', 60);
    write(path.join(dir, 'snapshots', REV, extra), 'never delete');
    assert.strictEqual(mlProof(dir, { home, named: ['old/model'] }).ok, false);
    assert.throws(() => removeMlItem(dir, { home, named: ['old/model'] }));
    assert.ok(fs.existsSync(dir));
  });
}

test('US-10 incomplete downloads and download locks are retained', () => {
  const home = tmp();
  const dir = hfCache(home, 'old/model', 60);
  const incomplete = write(path.join(dir, 'blobs', 'b.incomplete'), 'x');
  assert.strictEqual(mlItems({ home, named: ['old/model'] })[0].offered, false);
  fs.unlinkSync(incomplete);
  const lock = write(path.join(path.dirname(dir), '.locks', path.basename(dir), 'download.lock'), '');
  assert.strictEqual(mlItems({ home, named: ['old/model'] })[0].offered, false);
  fs.unlinkSync(lock);
  assert.ok(mlItems({ home, named: ['old/model'] })[0].offered);
});

test('US-10 stale persistent HF lock files left after release do not block an old cached model', () => {
  const home = tmp();
  const dir = hfCache(home, 'old/model', 60);
  const locks = path.join(path.dirname(dir), '.locks', path.basename(dir));
  const lock = write(path.join(locks, `${'b'.repeat(64)}.lock`), '');
  age(locks, 60);
  const before = fs.statSync(lock);
  const [item] = mlItems({ home });
  assert.equal(item.offered, true);
  const opts = { home, checkOpenLocks: (paths) => { assert.deepEqual(paths, [lock]); return false; } };
  assert.equal(mlProof(dir, opts).ok, true);
  assert.equal(fs.statSync(lock).mtimeMs, before.mtimeMs);
  assert.equal(fs.statSync(lock).atimeMs, before.atimeMs);
  removeMlItem(dir, opts);
  assert.ok(!fs.existsSync(dir));
  assert.ok(fs.existsSync(lock), 'the app must not delete the downloader lock marker');
});

test('US-10 a renewed lock or incomplete file blocks deletion even with stale persistent locks', () => {
  const home = tmp();
  const dir = hfCache(home, 'old/model', 60);
  const locks = path.join(path.dirname(dir), '.locks', path.basename(dir));
  const lock = write(path.join(locks, `${'b'.repeat(64)}.lock`), '');
  age(locks, 60);
  const partial = write(path.join(dir, 'blobs', `${'b'.repeat(64)}.1234abcd.incomplete`), 'still downloading');
  assert.equal(mlProof(dir, { home, named: ['old/model'] }).ok, false);
  fs.unlinkSync(partial);
  fs.utimesSync(lock, new Date(), new Date());
  assert.equal(mlProof(dir, { home, named: ['old/model'] }).ok, false);
  assert.ok(fs.existsSync(dir));
});

test('US-10 unreadable or unfamiliar lock metadata does not get mistaken for a released lock', () => {
  const home = tmp();
  const dir = hfCache(home, 'old/model', 60);
  const locks = path.join(path.dirname(dir), '.locks', path.basename(dir));
  const lock = write(path.join(locks, 'download.lock'), 'holder metadata');
  age(locks, 60);
  assert.equal(mlItems({ home, named: ['old/model'] })[0].offered, false);
  fs.writeFileSync(lock, '');
  age(locks, 60);
  const original = fs.readdirSync;
  try {
    fs.readdirSync = (p, ...args) => {
      if (p === locks) throw Object.assign(new Error('denied'), { code: 'EACCES' });
      return original(p, ...args);
    };
    assert.equal(mlItems({ home, named: ['old/model'] })[0].offered, false);
  } finally { fs.readdirSync = original; }
});

test('US-10 a stale marker can still be actively held; ambiguous or unavailable open-file checks refuse deletion', () => {
  const home = tmp();
  const dir = hfCache(home, 'old/model', 60);
  const locks = path.join(path.dirname(dir), '.locks', path.basename(dir));
  write(path.join(locks, `${'b'.repeat(64)}.lock`), '');
  age(locks, 60);
  assert.equal(mlItems({ home })[0].offered, true, 'inventory alone cannot know lock ownership');
  for (const probe of [() => true, () => null, () => undefined, () => { throw new Error('not installed'); }]) {
    assert.equal(mlProof(dir, { home, named: ['old/model'], checkOpenLocks: probe }).ok, false);
  }
  assert.ok(fs.existsSync(dir));
});

test('US-10 new download activity during the open-lock query is rechecked before deletion', () => {
  const home = tmp();
  const dir = hfCache(home, 'old/model', 60);
  const locks = path.join(path.dirname(dir), '.locks', path.basename(dir));
  write(path.join(locks, `${'b'.repeat(64)}.lock`), '');
  age(locks, 60);
  const proof = mlProof(dir, { home, checkOpenLocks: () => {
    write(path.join(locks, 'new-download.lock'), '');
    return false;
  } });
  assert.equal(proof.ok, false);
  assert.ok(fs.existsSync(dir));
});

test('US-10 lsof probes exact paths without a shell and distinguishes no references from errors', () => {
  const lock = path.join(tmp(), 'a lock.lock');
  assert.equal(checkOpenLocks([lock], { run: (_cmd, args, opts) => {
    assert.deepEqual(args, ['-n', '-P', '-F', 'p', '--', lock]);
    assert.equal(opts.timeout, 5000);
    throw { status: 1, stdout: '', stderr: '' };
  } }), false);
  assert.equal(checkOpenLocks([lock], { run: () => 'p123\n' }), true);
  assert.equal(checkOpenLocks([lock], { run: () => { throw { status: 1, stdout: 'p123\n', stderr: '' }; } }), true);
  for (const run of [() => '', () => 'unrecognized output', () => { throw { status: 1, stdout: '', stderr: 'permission denied' }; }, () => { throw { code: 'ENOENT' }; }]) {
    assert.throws(() => checkOpenLocks([lock], { run }));
  }
});

test('US-10 macOS checks a real released versus open persistent lock without changing it', { skip: process.platform !== 'darwin' }, () => {
  const home = tmp();
  const dir = hfCache(home, 'old/model', 60);
  const locks = path.join(path.dirname(dir), '.locks', path.basename(dir));
  const lock = write(path.join(locks, `${'b'.repeat(64)}.lock`), '');
  age(locks, 60);
  const before = fs.statSync(lock);
  assert.equal(mlProof(dir, { home }).ok, true);
  const fd = fs.openSync(lock, 'r');
  try { assert.equal(mlProof(dir, { home }).ok, false); }
  finally { fs.closeSync(fd); }
  assert.equal(fs.statSync(lock).mtimeMs, before.mtimeMs);
  assert.equal(fs.statSync(lock).atimeMs, before.atimeMs);
  assert.equal(mlProof(dir, { home }).ok, true);
});

test('US-10 arbitrary files in a model folder are measured but never offered', () => {
  const home = tmp();
  const dir = hfCache(home, 'old/model', 60);
  write(path.join(dir, 'my-own-training-results.txt'), 'keep');
  const item = mlItems({ home, named: ['old/model'] })[0];
  assert.strictEqual(item.offered, false);
  assert.strictEqual(item.label, 'unknown');
  assert.ok(item.bytes > 65536);
});

test('US-10 Hugging Face snapshots may point to blobs within the same model, without double counting', (t) => {
  const home = tmp();
  const dir = hfCache(home, 'old/model', 60);
  const payload = path.join(dir, 'snapshots', REV, 'model.safetensors');
  fs.unlinkSync(payload);
  const blob = write(path.join(dir, 'blobs', 'b'.repeat(64)), 'w'.repeat(1024));
  try { fs.symlinkSync(path.relative(path.dirname(payload), blob), payload, 'file'); }
  catch (err) { if (err.code === 'EPERM') return t.skip('Windows does not permit file symlinks'); throw err; }
  const when = new Date(Date.now() - 60 * 864e5);
  fs.utimesSync(blob, when, when);
  const [item] = mlItems({ home });
  assert.ok(item.offered);
  assert.strictEqual(item.bytes, 1024);
  assert.ok(mlProof(dir, { home }).ok);
});

test('US-10 valid snapshot links work through an OS-level alias above home, while outside blobs stay refused', (t) => {
  const base = tmp();
  const realHome = path.join(base, 'home');
  fs.mkdirSync(realHome);
  const dir = hfCache(realHome, 'old/model', 60);
  const payload = path.join(dir, 'snapshots', REV, 'model.safetensors');
  fs.unlinkSync(payload);
  const blob = write(path.join(dir, 'blobs', 'b'.repeat(64)), 'w'.repeat(1024));
  const alias = path.join(tmp(), 'os-alias');
  try {
    fs.symlinkSync(path.relative(path.dirname(payload), blob), payload, 'file');
    fs.symlinkSync(base, alias, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (err) { if (err.code === 'EPERM') return t.skip('Windows symlinks unavailable'); throw err; }
  const when = new Date(Date.now() - 60 * 864e5);
  fs.utimesSync(blob, when, when);
  const home = path.join(alias, 'home');
  const cache = path.join(home, '.cache', 'huggingface', 'hub', path.basename(dir));
  assert.ok(mlItems({ home })[0].offered);
  assert.ok(mlProof(cache, { home }).ok);
  const outside = write(path.join(realHome, 'research', 'trained.pt'), 'precious');
  fs.unlinkSync(payload);
  fs.symlinkSync(outside, payload, 'file');
  assert.equal(mlProof(cache, { home, named: ['old/model'] }).ok, false);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'precious');
});

test('US-10 links to outside data, shared blobs, and symlinked cache roots are never followed for removal', (t) => {
  const home = tmp();
  const dir = hfCache(home, 'old/model', 60);
  const outside = write(path.join(home, 'research', 'trained.pt'), 'precious');
  const link = path.join(dir, 'snapshots', REV, 'outside.pt');
  try { fs.symlinkSync(outside, link, 'file'); }
  catch (err) { if (err.code === 'EPERM') return t.skip('Windows does not permit file symlinks'); throw err; }
  assert.strictEqual(mlProof(dir, { home, named: ['old/model'] }).ok, false);
  assert.ok(fs.existsSync(outside));
  const linkedHome = tmp();
  fs.mkdirSync(path.join(linkedHome, '.cache', 'huggingface'), { recursive: true });
  fs.symlinkSync(path.dirname(dir), path.join(linkedHome, '.cache', 'huggingface', 'hub'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.deepStrictEqual(mlItems({ home: linkedHome }), []);
  assert.strictEqual(mlProof(path.join(linkedHome, '.cache', 'huggingface', 'hub', path.basename(dir)), { home: linkedHome, named: ['old/model'] }).ok, false);
});

test('US-10 PyTorch checkpoints with no proven download source stay visible but never offered', () => {
  const home = tmp();
  const file = write(path.join(home, '.cache', 'torch', 'hub', 'checkpoints', 'my-trained-model.pth'), 'trained locally');
  age(path.dirname(file), 60);
  const [item] = mlItems({ home, named: ['my-trained-model.pth'] });
  assert.strictEqual(item.bytes, 'trained locally'.length);
  assert.strictEqual(item.offered, false);
  assert.match(item.reason, /cannot be proven/);
  assert.strictEqual(mlProof(file, { home, named: [item.model] }).ok, false);
});

test('US-10 PyTorch requires matching official content hash before removing a recognized download', () => {
  const home = tmp();
  const file = write(path.join(home, '.cache', 'torch', 'hub', 'checkpoints', 'resnet18-f37072fd.pth'), 'not the real model');
  age(path.dirname(file), 60);
  const refused = mlProof(file, { home, named: [path.basename(file)] });
  assert.strictEqual(refused.ok, false);
  assert.match(refused.failures[0].message, /do not match the official download hash/);
  const accepted = mlProof(file, { home, named: [path.basename(file)], hash: () => `f37072fd${'0'.repeat(56)}` });
  assert.ok(accepted.ok);
  assert.strictEqual(accepted.item.downloadUrl, TORCH_URLS[path.basename(file)]);
  assert.strictEqual(accepted.recipe.command, null);
  assert.match(accepted.recipe.note, /download\.pytorch\.org/);
});

test('US-10 listing caches never invokes a command or reads user-created checkpoints outside them', () => {
  const home = tmp();
  write(path.join(home, 'models', 'trained.pt'), 'secret');
  assert.deepStrictEqual(mlItems({ home }), []);
});

test('US-10 unfamiliar revisions and unreadable cache entries remain visible but never offered', () => {
  const home = tmp();
  const dir = hfCache(home, 'old/model', 60);
  fs.renameSync(path.join(dir, 'snapshots', REV), path.join(dir, 'snapshots', 'not-a-download-revision'));
  assert.equal(mlItems({ home, named: ['old/model'] })[0].offered, false);
  const original = fs.readdirSync;
  try {
    fs.readdirSync = (p, ...args) => {
      if (p === path.join(dir, 'snapshots')) throw Object.assign(new Error('denied'), { code: 'EACCES' });
      return original(p, ...args);
    };
    const item = mlItems({ home, named: ['old/model'] })[0];
    assert.equal(item.offered, false);
    assert.equal(mlProof(dir, { home, named: ['old/model'] }).ok, false);
  } finally { fs.readdirSync = original; }
});

test('US-10 deeply nested cache data is refused before an unbounded verification walk', () => {
  const home = tmp();
  const dir = hfCache(home, 'old/model', 60);
  write(path.join(dir, 'snapshots', REV, ...Array(65).fill('d'), 'x'), 'x');
  const item = mlItems({ home, named: ['old/model'] })[0];
  assert.equal(item.offered, false);
  assert.match(item.reason, /too large or deep/);
});

test('US-10 hard-linked weights outside a model are never counted as reclaimable space', () => {
  const home = tmp();
  const dir = hfCache(home, 'old/model', 60);
  const payload = path.join(dir, 'snapshots', REV, 'model.safetensors');
  fs.linkSync(payload, path.join(home, 'kept-copy'));
  assert.equal(mlItems({ home })[0].bytes, 0);
  removeMlItem(dir, { home });
  assert.equal(fs.statSync(path.join(home, 'kept-copy')).size, 65536);
});

test('US-10 repeated proof does not rehash unchanged PyTorch weights, but a modified file is rechecked', () => {
  const home = tmp();
  const file = write(path.join(home, '.cache', 'torch', 'hub', 'checkpoints', 'resnet18-f37072fd.pth'), 'not the real model');
  const original = fs.readSync;
  let reads = 0;
  try {
    fs.readSync = (...args) => { reads++; return original(...args); };
    const opts = { home, named: [path.basename(file)] };
    assert.equal(mlProof(file, opts).ok, false);
    assert.ok(reads > 0);
    const first = reads;
    assert.equal(mlProof(file, opts).ok, false);
    assert.equal(reads, first);
    fs.writeFileSync(file, 'modified checkpoint');
    assert.equal(mlProof(file, opts).ok, false);
    assert.ok(reads > first);
  } finally { fs.readSync = original; }
});
