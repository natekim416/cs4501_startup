// US-10. Inspect only documented download-cache locations, never project checkpoints.
// HF layout: https://huggingface.co/docs/huggingface_hub/guides/manage-cache
// Torch's checkpoint cache has no provenance manifest. Only these official URLs, plus a
// matching content hash, are enough evidence to remove a Torch file.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const DAY = 864e5;
const INACTIVE_DAYS = 30;
const TORCH_URLS = Object.freeze(Object.fromEntries([
  'resnet18-f37072fd.pth', 'resnet34-b627a593.pth', 'resnet50-0676ba61.pth',
  'resnet50-11ad3fa6.pth', 'resnet101-63fe2227.pth', 'resnet152-394f9c45.pth',
].map((file) => [file, `https://download.pytorch.org/models/${file}`])));
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SECRET = /^(?:\.env(?:\..*)?|\.git|\.npmrc|\.netrc|credentials(?:\.json)?|id_(?:rsa|ed25519)|.*\.(?:pem|key|p12|pfx))$/i;
const TRAINING = /^(?:checkpoint(?:[-_].*)?|optimizer(?:\..*)?|scheduler(?:\..*)?|trainer_state\.json|training_args\.bin|rng_state(?:\..*)?)$/i;

function roots(home) {
  return { hf: path.join(home, '.cache', 'huggingface', 'hub'), torch: path.join(home, '.cache', 'torch', 'hub', 'checkpoints') };
}
function inside(p, root) {
  const rel = path.relative(path.resolve(root), path.resolve(p));
  return !rel || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
}
function list(p) {
  try { return fs.readdirSync(p).sort(); } catch { return []; }
}
function stat(p) {
  try { return fs.lstatSync(p); } catch { return null; }
}
// Reject symlinked cache roots and parents. A cache moved to another disk needs explicit support;
// following it silently could turn a cache cleanup into deleting a user's project folder.
function safeChain(home, target) {
  if (!inside(target, home)) return false;
  const parts = path.relative(path.resolve(home), path.resolve(target)).split(path.sep).filter(Boolean);
  let p = path.resolve(home);
  for (const part of ['', ...parts]) {
    if (part) p = path.join(p, part);
    const s = stat(p);
    if (!s || s.isSymbolicLink()) return false;
  }
  return true;
}
function validModel(name) {
  const parts = name.slice('models--'.length).split('--');
  return parts.length >= 1 && parts.length <= 2 && parts.every((p) => SAFE_ID.test(p) && !p.includes('..')) ? parts.join('/') : null;
}

function downloadLockIssue(home, hf, name, now) {
  const locks = path.join(hf, '.locks', name);
  // Native filelock on Unix retains its empty .lock files after release. Their presence alone
  // does not mean a download is active. Never acquire, truncate, or remove these lock markers.
  // Fresh markers remain conservative: a downloader may have acquired its lock just before
  // creating an .incomplete file. Old incomplete payloads are also always retained below.
  try { fs.lstatSync(locks); }
  catch (err) { return err.code === 'ENOENT' ? null : 'download-lock metadata is unreadable'; }
  if (!safeChain(home, locks) || !stat(locks)?.isDirectory()) return 'download-lock metadata is linked or unreadable';
  let entries;
  try { entries = fs.readdirSync(locks); } catch { return 'download-lock metadata is unreadable'; }
  if (entries.length > 100000) return 'too many download-lock markers to verify safely';
  for (const entry of entries) {
    const s = stat(path.join(locks, entry));
    if (!s?.isFile() || s.isSymbolicLink() || !/\.lock$/i.test(entry) || s.size !== 0) return 'unrecognized download-lock metadata';
    if (!Number.isFinite(s.mtimeMs) || now - s.mtimeMs < DAY) return 'recent download-lock activity; a download may still be in progress';
  }
  return null;
}

// Read-only check: listing open descriptors never acquires or rewrites an HF lock. lsof's
// documented exit 1 with no output means no open references; diagnostics are not that result.
function checkOpenLocks(paths, { run = execFileSync } = {}) {
  if (!paths.length) return false;
  if (paths.length > 256 || paths.join('').length > 32768) throw new Error('Too many download locks to check safely.');
  let stdout;
  try {
    stdout = run(process.platform === 'darwin' ? '/usr/sbin/lsof' : 'lsof', ['-n', '-P', '-F', 'p', '--', ...paths], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000, maxBuffer: 1024 * 1024,
    });
  } catch (err) {
    const out = String(err.stdout || '').trim();
    const errors = String(err.stderr || '').trim();
    if (/^p\d+$/m.test(out)) return true;
    if (err.status === 1 && !out && !errors) return false;
    throw new Error('Could not verify whether a model download lock is still in use.');
  }
  if (/^p\d+$/m.test(String(stdout))) return true;
  throw new Error('The download-lock status was ambiguous.');
}

// Access time is the filesystem's best available last-use signal, not application telemetry.
// Inspecting file metadata does not read the model weights or advance their access times.
function inspectHf(dir) {
  let newest = 0;
  let payloads = 0;
  let invalid = null;
  const top = list(dir);
  if (!top.includes('snapshots')) invalid = 'no downloaded snapshot/revision was found';
  if (top.some((n) => !['snapshots', 'blobs', 'refs', '.no_exist'].includes(n))) invalid = 'contains files outside the download-cache layout';
  const snapshots = path.join(dir, 'snapshots');
  if (!safeChain(dir, snapshots)) invalid = 'snapshot folder is a link or unreadable';
  const revisions = list(snapshots);
  if (!revisions.length || revisions.some((n) => !/^[a-f0-9]{40,64}$/i.test(n))) invalid = 'cannot identify a downloaded model revision';
  const stack = [{ p: dir, depth: 0 }];
  const inodes = new Map();
  const bytes = () => [...inodes.values()].reduce((n, f) => n + (f.inside >= f.nlink ? f.size : 0), 0);
  let seen = 0;
  while (stack.length) {
    const { p, depth } = stack.pop();
    const s = stat(p);
    if (!s) { invalid = 'a cache entry is unreadable'; continue; }
    if (++seen > 100000 || depth > 64) return { newest, bytes: bytes(), invalid: 'cache is too large or deep to verify safely in one scan' };
    if (p !== dir && (SECRET.test(path.basename(p)) || TRAINING.test(path.basename(p)))) invalid = 'contains secrets or locally trained checkpoint data';
    if (s.isSymbolicLink()) {
      let real;
      try { real = fs.realpathSync(p); } catch { invalid = 'contains a broken download link'; continue; }
      // Normal HF snapshot symlinks point to this model's blobs. Shared-Xet blobs outside
      // the model directory are deliberately retained until their reference accounting is supported.
      let regular = false;
      try { regular = fs.statSync(real).isFile(); } catch { /* Changed during inspection: refuse it. */ }
      if (!inside(p, snapshots) || !inside(real, path.join(dir, 'blobs')) || !regular) invalid = 'contains a link outside this model cache';
    } else if (s.isDirectory()) {
      let entries;
      try { entries = fs.readdirSync(p); } catch { invalid = 'a cache folder is unreadable'; continue; }
      if (entries.length > 100000 || stack.length + entries.length > 100000) return { newest, bytes: bytes(), invalid: 'cache is too large to verify safely in one scan' };
      for (const name of entries) stack.push({ p: path.join(p, name), depth: depth + 1 });
    } else if (s.isFile()) {
      if (/\.incomplete$|\.lock$/i.test(p)) invalid = 'a download is still in progress';
      const key = `${s.dev}:${s.ino}`;
      const recorded = inodes.get(key) || { size: s.size, nlink: s.nlink, inside: 0 };
      recorded.inside++;
      inodes.set(key, recorded);
      if (inside(p, snapshots) || inside(p, path.join(dir, 'blobs'))) {
        newest = Math.max(newest, s.atimeMs, s.mtimeMs);
        payloads++;
      }
    } else invalid = 'contains an unsupported filesystem entry';
  }
  if (!payloads) invalid = 'no downloaded model files were found';
  return { newest, bytes: bytes(), invalid };
}

function itemFor({ dir, model, source, bytes, newest, invalid, now, named, downloadUrl = null }) {
  const recent = !Number.isFinite(newest) || newest <= 0 || now - newest < INACTIVE_DAYS * DAY;
  const explicitlyNamed = named.includes(model);
  const minutes = Math.max(1, Math.ceil(bytes / (10e6 * 60)));
  const note = source === 'huggingface'
    ? `${model} downloads again from Hugging Face when you load it. Private, gated, removed, or changed models may need access or may no longer be available.`
    : `${model} downloads again from ${downloadUrl || 'its original source'} when loaded.`;
  const offered = !invalid && (!recent || explicitlyNamed);
  const why = invalid ? `Not offered: ${invalid}.` : recent && !explicitlyNamed ? 'Used in the last 30 days; name this exact model to include it.' : 'Downloaded model cache; it can be downloaded again.';
  return {
    id: dir, type: 'ml-model', source, path: dir, project: null, model, name: model,
    bytes, lastUsed: newest > 0 ? new Date(newest).toISOString() : null,
    estimatedDownloadMinutes: minutes, offered, label: invalid ? 'unknown' : 'rebuildable',
    reason: `${model}: ${why} About ${minutes} minute${minutes === 1 ? '' : 's'} to re-download at 10 MB/s (estimate; your connection may differ). ${note}`,
    rebuild: { command: null, cwd: path.dirname(dir), note },
    ...(downloadUrl && { downloadUrl }),
  };
}

function mlItems({ home = os.homedir(), now = Date.now(), named = [] } = {}) {
  const { hf, torch } = roots(home);
  const items = [];
  if (safeChain(home, hf)) for (const name of list(hf)) {
    if (!name.startsWith('models--')) continue;
    const dir = path.join(hf, name);
    if (!safeChain(home, dir) || !stat(dir)?.isDirectory()) continue;
    const model = validModel(name);
    if (!model) continue;
    const info = inspectHf(dir);
    const lockIssue = downloadLockIssue(home, hf, name, now);
    if (lockIssue) info.invalid = lockIssue;
    items.push(itemFor({ dir, model, source: 'huggingface', ...info, now, named }));
  }
  if (safeChain(home, torch)) for (const name of list(torch)) {
    const dir = path.join(torch, name);
    const s = stat(dir);
    if (!s?.isFile() || s.isSymbolicLink() || !/\.(?:pt|pth|bin|safetensors)$/i.test(name)) continue;
    const downloadUrl = Object.hasOwn(TORCH_URLS, name) ? TORCH_URLS[name] : null;
    items.push(itemFor({ dir, model: name, source: 'pytorch', bytes: s.nlink === 1 ? s.size : 0, newest: Math.max(s.atimeMs, s.mtimeMs),
      invalid: downloadUrl ? null : 'the original download URL cannot be proven; it may be a model you trained', now, named, downloadUrl }));
  }
  return items.sort((a, b) => b.bytes - a.bytes || a.model.localeCompare(b.model));
}

const verifiedHashes = new Map();
const identity = (s) => `${s.dev}:${s.ino}:${s.size}:${s.mtimeMs}:${s.ctimeMs}:${s.birthtimeMs}`;
// Node on Windows can report dev=0 from lstat but a real volume id from fstat.
const sameFile = (a, b) => ['ino', 'size', 'mtimeMs', 'ctimeMs', 'birthtimeMs'].every((k) => a[k] === b[k]) && (!a.dev || !b.dev || a.dev === b.dev);
function contentHash(file) {
  // Linux supports O_NOATIME. Other platforms may mount caches with noatime; if a verification
  // read advances access time, the fresh recency check below keeps the file unless explicitly named.
  let fd;
  try {
    const before = fs.lstatSync(file);
    const key = `${file}:${identity(before)}`;
    if (verifiedHashes.has(key)) return verifiedHashes.get(key);
    try { fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOATIME || 0) | (fs.constants.O_NOFOLLOW || 0)); }
    catch { fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0)); }
    const descriptor = fs.fstatSync(fd);
    if (!descriptor.isFile() || !sameFile(before, descriptor)) throw new Error('Checkpoint was replaced while being opened.');
    const hash = crypto.createHash('sha256');
    const chunk = Buffer.alloc(1024 * 1024);
    let size;
    while ((size = fs.readSync(fd, chunk, 0, chunk.length, null))) hash.update(chunk.subarray(0, size));
    if (identity(fs.fstatSync(fd)) !== identity(descriptor) || !sameFile(fs.lstatSync(file), before)) throw new Error('Checkpoint changed while its download hash was checked.');
    const value = hash.digest('hex');
    if (verifiedHashes.size >= 128) verifiedHashes.delete(verifiedHashes.keys().next().value);
    verifiedHashes.set(key, value);
    return value;
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}

function mlProof(target, { home = os.homedir(), now = Date.now(), named = [], hash = contentHash, checkOpenLocks: probeLocks = checkOpenLocks } = {}) {
  const failed = (message, condition = 'ml-cache') => ({ ok: false, failures: [{ condition, message }], item: null });
  if (typeof target !== 'string' || !path.isAbsolute(target) || target.split(/[\\/]/).includes('..')) return failed('Use the exact, absolute downloaded model-cache path.');
  const { hf, torch } = roots(home);
  const parent = path.dirname(path.resolve(target));
  if (parent !== path.resolve(hf) && parent !== path.resolve(torch)) return failed('This is outside the known model download caches.');
  if (!safeChain(home, target)) return failed('The model cache or one of its parents is a link, missing, or unreadable.');
  let item = mlItems({ home, now, named }).find((i) => path.resolve(i.path) === path.resolve(target));
  if (!item || !item.offered) return failed(item?.reason || 'This is not a downloaded model cache I can safely remove.');
  if (item.source === 'huggingface') {
    const locks = path.join(hf, '.locks', path.basename(target));
    let markers;
    try { markers = fs.readdirSync(locks).map((name) => path.join(locks, name)); }
    catch (err) {
      if (err.code === 'ENOENT') markers = [];
      else return failed('The model download-lock metadata is unreadable.', 'download-active');
    }
    if (markers.length) {
      try {
        const open = probeLocks(markers);
        if (open !== false) return failed('A model download lock is still open or its status is unknown. Let downloads finish first.', 'download-active');
      } catch { return failed('Cannot verify that a model download lock is released. Leave this cache until open-file checks are available.', 'download-active'); }
      // The inventory is an estimate, not authority. A download may start while lsof runs.
      item = mlItems({ home, now, named }).find((i) => path.resolve(i.path) === path.resolve(target));
      if (!item?.offered) return failed('Download activity changed while the cache was being checked. Leave this model for now.', 'download-active');
    }
  }
  if (item.source === 'pytorch') {
    const expected = path.basename(target).match(/-([a-f0-9]{8,64})\.pth$/i)?.[1];
    try {
      if (!expected || !hash(target).startsWith(expected.toLowerCase())) return failed('The checkpoint contents do not match the official download hash.', 'download-proof');
    } catch { return failed('The downloaded checkpoint could not be verified.', 'download-proof'); }
    item = mlItems({ home, now, named }).find((i) => i.path === item.path);
    if (!item?.offered) return failed('The model was accessed or changed during verification; leave it unless you name it explicitly.', 'inactive');
  }
  return { ok: true, failures: [], item, recipe: item.rebuild };
}

function removeMlItem(target, opts = {}) {
  const proof = mlProof(target, opts);
  if (!proof.ok) throw new Error(proof.failures.map((f) => f.message).join(' '));
  fs.rmSync(proof.item.path, { recursive: true, force: false });
  return { bytes: proof.item.bytes, recipe: proof.item.rebuild };
}

module.exports = { mlItems, mlProof, removeMlItem, checkOpenLocks, INACTIVE_DAYS, TORCH_URLS };
