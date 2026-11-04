// US-05 (#6) · Delete only what can be proven rebuildable.
// Every NEVER case in the rebuild proof has a test that proves it gets rejected.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { tmp, write, makeJsProject } = require('./helpers');
const { rebuildProof } = require('../../backend/devclutter');
const { validate } = require('../../backend/validator');
const { Profile } = require('../../backend/profile');
const { scan } = require('../../backend/scanner');

const failed = (proof) => proof.failures.map((f) => f.condition);

test('US-05 a gitignored node_modules with a lockfile in a project unchanged for 60 days passes, and the recipe is saved', () => {
  const project = makeJsProject(tmp(), 'cs3140-hw1');
  const proof = rebuildProof(path.join(project, 'node_modules'));
  assert.deepStrictEqual(proof.failures, []);
  assert.strictEqual(proof.ok, true);
  const lock = fs.readFileSync(path.join(project, 'package-lock.json'));
  assert.strictEqual(proof.recipe.command, 'npm ci');
  assert.strictEqual(proof.recipe.cwd, project);
  assert.strictEqual(proof.recipe.lockfile, path.join(project, 'package-lock.json'));
  assert.strictEqual(proof.recipe.lockfileHash, crypto.createHash('sha256').update(lock).digest('hex'));
});

test('US-05 a project with uncommitted changes is rejected, and the reason says so', () => {
  const project = makeJsProject(tmp(), 'hoohacks-2026', { dirty: true });
  const proof = rebuildProof(path.join(project, 'node_modules'));
  assert.strictEqual(proof.ok, false);
  assert.ok(failed(proof).includes('clean_worktree'));
  assert.match(proof.failures.find((f) => f.condition === 'clean_worktree').message, /uncommitted/i);
});

test('US-05 a folder where git tracks any file is rejected (it is source, not clutter)', () => {
  const project = makeJsProject(tmp(), 'vendored', { tracked: true });
  const proof = rebuildProof(path.join(project, 'node_modules'));
  assert.strictEqual(proof.ok, false);
  assert.ok(failed(proof).includes('not_source'));
});

test('US-05 a folder that is not gitignored in a repo is rejected', () => {
  const project = makeJsProject(tmp(), 'not-ignored', { ignored: false });
  const proof = rebuildProof(path.join(project, 'node_modules'));
  assert.strictEqual(proof.ok, false);
  assert.ok(failed(proof).includes('not_source'));
});

test('US-05 a folder with no lockfile or manifest is rejected', () => {
  const project = makeJsProject(tmp(), 'no-lock', { lock: null });
  fs.rmSync(path.join(project, 'package.json'));
  const proof = rebuildProof(path.join(project, 'node_modules'));
  assert.strictEqual(proof.ok, false);
  assert.ok(failed(proof).includes('recipe'));
});

test('US-05 a folder holding a .env file is rejected (irreplaceable secrets)', () => {
  const project = makeJsProject(tmp(), 'secrets', { secret: true });
  const proof = rebuildProof(path.join(project, 'node_modules'));
  assert.strictEqual(proof.ok, false);
  assert.ok(failed(proof).includes('nothing_irreplaceable'));
});

test('US-05 a project changed in the last 30 days is rejected unless the user named it', () => {
  const project = makeJsProject(tmp(), 'active-app', { ageDays: 3 });
  const nm = path.join(project, 'node_modules');
  assert.ok(failed(rebuildProof(nm)).includes('inactive'));
  assert.strictEqual(rebuildProof(nm, { named: ['active-app'] }).ok, true);
});

test('US-05 an unknown folder type is rejected even with a lockfile next to it', () => {
  const project = makeJsProject(tmp(), 'odd');
  const odd = path.dirname(write(path.join(project, 'build-output', 'bundle.js')));
  const proof = rebuildProof(odd);
  assert.strictEqual(proof.ok, false);
  assert.ok(failed(proof).includes('known_type'));
});

test('US-05 source code itself is never deletable, even if the planner proposes it', () => {
  const project = makeJsProject(tmp(), 'src-attack');
  const proof = rebuildProof(project);
  assert.strictEqual(proof.ok, false);
});

test('US-05 the validator passes a proven deletion and rejects an unproven one, sending the reason back', () => {
  const root = tmp();
  const good = makeJsProject(root, 'cs3140-hw1');
  const bad = makeJsProject(root, 'hoohacks-2026', { lock: null });
  fs.rmSync(path.join(bad, 'package.json'));
  const profile = new Profile(path.join(tmp(), 'profile.json'));
  profile.setZone(root, 'free');
  const ctx = { scan: scan(root), findings: [], profile };
  const plan = (p) => ({ actions: [{ id: 'a1', op: 'delete_rebuildable', path: path.join(p, 'node_modules'), dest: '', keep: '', reason: 'old dependencies' }] });

  const ok = validate(plan(good), ctx);
  assert.strictEqual(ok.ok, true, JSON.stringify(ok.errors));
  assert.ok(ok.bytesFreed > 0);

  const no = validate(plan(bad), ctx);
  assert.strictEqual(no.ok, false);
  assert.match(no.errors[0].message, /hoohacks-2026/);
});

test('US-05 a delete_rebuildable inside a user-set NEVER zone is still rejected', () => {
  const root = tmp();
  const project = makeJsProject(root, 'capstone');
  const profile = new Profile(path.join(tmp(), 'profile.json'));
  profile.setZone(project, 'never');
  const res = validate(
    { actions: [{ id: 'a1', op: 'delete_rebuildable', path: path.join(project, 'node_modules'), dest: '', keep: '', reason: 'x' }] },
    { scan: scan(root), findings: [], profile },
  );
  assert.strictEqual(res.ok, false);
  assert.match(res.errors[0].message, /NEVER/);
});

test('US-05 a git repo at the home folder (dotfiles) does not make every project look "not gitignored" (edge case)', () => {
  const { gitCommitAll } = require('./helpers');
  const home = tmp();
  write(path.join(home, '.zshrc'), 'export X=1\n');
  gitCommitAll(home);
  const project = makeJsProject(home, 'no-own-repo', { repo: false });
  const proof = rebuildProof(path.join(project, 'node_modules'), { home });
  assert.deepStrictEqual(proof.failures, []);
});
