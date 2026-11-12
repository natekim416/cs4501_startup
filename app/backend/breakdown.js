// US-01: "where did my space go?" Measures, by type and by project, before anything changes. Read-only.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { findArtifacts, measureFreeable, toolCaches } = require('./devclutter');

const TYPE_GROUP = {
  node_modules: 'javascript',
  'npm-cache': 'javascript',
  'yarn-cache': 'javascript',
  'pnpm-cache': 'javascript',
  'python-venv': 'python',
  'conda-env': 'python',
  'xcode-deriveddata': 'xcode',
  simulator: 'xcode',
  'docker-image': 'docker',
  'ml-model': 'ml',
};

// macOS blocks some folders until the app is granted access; say how instead of skipping silently.
const HOW_TO_FIX = 'macOS blocked this folder. Open System Settings > Privacy & Security > Full Disk Access (or Files and Folders) and allow Cleanasaurus, then scan again.';

function breakdown(root, { home = os.homedir(), onProgress = () => {}, artifacts, caches, docker, ml } = {}) {
  const byType = { javascript: 0, python: 0, xcode: 0, docker: 0, ml: 0 };
  const unreadable = [];
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.'));
  } catch {
    unreadable.push({ path: root, howToFix: HOW_TO_FIX });
  }

  const projects = [];
  entries.forEach((e, i) => {
    const dir = path.join(root, e.name);
    try {
      fs.readdirSync(dir);
    } catch {
      unreadable.push({ path: dir, howToFix: HOW_TO_FIX });
      onProgress({ done: i + 1, total: entries.length, current: e.name });
      return;
    }
    projects.push({ path: dir, bytes: measureFreeable(dir) });
    onProgress({ done: i + 1, total: entries.length, current: e.name });
  });

  const seen = new Set();
  for (const item of [...(artifacts || findArtifacts(root)), ...(caches || toolCaches(home))]) {
    if (seen.has(item.path)) continue;
    seen.add(item.path);
    const group = TYPE_GROUP[item.type];
    if (group) byType[group] += item.bytes;
  }

  // These are storage inventories, including active entries. Cleanup eligibility is a separate check.
  // Only known local Xcode storage directories are measured; source projects and Archives are excluded.
  for (const parts of [['Library', 'Developer', 'Xcode', 'DerivedData'], ['Library', 'Developer', 'CoreSimulator']]) {
    const dir = path.join(home, ...parts);
    try {
      let linked = false;
      for (let p = dir; p !== path.dirname(home) && p !== path.dirname(p); p = path.dirname(p)) {
        if (fs.lstatSync(p).isSymbolicLink()) { linked = true; break; }
        if (p === home) break;
      }
      if (!linked) byType.xcode += measureFreeable(dir);
    } catch { /* Not installed or unavailable. */ }
  }
  const models = ml || require('./ecosystems/ml').mlItems({ home });
  byType.ml = models.reduce((n, item) => n + (Number.isFinite(item.bytes) && item.bytes > 0 ? item.bytes : 0), 0);
  const dockerUsage = docker || require('./ecosystems/docker').dockerItems({ run: require('./ecosystems/docker').dockerFor(home) });
  byType.docker = Number.isFinite(dockerUsage.totalBytes) && dockerUsage.totalBytes > 0 ? dockerUsage.totalBytes : 0;

  onProgress({ done: entries.length, total: entries.length, current: null });
  return { byType, topProjects: projects.sort((a, b) => b.bytes - a.bytes).slice(0, 10), unreadable,
    dockerAvailable: dockerUsage.available, notes: [dockerUsage.message, 'Docker totals are reported by Docker; host disk space may differ.'].filter(Boolean) };
}

module.exports = { breakdown };
