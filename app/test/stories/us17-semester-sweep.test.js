// US-17 (#18) · End-of-semester sweep (Could).
const test = require('node:test');
const assert = require('node:assert');

test('US-17 after the semester-end date, the dino offers a sweep of class projects unchanged for 30 days', () => {
  const { sweepOffer } = require('../../backend/semester');
  const projects = [{ name: 'cs3140-hw1', lastChanged: '2026-04-01' }, { name: 'cs4501-alpha', lastChanged: '2026-12-10' }];
  const offer = sweepOffer({ semesterEnd: '2026-12-15', now: '2027-01-20', projects });
  assert.deepStrictEqual(offer.projects, ['cs3140-hw1']);
});

test('US-17 accepting the sweep produces an ordinary plan that waits for approval', () => {
  const { sweepOffer } = require('../../backend/semester');
  const offer = sweepOffer({ semesterEnd: '2026-12-15', now: '2027-01-20', projects: [] });
  assert.strictEqual(offer.runsAutomatically, false);
});

test('US-17 after a scan past the semester end, the engine offers the sweep once, and its request plans only those projects', async () => {
  const { tmp, makeJsProject } = require('./helpers');
  const { Engine } = require('../../backend/engine');
  const root = tmp();
  makeJsProject(root, 'cs3140-hw1', { ageDays: 90 });
  makeJsProject(root, 'side-project', { ageDays: 90 });
  const engine = new Engine({ dataDir: tmp(), apiKey: '', home: tmp(), trashDir: tmp() });
  engine.profile.setZone(root, 'free');
  engine.profile.data.semesterEnd = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10);
  const info = engine.openFolder(root);
  assert.deepStrictEqual(info.sweep.projects, ['cs3140-hw1']);
  assert.strictEqual(engine.openFolder(root).sweep, null, 'offered once per semester');
  const plan = await engine.plan(info.sweep.request);
  assert.deepStrictEqual([...new Set(plan.actions.map((a) => a.project))], ['cs3140-hw1']);
  assert.ok(plan.planId, 'an ordinary plan that waits for approval');
});
