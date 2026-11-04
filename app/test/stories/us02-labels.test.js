// US-02 (#3) · Label what's rebuildable and what isn't.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { tmp, write, makeJsProject } = require('./helpers');
const { labelPath, findArtifacts } = require('../../backend/devclutter');

test('US-02 a node_modules folder with a lockfile is "Rebuildable: npm ci, about 1 minute"', () => {
  const project = makeJsProject(tmp(), 'web-app');
  const label = labelPath(path.join(project, 'node_modules'));
  assert.strictEqual(label.label, 'rebuildable');
  assert.strictEqual(label.rebuild.command, 'npm ci');
  assert.match(label.reason, /npm ci/);
  assert.match(label.reason, /about 1 minute/);
});

test('US-02 Xcode Archives, VM disks, and Docker volumes are "Not rebuildable" with a reason', () => {
  const home = tmp();
  const archive = write(path.join(home, 'Library', 'Developer', 'Xcode', 'Archives', '2026-05-01', 'App.xcarchive', 'Info.plist'));
  const vm = write(path.join(home, 'VMs', 'ubuntu.utm', 'disk.qcow2'));
  const cases = [
    [path.dirname(archive), /crash reports/i],
    [path.join(home, 'VMs', 'ubuntu.utm'), /virtual machine/i],
    [vm, /virtual machine/i],
    ['docker-volume:postgres-data', /database/i],
  ];
  for (const [p, reason] of cases) {
    const label = labelPath(p, { home });
    assert.strictEqual(label.label, 'not_rebuildable', p);
    assert.match(label.reason, reason, p);
    assert.ok(!label.rebuild, `${p} must not have a rebuild recipe`);
  }
});

test('US-02 not-rebuildable items never appear among cleanup candidates', () => {
  const root = tmp();
  makeJsProject(root, 'web-app');
  write(path.join(root, 'old-vm.utm', 'disk.qcow2'), 'x'.repeat(4096));
  const items = findArtifacts(root);
  assert.ok(items.some((i) => i.label === 'rebuildable'));
  assert.ok(!items.some((i) => i.path.includes('old-vm.utm') && i.label === 'rebuildable'));
});

test('US-02 an unrecognized folder is "Unknown" and treated as not rebuildable', () => {
  const dir = path.dirname(write(path.join(tmp(), 'mystery-stuff', 'blob.bin')));
  const label = labelPath(dir);
  assert.strictEqual(label.label, 'unknown');
  assert.ok(!label.rebuild);
});

test('US-02 a node_modules folder with no lockfile is not rebuildable (edge case)', () => {
  const project = makeJsProject(tmp(), 'no-lock', { lock: null });
  const label = labelPath(path.join(project, 'node_modules'));
  assert.notStrictEqual(label.label, 'rebuildable');
  assert.match(label.reason, /lockfile/i);
});
