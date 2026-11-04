// US-01 (#2) · Storage breakdown before anything changes.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmp, write, makeJsProject, makePyProject } = require('./helpers');
const TODO = { todo: 'US-01 (#2): storage breakdown not built yet' };

test('US-01 shows measured totals by type and the 10 largest projects, and modifies nothing', () => {
  const { breakdown } = require('../../backend/breakdown');
  const root = tmp();
  for (let i = 0; i < 12; i++) makeJsProject(root, `proj-${i}`, { kb: 8 * (i + 1) });
  makePyProject(root, 'ds');
  const before = fs.statSync(path.join(root, 'proj-0', 'node_modules')).mtimeMs;
  const b = breakdown(root);
  for (const type of ['javascript', 'python', 'xcode', 'docker', 'ml']) assert.ok(type in b.byType, type);
  assert.ok(b.byType.javascript > 0 && b.byType.python > 0);
  assert.strictEqual(b.topProjects.length, 10);
  assert.strictEqual(path.basename(b.topProjects[0].path), 'proj-11');
  assert.strictEqual(fs.statSync(path.join(root, 'proj-0', 'node_modules')).mtimeMs, before);
});

test('US-01 scans about 50 projects within 60 seconds and reports progress', () => {
  const { breakdown } = require('../../backend/breakdown');
  const root = tmp();
  for (let i = 0; i < 50; i++) makeJsProject(root, `p${i}`, { repo: false, kb: 4 });
  const progress = [];
  const started = Date.now();
  breakdown(root, { onProgress: (p) => progress.push(p) });
  assert.ok(Date.now() - started < 60_000);
  assert.ok(progress.length > 1);
});

test('US-01 a folder macOS blocks is named with how to grant access, not silently skipped', () => {
  const { breakdown } = require('../../backend/breakdown');
  const root = tmp();
  const blocked = path.dirname(write(path.join(root, 'Documents', 'x.txt')));
  fs.chmodSync(blocked, 0o000);
  try {
    const b = breakdown(root);
    const hit = b.unreadable.find((u) => u.path === blocked);
    assert.ok(hit);
    assert.match(hit.howToFix, /Full Disk Access|Privacy & Security/);
  } finally {
    fs.chmodSync(blocked, 0o755);
  }
});
