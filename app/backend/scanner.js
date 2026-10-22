// Walks a folder and collects file metadata, content hashes, and duplicate groups.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SKIP_DIRS = new Set(['node_modules', '.git', '.Trash', 'Library', '.cleanasaurus']);
const MAX_FILES = 5000;
const MAX_DEPTH = 6;

function walk(root) {
  const files = [];
  const dirs = [];
  const stack = [{ dir: root, depth: 0 }];
  while (stack.length && files.length < MAX_FILES) {
    const { dir, depth } = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // .app bundles are treated as single files so they can be scanned and moved whole.
        if (entry.name.endsWith('.app')) {
          files.push(describe(full, root));
        } else if (!SKIP_DIRS.has(entry.name) && depth < MAX_DEPTH) {
          dirs.push(path.relative(root, full));
          stack.push({ dir: full, depth: depth + 1 });
        }
      } else if (entry.isFile()) {
        files.push(describe(full, root));
      }
    }
  }
  return { files: files.filter(Boolean), dirs, truncated: files.length >= MAX_FILES };
}

function describe(full, root) {
  try {
    const stat = fs.statSync(full);
    return {
      path: full,
      rel: path.relative(root, full),
      name: path.basename(full),
      ext: path.extname(full).toLowerCase(),
      size: stat.isDirectory() ? 0 : stat.size,
      modified: stat.mtime.toISOString(),
      isBundle: stat.isDirectory(),
    };
  } catch {
    return null;
  }
}

function hashFile(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

// Only files that share a size can be duplicates, so hash just those.
function findDuplicates(files) {
  const bySize = new Map();
  for (const f of files) {
    if (f.isBundle || f.size === 0) continue;
    if (!bySize.has(f.size)) bySize.set(f.size, []);
    bySize.get(f.size).push(f);
  }
  const byHash = new Map();
  for (const group of bySize.values()) {
    if (group.length < 2) continue;
    for (const f of group) {
      try {
        f.sha256 = hashFile(f.path);
      } catch {
        continue;
      }
      if (!byHash.has(f.sha256)) byHash.set(f.sha256, []);
      byHash.get(f.sha256).push(f);
    }
  }
  return [...byHash.values()]
    .filter((g) => g.length > 1)
    .map((g) => ({
      sha256: g[0].sha256,
      size: g[0].size,
      files: g.map((f) => f.path).sort((a, b) => a.length - b.length),
    }));
}

function scan(root) {
  const { files, dirs, truncated } = walk(root);
  const duplicates = findDuplicates(files);
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  return { root, files, dirs, duplicates, totalBytes, truncated, scannedAt: new Date().toISOString() };
}

module.exports = { scan, hashFile };
