// US-20 (#21) · Keep even file names on my laptop (Could).
const test = require('node:test');
const assert = require('node:assert');
const TODO = { todo: 'US-20 (#21): local model mode not built yet (Could)' };

test('US-20 local mode makes no network request during scan, plan, or validation', TODO, async () => {
  const { makePlan } = require('../../backend/planner');
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls++; throw new Error('network'); };
  try {
    await makePlan({ request: 'Free up space', scan: { root: '/x', files: [], dirs: [], duplicates: [] }, findings: [], profile: { data: { zones: [], preferences: [], targetPlan: { destRoots: [] } }, zoneFor: () => 'free' }, apiKey: 'k', local: true });
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.strictEqual(calls, 0);
});

test('US-20 turning local mode on explains once that plans may be slower', TODO, () => {
  const { localModeNotice } = require('../../backend/planner');
  assert.match(localModeNotice(), /slower or less accurate/);
});
