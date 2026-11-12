// US-01: "where did my space go?" Measures, by type and by project, before anything changes. Read-only.
const fs = require('fs');
const path = require('path');
const { findArtifacts, measureFreeable } = require('./devclutter');

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

// home: also measure the Mac-wide stores in that home folder (Xcode's DerivedData, the Hugging Face model
// cache). docker: what the Docker check found (US-09). Measuring is read-only.
function breakdown(root, { onProgress = () => {}, home = null, docker = [] } = {}) {
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
      return;
    }
    projects.push({ path: dir, bytes: measureFreeable(dir) });
    onProgress({ done: i + 1, total: entries.length, current: e.name });
  });

  for (const item of findArtifacts(root)) {
    const group = TYPE_GROUP[item.type];
    if (group) byType[group] += item.bytes;
  }

  // US-01: the Xcode and ML totals from their stores, in the scanned folder or the home folder, counted once.
  for (const h of new Set([root, home].filter(Boolean).map((p) => path.resolve(p)))) {
    const store = (...parts) => path.join(h, ...parts);
    if (fs.existsSync(store('Library', 'Developer', 'Xcode', 'DerivedData'))) byType.xcode += measureFreeable(store('Library', 'Developer', 'Xcode', 'DerivedData'));
    if (fs.existsSync(store('.cache', 'huggingface', 'hub'))) byType.ml += measureFreeable(store('.cache', 'huggingface', 'hub'));
  }
  byType.docker += docker.reduce((n, d) => n + (d.bytes || 0), 0);

  return { byType, topProjects: projects.sort((a, b) => b.bytes - a.bytes).slice(0, 10), unreadable };
}

module.exports = { breakdown };
