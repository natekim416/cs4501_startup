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

function breakdown(root, { onProgress = () => {} } = {}) {
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

  return { byType, topProjects: projects.sort((a, b) => b.bytes - a.bytes).slice(0, 10), unreadable };
}

module.exports = { breakdown };
