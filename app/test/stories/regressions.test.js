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
