// US-30: what's already in the Trash, and the one check every permanent delete must pass:
// the item sits directly in the Trash folder. Nothing anywhere else can be permanently deleted.
const fs = require('fs');
const path = require('path');

// Size on disk without following symlinks, so a link in the Trash never counts (or reaches) its target.
function itemBytes(p) {
  try {
    const st = fs.lstatSync(p);
    if (!st.isDirectory()) return st.size;
    return fs.readdirSync(p).reduce((n, e) => n + itemBytes(path.join(p, e)), 0);
  } catch {
    return 0;
  }
}

function listTrash(trashDir) {
  if (!trashDir) return [];
  try {
    return fs
      .readdirSync(trashDir)
      .filter((name) => name !== '.DS_Store')
      .map((name) => ({ path: path.join(trashDir, name), name, bytes: itemBytes(path.join(trashDir, name)) }));
  } catch {
    // Missing, or macOS hasn't granted access to the Trash.
    return [];
  }
}

// True only for an existing item directly inside the Trash. Resolves ".." and symlinked parents,
// so a path can't climb out of the Trash, and the Trash folder itself never qualifies.
function inTrash(p, trashDir) {
  if (!trashDir || !p) return false;
  try {
    const resolved = path.resolve(p);
    fs.lstatSync(resolved);
    return fs.realpathSync(path.dirname(resolved)) === fs.realpathSync(trashDir) && path.basename(resolved) !== '';
  } catch {
    return false;
  }
}

module.exports = { listTrash, inTrash, itemBytes };
