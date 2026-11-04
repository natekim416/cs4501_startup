// US-04 (#5) · Protect the projects I care about, once.
const test = require('node:test');
const assert = require('node:assert');
const { tmp, makeJsProject } = require('./helpers');
const { Engine } = require('../../backend/engine');
const TODO = { todo: 'US-04 (#5): protected projects not built yet' };

function setup(names) {
  const root = tmp();
  for (const n of names) makeJsProject(root, n);
  const engine = new Engine({ dataDir: tmp(), apiKey: '' });
  engine.profile.setZone(root, 'free');
  return { root, engine };
}

test('US-04 protected projects are skipped in every later plan and listed as protected', TODO, async () => {
  const { root, engine } = setup(['capstone-team7', 'portfolio-site', 'cs3140-hw1']);
  engine.profile.protect('capstone-team7');
  engine.profile.protect('portfolio-site');
  engine.scanFolder(root);
  const plan = await engine.plan('Free up space');
  assert.ok(plan.actions.every((a) => !/capstone-team7|portfolio-site/.test(a.path)));
  assert.deepStrictEqual(plan.protected.sort(), ['capstone-team7', 'portfolio-site']);
});

test('US-04 a saved pattern like capstone-* protects new matching projects', TODO, async () => {
  const { root, engine } = setup(['capstone-v2']);
  engine.profile.protect('capstone-*');
  engine.scanFolder(root);
  const plan = await engine.plan('Free up space');
  assert.strictEqual(plan.actions.length, 0);
});

test('US-04 removing a protection from DINO MEMORY lets the project appear again', TODO, async () => {
  const { root, engine } = setup(['capstone-team7']);
  engine.profile.protect('capstone-team7');
  engine.profile.unprotect('capstone-team7');
  engine.scanFolder(root);
  const plan = await engine.plan('Free up space');
  assert.ok(plan.actions.some((a) => a.path.includes('capstone-team7')));
});
