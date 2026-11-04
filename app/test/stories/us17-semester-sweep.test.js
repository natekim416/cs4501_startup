// US-17 (#18) · End-of-semester sweep (Could).
const test = require('node:test');
const assert = require('node:assert');
const TODO = { todo: 'US-17 (#18): end-of-semester sweep not built yet (Could)' };

test('US-17 after the semester-end date, the dino offers a sweep of class projects unchanged for 30 days', TODO, () => {
  const { sweepOffer } = require('../../backend/semester');
  const projects = [{ name: 'cs3140-hw1', lastChanged: '2026-04-01' }, { name: 'cs4501-alpha', lastChanged: '2026-12-10' }];
  const offer = sweepOffer({ semesterEnd: '2026-12-15', now: '2027-01-20', projects });
  assert.deepStrictEqual(offer.projects, ['cs3140-hw1']);
});

test('US-17 accepting the sweep produces an ordinary plan that waits for approval', TODO, () => {
  const { sweepOffer } = require('../../backend/semester');
  const offer = sweepOffer({ semesterEnd: '2026-12-15', now: '2027-01-20', projects: [] });
  assert.strictEqual(offer.runsAutomatically, false);
});
