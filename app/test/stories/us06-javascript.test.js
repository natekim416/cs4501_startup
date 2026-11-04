// US-06 (#7) · JavaScript packages.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmp, write, makeJsProject } = require('./helpers');
const { rebuildProof, measureFreeable, toolCaches, findArtifacts } = require('../../backend/devclutter');

test('US-06 the rebuild command matches the lockfile: npm ci, yarn, or pnpm with a frozen lockfile', () => {
  const root = tmp();
  const expected = {
    npm: 'npm ci',
    yarn: 'yarn install --frozen-lockfile',
    pnpm: 'pnpm install --frozen-lockfile',
  };
  for (const [lock, command] of Object.entries(expected)) {
    const project = makeJsProject(root, `app-${lock}`, { lock });
    const proof = rebuildProof(path.join(project, 'node_modules'));
    assert.strictEqual(proof.ok, true, `${lock}: ${JSON.stringify(proof.failures)}`);
    assert.strictEqual(proof.recipe.command, command);
  }
});

test('US-06 pnpm files hard-linked to the shared store are not counted as freed space', () => {
  const root = tmp();
  const project = makeJsProject(root, 'pnpm-app', { lock: 'pnpm', kb: 0 });
  const store = write(path.join(root, 'pnpm-store', 'big.js'), 'y'.repeat(200 * 1024));
  fs.linkSync(store, path.join(project, 'node_modules', 'big.js'));
  write(path.join(project, 'node_modules', 'own.js'), 'z'.repeat(10 * 1024));
  const freeable = measureFreeable(path.join(project, 'node_modules'));
  assert.ok(freeable >= 10 * 1024, `own file should count (${freeable})`);
  assert.ok(freeable < 100 * 1024, `hard-linked store file must not count (${freeable})`);
});

test('US-06 a file hard-linked twice inside the same folder is counted once (edge case)', () => {
  const dir = path.dirname(write(path.join(tmp(), 'node_modules', 'a.js'), 'q'.repeat(50 * 1024)));
  fs.linkSync(path.join(dir, 'a.js'), path.join(dir, 'b.js'));
  const freeable = measureFreeable(dir);
  assert.ok(freeable >= 50 * 1024 && freeable < 100 * 1024, String(freeable));
});

test('US-06 the npm, Yarn, and pnpm caches are offered as one item each with a measured size', () => {
  const home = tmp();
  write(path.join(home, '.npm', '_cacache', 'content-v2', 'blob'), 'c'.repeat(30 * 1024));
  write(path.join(home, 'Library', 'Caches', 'Yarn', 'v6', 'blob'), 'c'.repeat(20 * 1024));
  const caches = toolCaches(home);
  const npm = caches.find((c) => c.type === 'npm-cache');
  const yarn = caches.find((c) => c.type === 'yarn-cache');
  assert.ok(npm && yarn, JSON.stringify(caches));
  assert.ok(npm.bytes >= 30 * 1024);
  assert.strictEqual(npm.label, 'rebuildable');
  assert.match(npm.reason, /re-download/i);
  assert.ok(!caches.some((c) => c.type === 'pnpm-cache'), 'missing caches are not invented');
});

test('US-06 findArtifacts lists every node_modules once, with its project and size', () => {
  const root = tmp();
  makeJsProject(root, 'a');
  makeJsProject(root, 'b', { lock: 'yarn' });
  const items = findArtifacts(root).filter((i) => i.type === 'node_modules');
  assert.deepStrictEqual(items.map((i) => path.basename(i.project)).sort(), ['a', 'b']);
  assert.ok(items.every((i) => i.bytes > 0));
});

test('US-06 node_modules nested inside another node_modules is not listed separately (edge case)', () => {
  const root = tmp();
  const project = makeJsProject(root, 'nested');
  write(path.join(project, 'node_modules', 'pkg', 'node_modules', 'dep', 'index.js'), 'x');
  const items = findArtifacts(root).filter((i) => i.type === 'node_modules');
  assert.strictEqual(items.length, 1);
});
