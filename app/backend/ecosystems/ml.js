// US-10: machine-learning models in the Hugging Face download cache. They re-download the next time they
// load, so a model unused for 30 days is offered (a newer one only if the user names it). Models the user
// trained or saved anywhere else are never found here, so they're never offered.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { measureFreeable } = require('../devclutter');

const DAY = 24 * 60 * 60 * 1000;
const UNUSED_DAYS = 30;
// A conservative download speed for the re-download estimate: about 3 GB a minute is fast home internet;
// we assume 1 GB a minute.
const BYTES_PER_MINUTE = 1e9;

const hubDir = (home) => path.join(home, '.cache', 'huggingface', 'hub');

function list(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

// The newest time anything inside was read or written, without following symlinks (the hub links blobs).
// Reading counts as use, so a model loaded yesterday isn't "unused" because its files are old (round 3 F9).
function lastUsed(dir) {
  let newest = 0;
  const stack = [dir];
  while (stack.length) {
    const p = stack.pop();
    let st;
    try {
      st = fs.lstatSync(p);
    } catch {
      continue;
    }
    newest = Math.max(newest, st.mtimeMs, st.isFile() ? st.atimeMs : 0);
    if (st.isDirectory()) for (const e of list(p)) stack.push(path.join(p, e));
  }
  return newest;
}

const size = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1e6))} MB`);

function mlItems({ home = os.homedir(), now = Date.now(), named = [] } = {}) {
  const wanted = named.map((n) => n.toLowerCase());
  return list(hubDir(home))
    .filter((name) => name.startsWith('models--'))
    .map((name) => {
      const dir = path.join(hubDir(home), name);
      const model = name.slice('models--'.length).replace('--', '/');
      const bytes = measureFreeable(dir);
      const used = lastUsed(dir);
      const days = Math.floor((now - used) / DAY);
      const isNamed = wanted.some((n) => n === model.toLowerCase() || n === model.split('/').pop().toLowerCase());
      const minutes = Math.max(1, Math.ceil(bytes / BYTES_PER_MINUTE));
      return {
        type: 'ml-model',
        model,
        path: dir,
        bytes,
        lastUsed: new Date(used).toISOString(),
        days,
        offered: days >= UNUSED_DAYS || isNamed,
        named: isNamed,
        label: 'rebuildable',
        reason: `${model} (${size(bytes)}), last used ${days} day${days === 1 ? '' : 's'} ago. About ${minutes} minute${minutes === 1 ? '' : 's'} to re-download.`,
        rebuild: { note: `${model} re-downloads the next time you load it.` },
      };
    })
    .sort((a, b) => b.bytes - a.bytes);
}

module.exports = { mlItems };
