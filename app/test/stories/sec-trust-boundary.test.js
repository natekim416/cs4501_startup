// SEC · The page can only ask; the main process decides. Found by the red-team review (F1, F2).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmp, makeJsProject, makePyProject } = require('./helpers');
const { Engine } = require('../../backend/engine');
const { rebuildProof } = require('../../backend/devclutter');

function engineWithDeletedFolder() {
  const root = tmp();
  const project = makeJsProject(root, 'old-app');
  const engine = new Engine({ dataDir: tmp(), apiKey: '', home: tmp(), trashDir: tmp() });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  return engine.plan('Free up space').then((plan) => {
    const run = engine.execute(plan.planId, plan.actions.map((a) => a.id));
    assert.strictEqual(run.ok, true, JSON.stringify(run.errors));
    const undo = engine.undo();
    return { engine, project, recipe: undo.needsRebuild[0] };
  });
}

test('SEC-1 rebuild refuses a command the app never recorded, so the page cannot run arbitrary commands (F1)', async () => {
  const { engine } = await engineWithDeletedFolder();
  const marker = path.join(tmp(), 'PWNED');
  const ran = [];
  const res = engine.rebuild({ command: `touch ${marker}`, cwd: tmp() }, { run: (cmd) => ran.push(cmd) });
  assert.strictEqual(res.ok, false);
  assert.match(res.message, /only rebuild/i);
  assert.deepStrictEqual(ran, []);
  assert.ok(!fs.existsSync(marker));
});

test('SEC-1b rebuild runs the recorded recipe, never the command text the page sent along with it (F1)', async () => {
  const { engine, project, recipe } = await engineWithDeletedFolder();
  const ran = [];
  const ok = engine.rebuild(recipe, { run: (cmd, opts) => ran.push([cmd, opts.cwd]) });
  assert.strictEqual(ok.ok, true, ok.message);
  assert.deepStrictEqual(ran, [['npm ci', project]]);
  // Same folder, swapped command: refused.
  const forged = engine.rebuild({ ...recipe, command: 'npm ci; touch /tmp/x' }, { run: (cmd) => ran.push([cmd]) });
  assert.strictEqual(forged.ok, false);
  assert.strictEqual(ran.length, 1);
});

test('SEC-2 a venv or conda folder name with shell characters can never run as a command when rebuilt (F2)', () => {
  const { execSync } = require('child_process');
  for (const name of [';touch PWNED #', 'env$(touch PWNED)', 'a`touch PWNED`b', 'x|touch PWNED', "it's mine"]) {
    const project = makePyProject(tmp(), 'py', { recipe: 'requirements', venvName: name });
    const proof = rebuildProof(path.join(project, name), { home: tmp() });
    assert.ok(proof.recipe, `${name}: no recipe (${JSON.stringify(proof.failures)})`);
    // Run the real command with python3 swapped for the harmless \`true\`; the name must stay a name.
    try {
      execSync(proof.recipe.command.replace(/^python3 /, 'true '), { cwd: project, stdio: 'ignore', shell: '/bin/sh' });
    } catch {
      // pip doesn't exist in the fake venv; only the marker matters.
    }
    assert.ok(!fs.existsSync(path.join(project, 'PWNED')), `${name} ran a command: ${proof.recipe.command}`);
  }
  const { exportCondaEnv } = require('../../backend/devclutter');
  const env = path.join(tmp(), 'env$(touch PWNED)');
  const recipe = exportCondaEnv(env, { dataDir: tmp(), run: () => 'name: x\n' });
  try {
    execSync(recipe.command.replace(/^conda /, 'true '), { cwd: path.dirname(env), stdio: 'ignore', shell: '/bin/sh' });
  } catch {
    // Only the marker matters.
  }
  assert.ok(!fs.existsSync(path.join(path.dirname(env), 'PWNED')), recipe.command);
});
