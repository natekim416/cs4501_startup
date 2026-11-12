// US-01 (#2) · Storage breakdown before anything changes.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmp, write, makeJsProject, makePyProject } = require('./helpers');

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

test('US-01 asking "where did my space go?" answers with the breakdown and proposes nothing', async () => {
  const { Engine } = require('../../backend/engine');
  const root = tmp();
  makeJsProject(root, 'big-app', { kb: 200 });
  makePyProject(root, 'ds');
  const engine = new Engine({ dataDir: tmp(), apiKey: '' });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const res = await engine.plan('Where did my space go?');
  assert.strictEqual(res.actions.length, 0);
  assert.match(res.summary, /JavaScript packages/);
  assert.match(res.summary, /big-app/);
  assert.ok(res.breakdown && res.breakdown.byType.javascript > 0);
});

test('US-01 Xcode, Docker, and ML totals use their storage inventories, including active entries', () => {
  const { breakdown } = require('../../backend/breakdown');
  const root = tmp();
  write(path.join(root, 'Library', 'Developer', 'Xcode', 'DerivedData', 'App-abc', 'Build', 'x.o'), 'x'.repeat(4096));
  write(path.join(root, 'Library', 'Developer', 'CoreSimulator', 'Devices', 'device', 'data.bin'), 'x'.repeat(8192));
  const model = path.join(root, '.cache', 'huggingface', 'hub', 'models--old--model', 'snapshots', 'a'.repeat(40), 'model.safetensors');
  write(model, 'm'.repeat(65536));
  const before = fs.readFileSync(model);
  const b = breakdown(root, { home: root, docker: { available: true, totalBytes: 1.5e9, items: [] } });
  assert.ok(b.byType.xcode > 0, 'DerivedData should count toward Xcode');
  assert.ok(b.byType.xcode >= 12288, 'active simulator data also counts');
  assert.strictEqual(b.byType.docker, 1.5e9);
  assert.ok(b.byType.ml > 0, 'an active model still occupies storage');
  assert.deepStrictEqual(fs.readFileSync(model), before);
  assert.strictEqual(b.dockerAvailable, true);
});

test('US-01 unavailable Docker is explained; installed ecosystem totals still appear', () => {
  const { breakdown } = require('../../backend/breakdown');
  const root = tmp();
  makeJsProject(root, 'app', { repo: false });
  const b = breakdown(root, { home: root, docker: { available: false, totalBytes: null, message: "Docker isn't running." } });
  assert.ok(b.byType.javascript > 0);
  assert.strictEqual(b.byType.docker, 0);
  assert.ok(b.notes.some((n) => n.includes("Docker isn't running")));
});

test('US-01 exact package cache paths count once alongside project artifacts', () => {
  const { breakdown } = require('../../backend/breakdown');
  const root = tmp();
  const cache = { path: path.join(root, '.npm'), type: 'npm-cache', bytes: 4096 };
  const b = breakdown(root, { home: root, artifacts: [cache], caches: [cache], ml: [], docker: { available: true, totalBytes: 0 } });
  assert.strictEqual(b.byType.javascript, 4096);
});

test('US-01 no project folders still emits completed progress and valid zero totals', () => {
  const { breakdown } = require('../../backend/breakdown');
  const root = tmp();
  const progress = [];
  const b = breakdown(root, { home: root, onProgress: (p) => progress.push(p), docker: { available: false, totalBytes: null } });
  assert.deepStrictEqual(b.byType, { javascript: 0, python: 0, xcode: 0, docker: 0, ml: 0 });
  assert.deepStrictEqual(progress.at(-1), { done: 0, total: 0, current: null });
});
