// US-09. Docker owns its storage: never remove its files, containers, or volumes directly.
// CLI reference: docs.docker.com/reference/cli/docker/{image/rm,system/df,buildx/du,buildx/prune}/
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const DAY = 864e5;
const CACHE_DAYS = 30;
const IMAGE_ID = /^sha256:[a-f0-9]{64}$/;
const CONTAINER_ID = /^[a-f0-9]{64}$/;
const SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
const CACHE_ID = /^[a-z0-9]{12,128}$/;
const DIGEST = /^[a-z0-9][a-z0-9._:/-]*@sha256:[a-f0-9]{64}$/;
const LIMIT = 1000;

function dockerFor(home = os.homedir()) {
  // Test homes must never query the user's real daemon, including UI tests.
  return (command, args) => {
    if (process.env.CLEANASAURUS_REAL_HOME || path.resolve(home) !== path.resolve(os.homedir())) throw new Error('Docker disabled for a practice home.');
    return execFileSync(command, args, { encoding: 'utf8', stdio: 'pipe', timeout: 30_000, maxBuffer: 16 * 1024 * 1024 });
  };
}

function jsonLines(text) {
  const input = String(text).trim();
  if (!input) return [];
  if (input.startsWith('[')) {
    const rows = JSON.parse(input);
    if (!Array.isArray(rows)) throw new Error('Docker returned an invalid list.');
    return rows;
  }
  return input.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function sizeBytes(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d+(?:\.\d+)?)\s*(B|kB|MB|GB|TB|KiB|MiB|GiB|TiB)?$/i);
  if (!m) return null;
  const unit = (m[2] || 'B').toLowerCase();
  const units = { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4 };
  const n = Number(m[1]) * units[unit];
  return Number.isSafeInteger(Math.round(n)) && n >= 0 ? Math.round(n) : null;
}

function usageFor(call) {
  const rows = jsonLines(call(['system', 'df', '--format', '{{json .}}']));
  const allowed = new Set(['Images', 'Containers', 'Local Volumes', 'Build Cache']);
  const usage = {};
  for (const row of rows) {
    if (!row || !allowed.has(row.Type)) continue;
    const bytes = sizeBytes(row.Size);
    if (bytes === null || row.Type in usage) throw new Error('Docker returned an invalid disk usage total.');
    usage[row.Type] = bytes;
  }
  if (!('Images' in usage)) throw new Error('Docker did not report its image usage.');
  return { usage, totalBytes: Object.values(usage).reduce((sum, bytes) => sum + bytes, 0) };
}

function inspectList(call, kind, ids) {
  const result = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const rows = JSON.parse(call([kind, 'inspect', ...chunk]));
    if (!Array.isArray(rows) || rows.length !== chunk.length) throw new Error('Docker inspection was incomplete.');
    result.push(...rows);
  }
  return result;
}

function idsFrom(text, pattern) {
  const ids = [...new Set(String(text).trim().split(/\s+/).filter(Boolean))];
  if (ids.length > LIMIT || ids.some((id) => !pattern.test(id))) throw new Error('Docker returned an invalid or oversized identifier list.');
  return ids;
}

function imagesFor(call, context, daemonId) {
  const ids = idsFrom(call(['image', 'ls', '--quiet', '--no-trunc']), IMAGE_ID);
  const containerIds = idsFrom(call(['ps', '--all', '--quiet', '--no-trunc']), CONTAINER_ID);
  const containers = inspectList(call, 'container', containerIds);
  const used = new Set();
  const inspectedContainers = new Set();
  for (const c of containers) {
    if (!c || !IMAGE_ID.test(c.Image) || !containerIds.includes(c.Id) || inspectedContainers.has(c.Id)) throw new Error('A container image could not be verified.');
    inspectedContainers.add(c.Id);
    used.add(c.Image);
  }
  const rows = inspectList(call, 'image', ids);
  const inventory = [];
  const items = [];
  const seen = new Set();
  for (const image of rows) {
    if (!image || !ids.includes(image.Id) || seen.has(image.Id)) throw new Error('An image could not be verified.');
    seen.add(image.Id);
    const bytes = sizeBytes(image.Size);
    if (bytes === null) throw new Error('An image size could not be verified.');
    const digests = Array.isArray(image.RepoDigests) ? image.RepoDigests.filter((digest) => typeof digest === 'string' && DIGEST.test(digest)) : [];
    const tags = Array.isArray(image.RepoTags) ? image.RepoTags.filter((tag) => typeof tag === 'string' && tag !== '<none>:<none>') : [];
    const inUse = used.has(image.Id);
    const digest = digests[0];
    const name = tags[0] || digest || image.Id;
    inventory.push({ id: image.Id, type: 'docker-image', name, bytes, inUse, downloadable: Boolean(digest) });
    // Locally built/dangling images have no immutable download recipe. Multiple tags cannot be removed
    // by ID without forcing, so leave those alone too.
    if (inUse || !digest || tags.length > 1) continue;
    items.push({ id: image.Id, path: `docker-image:${image.Id}`, type: 'docker-image', name, bytes,
      context, daemonId, digest, label: 'rebuildable',
      reason: `${name}: no running or stopped container uses it; re-downloads on the next pull. Its displayed size may include shared layers.`,
      rebuild: { command: null, note: `Re-download with docker pull ${digest}.` } });
  }
  return { items, inventory };
}

function cacheFor(call, context, daemonId, now) {
  if (!Number.isFinite(now)) return [];
  // Pin the context's own docker-driver builder. An arbitrary remote builder's usage isn't on this daemon.
  const inspected = String(call(['buildx', 'inspect', context]));
  const name = inspected.match(/^Name:\s+(\S+)\s*$/m)?.[1];
  const driver = inspected.match(/^Driver:\s+(\S+)\s*$/m)?.[1];
  if (name !== context || driver !== 'docker') return [];
  const rows = jsonLines(call(['buildx', 'du', '--builder', context, '--format', '{{json .}}']));
  if (rows.length > LIMIT) throw new Error('Docker returned too many cache records.');
  const items = [];
  const seen = new Set();
  for (const row of rows) {
    if (!row || typeof row.ID !== 'string' || !CACHE_ID.test(row.ID) || seen.has(row.ID)) throw new Error('Docker returned invalid cache records.');
    seen.add(row.ID);
    const bytes = sizeBytes(row.Size);
    const usedAt = Date.parse(row.LastUsedAt);
    if (row.Reclaimable !== true || row.Mutable !== false || row.Shared !== false || row.Type !== 'regular'
      || bytes === null || !Number.isFinite(usedAt) || now - usedAt < CACHE_DAYS * DAY) continue;
    items.push({ id: row.ID, path: `docker-cache:${context}:${row.ID}`, type: 'docker-build-cache',
      name: `Build cache ${row.ID}`, bytes, context, daemonId, builder: context, lastUsed: row.LastUsedAt,
      label: 'rebuildable', reason: `Unused Docker build cache, last used at least ${CACHE_DAYS} days ago. Docker rebuilds it on the next build.`,
      rebuild: { command: null, note: 'Docker rebuilds this cache on the next build.' } });
  }
  return items;
}

function dockerItems({ run = dockerFor(), now = Date.now(), context: requestedContext } = {}) {
  let context;
  let daemonId;
  let call;
  try {
    context = requestedContext || String(run('docker', ['context', 'show'])).trim();
    if (!SAFE_NAME.test(context)) throw new Error('Invalid Docker context.');
    call = (args) => run('docker', ['--context', context, ...args]);
    const info = JSON.parse(call(['info', '--format', '{{json .}}']));
    if (!info || typeof info.ID !== 'string' || !info.ID.trim() || info.ID.length > 256) throw new Error('Invalid daemon identity.');
    daemonId = info.ID;
  } catch {
    return { available: false, message: "Docker isn't running or isn't available. I skipped Docker and can still plan the rest.", items: [], inventory: [], totalBytes: null, usage: {} };
  }
  let usage = {};
  let totalBytes = null;
  const notes = [];
  try { ({ usage, totalBytes } = usageFor(call)); } catch { notes.push("I couldn't measure Docker's storage."); }
  let images = { items: [], inventory: [] };
  try { images = imagesFor(call, context, daemonId); } catch { notes.push("I couldn't verify which images are unused, so I left the images alone."); }
  let caches = [];
  try { caches = cacheFor(call, context, daemonId, now); } catch { notes.push("I couldn't inspect old build cache, so I left it alone."); }
  return { available: true, context, daemonId, message: notes.join(' '), totalBytes, usage, inventory: images.inventory,
    items: [...images.items, ...caches].sort((a, b) => b.bytes - a.bytes) };
}

function executeDockerItem(item, { run = dockerFor(), now = Date.now() } = {}) {
  if (!item || !SAFE_NAME.test(item.context || '') || typeof item.daemonId !== 'string') throw new Error('No verified Docker item; refusing to delete anything.');
  const fresh = dockerItems({ run, now, context: item.context });
  if (!fresh.available || fresh.daemonId !== item.daemonId) throw new Error('Docker changed or stopped since the preview; make a new plan.');
  const current = fresh.items.find((i) => i.path === item.path && i.type === item.type && i.id === item.id
    && (i.type !== 'docker-image' || i.digest === item.digest));
  if (!current) throw new Error('This Docker item is no longer safe to remove. It may be in use, changed, or too recent; make a new plan.');
  const call = (args) => run('docker', ['--context', current.context, ...args]);
  if (current.type === 'docker-image') {
    // --no-prune avoids deleting unselected parent images; never --force, never image/system prune.
    call(['image', 'rm', '--no-prune', current.id]);
  } else if (current.type === 'docker-build-cache') {
    // All filters are ANDed by Buildx. --force skips the CLI prompt only; no in-use records can match.
    call(['buildx', 'prune', '--builder', current.builder, '--filter', `id=${current.id}`,
      '--filter', 'until=720h', '--filter', 'inuse=false', '--filter', 'mutable=false', '--filter', 'shared=false', '--force']);
  } else throw new Error('Unknown Docker item; refusing to delete anything.');
  let after = null;
  try { after = usageFor(call).totalBytes; } catch { /* The action ran, but an unavailable measurement is never a claimed saving. */ }
  const insideDocker = fresh.totalBytes !== null && after !== null ? Math.max(0, fresh.totalBytes - after) : null;
  return { insideDocker, note: current.rebuild.note, measured: insideDocker !== null };
}

function reportDockerFreed({ insideDocker, diskChange }) {
  const known = typeof insideDocker === 'number' && Number.isFinite(insideDocker) && insideDocker >= 0;
  const host = typeof diskChange === 'number' && Number.isFinite(diskChange) ? diskChange : 0;
  const format = (bytes) => `${(bytes / 1e9).toFixed(2)} GB`;
  return { insideDocker: known ? insideDocker : null, diskChange: host, showBoth: !known || insideDocker !== host,
    text: known ? `Measured ${format(insideDocker)} freed inside Docker; measured ${format(host)} change in free disk space on this computer. Docker's disk image may shrink later.`
      : `Docker cleanup finished, but its space change couldn't be measured. Measured ${format(host)} change in free disk space on this computer.` };
}

module.exports = { dockerItems, executeDockerItem, reportDockerFreed, dockerFor, sizeBytes, CACHE_DAYS };
