// US-03 (#4) · Clean by saying what I'm done with.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { tmp, makeJsProject } = require('./helpers');
const { Engine } = require('../../backend/engine');
const TODO = { todo: 'US-03 (#4): intent-to-project matching not built yet' };

function setup() {
  const root = tmp();
  for (const n of ['cs3140-hw1', 'cs3140-hw2', 'cs3140-final', 'hoohacks-2026', 'capstone-team7', 'cs2150-lab']) makeJsProject(root, n);
  const engine = new Engine({ dataDir: tmp(), apiKey: '' });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  return { root, engine };
}

test('US-03 "done with CS 3140 and the hackathon" plans only those projects, each action naming its project', TODO, async () => {
  const { engine } = setup();
  const plan = await engine.plan("I'm done with CS 3140 and the hackathon");
  const projects = new Set(plan.actions.map((a) => a.project));
  assert.deepStrictEqual([...projects].sort(), ['cs3140-final', 'cs3140-hw1', 'cs3140-hw2', 'hoohacks-2026']);
  assert.ok(plan.actions.every((a) => a.reason.includes(a.project)));
});

test('US-03 an ambiguous request asks a question with options instead of guessing', TODO, async () => {
  const { engine } = setup();
  const plan = await engine.plan("I'm done with the CS class");
  assert.strictEqual(plan.actions.length, 0);
  const q = plan.questions.find((x) => /which class/i.test(x.text));
  assert.ok(q, JSON.stringify(plan.questions));
  assert.ok(q.options.some((o) => /3140/.test(o)) && q.options.some((o) => /2150/.test(o)));
});

test('US-03 a named project changed in the last 30 days shows up unchecked, with a note', TODO, async () => {
  const root = tmp();
  makeJsProject(root, 'cs3140-final', { ageDays: 4 });
  const engine = new Engine({ dataDir: tmp(), apiKey: '' });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const plan = await engine.plan("I'm done with CS 3140");
  const a = plan.actions.find((x) => x.project === 'cs3140-final');
  assert.strictEqual(a.checked, false);
  assert.match(a.note, /still active/i);
});
