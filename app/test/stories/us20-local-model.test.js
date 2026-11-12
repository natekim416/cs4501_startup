// US-20 (#21) · Keep even file names on my laptop (Could).
const test = require('node:test');
const assert = require('node:assert');

test('US-20 local mode makes no network request during scan, plan, or validation', async () => {
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

test('US-20 turning local mode on explains once that plans may be slower', () => {
  const { localModeNotice } = require('../../backend/planner');
  assert.match(localModeNotice(), /slower or less accurate/);
});

test('US-20 with local mode on, the engine plans with on-device rules and makes no network request, even with a key set', async () => {
  const { tmp, write } = require('./helpers');
  const { Engine } = require('../../backend/engine');
  const path = require('path');
  const root = tmp();
  write(path.join(root, 'a.pdf'), 'x');
  const engine = new Engine({ dataDir: tmp(), apiKey: 'sk-test', home: tmp(), trashDir: tmp() });
  engine.profile.setZone(root, 'free');
  const notice = engine.setLocalMode(true);
  assert.match(notice, /slower or less accurate/);
  engine.scanFolder(root);
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls++; throw new Error('network'); };
  try {
    const plan = await engine.plan('Organize everything');
    assert.strictEqual(plan.mode, 'local');
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.strictEqual(calls, 0);
  assert.strictEqual(engine.setLocalMode(true), null, 'the notice is shown once');
});
