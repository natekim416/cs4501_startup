// US-12 (#13) · Show the real space freed.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmp, makeJsProject } = require('./helpers');
const { Engine } = require('../../backend/engine');

// A fake disk whose free space we control, so the measured change is deterministic.
function fakeDisk(start, afterRun) {
  let calls = 0;
  return () => (calls++ === 0 ? start : afterRun);
}

async function runAll(engine, request) {
  const plan = await engine.plan(request);
  return engine.execute(plan.planId, plan.actions.map((a) => a.id));
}

test('US-12 FREED is the measured change in free disk space, not the size of the files touched', async () => {
  const root = tmp();
  makeJsProject(root, 'old-app', { kb: 256 });
  const engine = new Engine({ dataDir: tmp(), apiKey: '', diskFree: fakeDisk(1_000_000_000, 1_000_300_000) });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const run = await runAll(engine, 'Free up space');
  assert.ok(run.ok, JSON.stringify(run.errors));
  assert.strictEqual(run.measuredFreed, 300_000);
  assert.strictEqual(run.bytesFreed, 300_000, 'the number shown as FREED is the measured one');
  assert.ok(run.estimatedFreed > 0);
});

test('US-12 a rebuildable folder is really deleted, so the space really comes back', async () => {
  const root = tmp();
  const project = makeJsProject(root, 'old-app');
  const engine = new Engine({ dataDir: tmp(), apiKey: '' });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const run = await runAll(engine, 'Free up space');
  assert.ok(run.ok, JSON.stringify(run.errors));
  assert.ok(!fs.existsSync(path.join(project, 'node_modules')));
  assert.ok(fs.existsSync(path.join(project, 'package-lock.json')), 'the recipe stays');
  assert.ok(fs.existsSync(path.join(project, 'index.js')), 'source code stays');
});

test('US-12 when the estimate and the measured change differ by more than 10%, both are shown', async () => {
  const root = tmp();
  makeJsProject(root, 'old-app', { kb: 256 });
  const engine = new Engine({ dataDir: tmp(), apiKey: '', diskFree: fakeDisk(5_000_000, 5_000_001) });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const run = await runAll(engine, 'Free up space');
  assert.strictEqual(run.showBoth, true);
  assert.match(run.freedNote, /estimated/i);
});

test('US-12 files moved to the bin are noted as freeing up only when it is emptied', async () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.pdf'), 'same');
  fs.writeFileSync(path.join(root, 'a (1).pdf'), 'same');
  const engine = new Engine({ dataDir: tmp(), apiKey: '', diskFree: fakeDisk(100, 100) });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const run = await runAll(engine, 'Free up space');
  assert.ok(run.ok);
  assert.strictEqual(run.measuredFreed, 0);
  assert.match(run.freedNote, /when you empty/i);
});
