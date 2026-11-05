// Bugs found while building the Alpha. Each test was written to fail before the fix.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmp, makeJsProject } = require('./helpers');
const { Engine } = require('../../backend/engine');

test('REG-1 identical files inside code projects are not proposed as duplicates (found by US-11 test)', async () => {
  const root = tmp();
  makeJsProject(root, 'a');
  makeJsProject(root, 'b');
  const engine = new Engine({ dataDir: tmp(), apiKey: '' });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const plan = await engine.plan('Free up space');
  assert.ok(plan.actions.every((a) => a.op !== 'trash_duplicate'));
  assert.ok(plan.attempts[0].ok, 'first try should pass: nothing invalid was proposed');
});

test('REG-2 source files in different code projects do not trigger a "versions" question (found in a screenshot)', async () => {
  const root = tmp();
  makeJsProject(root, 'a');
  makeJsProject(root, 'b');
  fs.writeFileSync(path.join(root, 'b', 'index.js'), 'console.log("different")\n');
  const engine = new Engine({ dataDir: tmp(), apiKey: '' });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const plan = await engine.plan('Organize everything');
  assert.ok(!plan.questions.some((q) => /versions of "index\.js"/.test(q.text)), JSON.stringify(plan.questions));
});

test('REG-3 approving a named, still-active project passes the re-check at run time (found while wiring US-06/07; test written after the fix)', async () => {
  const root = tmp();
  makeJsProject(root, 'cs3140-final', { ageDays: 4 });
  const engine = new Engine({ dataDir: tmp(), apiKey: '' });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const plan = await engine.plan("I'm done with CS 3140");
  const run = engine.execute(plan.planId, plan.actions.map((a) => a.id));
  assert.ok(run.ok, JSON.stringify(run.errors));
  assert.ok(!fs.existsSync(path.join(root, 'cs3140-final', 'node_modules')));
});

test('REG-4 the scripted demo request never targets a course the user did not name (found by grader round 1)', async () => {
  const { makeDevDemo } = require('../../scripts/make-dev-demo');
  const root = makeDevDemo(path.join(tmp(), 'code'));
  const engine = new Engine({ dataDir: tmp(), apiKey: '' });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const plan = await engine.plan("I'm done with CS 3140 and the hackathon. Free up space.");
  const projects = plan.actions.map((a) => path.basename(path.dirname(a.path))).sort();
  assert.deepStrictEqual(projects, ['cs3140-final', 'cs3140-hw1']);
  assert.match(plan.attempts[0].errors.join(' '), /hoohacks-2026 has uncommitted changes/);
});

test('REG-5 the scanned folder itself is never offered as a project (found by grader round 3)', async () => {
  const { makeDevDemo } = require('../../scripts/make-dev-demo');
  const root = makeDevDemo(path.join(tmp(), 'code'));
  const engine = new Engine({ dataDir: tmp(), apiKey: '' });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const plan = await engine.plan("I'm done with the class with the robot project");
  const q = plan.questions.find((x) => /which projects/i.test(x.text));
  assert.ok(q && !q.options.includes('code'), JSON.stringify(q));
});

test('REG-6 in an ASK zone, approving with the moves unchecked creates no empty folders and says why (found by Papa on ~/Documents)', async () => {
  const { makeDemoFolder } = require('../../scripts/make-demo-folder');
  const folder = path.join(tmp(), 'Downloads');
  makeDemoFolder(folder);
  const engine = new Engine({ dataDir: tmp(), apiKey: '', home: tmp(), trashDir: tmp() });
  engine.profile.setZone(folder, 'ask');
  engine.scanFolder(folder);
  const plan = await engine.plan('Sort my school files by class');
  const moves = plan.actions.filter((a) => a.op === 'move');
  assert.ok(moves.length > 0 && moves.every((a) => plan.needsApproval.includes(a.id)), 'moves in an ASK zone wait for the user');
  // What the card checks by default: everything not marked ASK FIRST.
  const defaults = plan.actions.filter((a) => !plan.needsApproval.includes(a.id) && a.checked !== false).map((a) => a.id);
  const before = new Set(fs.readdirSync(folder));
  const res = engine.execute(plan.planId, defaults);
  assert.strictEqual(res.ok, true, JSON.stringify(res.errors));
  const created = fs.readdirSync(folder).filter((n) => !before.has(n));
  assert.deepStrictEqual(created, [], 'no folder is created when none of its files were checked');
  assert.match(res.freedNote, /14 moves? .*(check|ASK)/i);
});

test('REG-6b checking the moves too makes every file land exactly where the plan said', async () => {
  const { makeDemoFolder } = require('../../scripts/make-demo-folder');
  const folder = path.join(tmp(), 'Downloads');
  makeDemoFolder(folder);
  const engine = new Engine({ dataDir: tmp(), apiKey: '', home: tmp(), trashDir: tmp() });
  engine.profile.setZone(folder, 'ask');
  engine.scanFolder(folder);
  const plan = await engine.plan('Sort my school files by class');
  const res = engine.execute(plan.planId, plan.actions.map((a) => a.id));
  assert.strictEqual(res.ok, true, JSON.stringify(res.errors));
  const moves = plan.actions.filter((a) => a.op === 'move');
  for (const a of moves) {
    assert.ok(fs.existsSync(path.join(a.dest, path.basename(a.path))), `${path.basename(a.path)} landed in ${a.dest}`);
    assert.ok(!fs.existsSync(a.path), `${path.basename(a.path)} left its old place`);
  }
});
