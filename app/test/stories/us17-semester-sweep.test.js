// US-17 (#18) · End-of-semester sweep (Could).
const test = require('node:test');
const assert = require('node:assert');

test('US-17 after the semester-end date, the dino offers a sweep of class projects unchanged for 30 days', () => {
  const { sweepOffer } = require('../../backend/semester');
  const projects = [{ name: 'cs3140-hw1', lastChanged: '2026-04-01' }, { name: 'cs4501-alpha', lastChanged: '2027-01-10' }];
  const offer = sweepOffer({ semesterEnd: '2026-12-15', now: '2027-01-20', projects });
  assert.deepStrictEqual(offer.projects, ['cs3140-hw1']);
});

test('US-17 an offer never runs automatically', () => {
  const { sweepOffer } = require('../../backend/semester');
  const offer = sweepOffer({ semesterEnd: '2026-12-15', now: '2027-01-20', projects: [] });
  assert.strictEqual(offer.runsAutomatically, false);
});

test('US-17 no offer before the date passes, without a date, or for an invalid date', () => {
  const { sweepOffer } = require('../../backend/semester');
  for (const date of ['', null, '2027-02-30', 'not-a-date', '2027-01-21', '2027-01-20']) {
    assert.strictEqual(sweepOffer({ semesterEnd: date, now: new Date(2027, 0, 20, 12) }), null);
  }
});

test('US-17 protected, recent, unknown-age, and non-class projects are excluded', () => {
  const { sweepOffer } = require('../../backend/semester');
  const projects = [
    { name: 'cs3140-old', lastChanged: '2026-01-01' },
    { name: 'cs3140-old', lastChanged: '2026-01-01' },
    { name: 'cs4501-keep', lastChanged: '2026-01-01', protected: true },
    { name: 'cs2150-new', lastChanged: '2027-01-19' },
    { name: 'cs1110-unknown', lastChanged: 'invalid' },
    { name: 'portfolio', lastChanged: '2026-01-01' },
  ];
  assert.deepStrictEqual(sweepOffer({ semesterEnd: '2026-12-15', now: '2027-01-20', projects }).projects, ['cs3140-old']);
});

test('US-17 the inactivity boundary is 30 days', () => {
  const { sweepOffer } = require('../../backend/semester');
  const now = Date.UTC(2027, 0, 20);
  const projects = [
    { name: 'cs3140-boundary', lastChanged: now - 30 * 864e5 },
    { name: 'cs3140-recent', lastChanged: now - 30 * 864e5 + 1 },
  ];
  assert.deepStrictEqual(sweepOffer({ semesterEnd: '2026-12-15', now, projects }).projects, ['cs3140-boundary']);
});

test('US-17 saved date survives restart; accepting the offer only plans the eligible project', async () => {
  const fs = require('fs');
  const path = require('path');
  const { tmp, makeJsProject } = require('./helpers');
  const { Engine } = require('../../backend/engine');
  const root = tmp();
  const old = makeJsProject(root, 'cs3140-old');
  const recent = makeJsProject(root, 'cs3140-new', { ageDays: 1 });
  const kept = makeJsProject(root, 'cs4501-kept');
  const dataDir = tmp();
  const engine = new Engine({ dataDir, home: tmp(), apiKey: '' });
  engine.profile.setZone(root, 'free');
  engine.profile.protect('cs4501-kept');
  engine.openFolder(root);
  assert.strictEqual(engine.semesterOffer(), null);
  const offer = engine.setSemesterEnd('2000-01-01');
  assert.deepStrictEqual(offer.projects, ['cs3140-old']);
  assert.strictEqual(new Engine({ dataDir, apiKey: '' }).profile.data.semesterEnd, '2000-01-01');
  assert.throws(() => engine.setSemesterEnd('2027-02-30'), /valid/);
  const result = await engine.plan(`I'm done with ${offer.projects.join(' and ')}. Free up space.`);
  assert.ok(result.actions.some((a) => a.path === path.join(old, 'node_modules')));
  assert.ok(!result.actions.some((a) => a.path.startsWith(recent) || a.path.startsWith(kept)));
  assert.strictEqual(engine.executor.history.length, 0);
  assert.ok(fs.existsSync(path.join(old, 'node_modules')));
  assert.strictEqual(engine.setSemesterEnd(''), null);
});
