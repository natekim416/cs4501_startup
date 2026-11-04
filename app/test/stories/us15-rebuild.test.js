// US-15 (#16) · One-click rebuild.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmp, makeJsProject } = require('./helpers');
const TODO = { todo: 'US-15 (#16): one-click rebuild not built yet' };

function deleted() {
  const project = makeJsProject(tmp(), 'old-app');
  const { rebuildProof } = require('../../backend/devclutter');
  const { recipe } = rebuildProof(path.join(project, 'node_modules'));
  fs.rmSync(path.join(project, 'node_modules'), { recursive: true });
  return { project, recipe };
}

test('US-15 Rebuild runs the recorded command in the project and reports success', () => {
  const { rebuild } = require('../../backend/rebuild');
  const { project, recipe } = deleted();
  const calls = [];
  const res = rebuild(recipe, { run: (cmd, opts) => calls.push([cmd, opts.cwd]) });
  assert.deepStrictEqual(calls, [['npm ci', project]]);
  assert.strictEqual(res.ok, true);
});

test('US-15 if the lockfile changed since deletion, the app warns first', () => {
  const { rebuild } = require('../../backend/rebuild');
  const { project, recipe } = deleted();
  fs.writeFileSync(path.join(project, 'package-lock.json'), 'changed');
  const res = rebuild(recipe, { run: () => {} });
  assert.match(res.warning, /new lockfile/i);
});

test('US-15 a failed rebuild shows the command to run by hand and is recorded', () => {
  const { rebuild } = require('../../backend/rebuild');
  const { recipe } = deleted();
  const log = [];
  const res = rebuild(recipe, { run: () => { throw new Error('npm ERR!'); }, record: (e) => log.push(e) });
  assert.strictEqual(res.ok, false);
  assert.match(res.message, /npm ci/);
  assert.deepStrictEqual(log.map((e) => e.event), ['rebuild_failed']);
});
