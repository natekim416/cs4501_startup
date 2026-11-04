// US-07 (#8) · Python environments.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmp, write, age, makePyProject } = require('./helpers');
const { rebuildProof, findArtifacts, exportCondaEnv } = require('../../backend/devclutter');

test('US-07 a .venv is offered with the rebuild command that matches its recipe', () => {
  const root = tmp();
  const expected = {
    requirements: 'python3 -m venv .venv && .venv/bin/pip install -r requirements.txt',
    uv: 'uv sync',
    poetry: 'poetry install',
  };
  for (const [recipe, command] of Object.entries(expected)) {
    const project = makePyProject(root, `ds-${recipe}`, { recipe });
    const proof = rebuildProof(path.join(project, '.venv'));
    assert.strictEqual(proof.ok, true, `${recipe}: ${JSON.stringify(proof.failures)}`);
    assert.strictEqual(proof.recipe.command, command);
  }
});

test('US-07 a .venv with no requirements, uv.lock, or poetry.lock is rejected', () => {
  const project = makePyProject(tmp(), 'no-recipe', { recipe: null });
  const proof = rebuildProof(path.join(project, '.venv'));
  assert.strictEqual(proof.ok, false);
  assert.ok(proof.failures.some((f) => f.condition === 'recipe'));
});

test('US-07 a conda environment with no environment.yml is exported first, and the export becomes the recipe', () => {
  const root = tmp();
  const dataDir = tmp();
  const env = path.join(root, 'miniconda3', 'envs', 'cs4774');
  write(path.join(env, 'conda-meta', 'history'), '# history\n');
  age(env, 90);
  const calls = [];
  const run = (cmd, args) => {
    calls.push([cmd, ...args].join(' '));
    return 'name: cs4774\ndependencies:\n  - numpy\n';
  };
  const recipe = exportCondaEnv(env, { dataDir, run });
  assert.ok(calls[0].startsWith('conda env export -p'), calls[0]);
  assert.ok(fs.existsSync(recipe.lockfile), 'export saved in the data folder');
  assert.ok(recipe.lockfile.startsWith(dataDir));
  assert.match(recipe.command, /conda env create -f/);
});

test('US-07 an environment changed in the last 30 days is not offered unless named', () => {
  const root = tmp();
  const project = makePyProject(root, 'cs4774-final', { ageDays: 5 });
  const venv = path.join(project, '.venv');
  assert.ok(rebuildProof(venv).failures.some((f) => f.condition === 'inactive'));
  assert.strictEqual(rebuildProof(venv, { named: ['cs4774-final'] }).ok, true);
});

test('US-07 findArtifacts recognizes a venv by pyvenv.cfg even when it is not named .venv (edge case)', () => {
  const root = tmp();
  const project = makePyProject(root, 'renamed');
  fs.renameSync(path.join(project, '.venv'), path.join(project, 'env'));
  const items = findArtifacts(root).filter((i) => i.type === 'python-venv');
  assert.strictEqual(items.length, 1);
  assert.strictEqual(path.basename(items[0].path), 'env');
});

test('US-07 an inactive conda environment is exported during the scan, offered in the plan, and passes the proof', async () => {
  const { Engine } = require('../../backend/engine');
  const root = tmp();
  const env = path.join(root, 'cs4774', 'conda-env');
  write(path.join(env, 'conda-meta', 'history'), '# history\n');
  write(path.join(env, 'lib', 'big.so'), 'x'.repeat(40 * 1024));
  age(path.join(root, 'cs4774'), 90);
  const condaRun = (cmd, args) => (args[0] === 'env' ? 'name: cs4774\ndependencies:\n  - numpy\n' : '');
  const engine = new Engine({ dataDir: tmp(), apiKey: '', condaRun });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const item = engine.dev.find((d) => d.type === 'conda-env');
  assert.strictEqual(item.label, 'rebuildable', item.reason);
  const plan = await engine.plan('Free up space');
  assert.ok(plan.attempts.at(-1).ok, JSON.stringify(plan.attempts));
  assert.ok(plan.actions.some((a) => a.op === 'delete_rebuildable' && a.path === env));
});
