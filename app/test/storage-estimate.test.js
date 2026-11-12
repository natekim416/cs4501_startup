// US-16 integration: only the latest explicit scan contributes to reminders.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { Engine } = require('../backend/engine');
const { tmp, write, age, makeJsProject } = require('./stories/helpers');

function setup() {
  const home = tmp();
  const root = tmp();
  const engine = new Engine({ dataDir: tmp(), home, apiKey: '', diskFree: () => 0,
    dockerRun: () => { throw new Error('Docker unavailable in fixture'); },
    xcodeRun: () => JSON.stringify({ devices: {} }),
  });
  engine.profile.setZone(root, 'free');
  return { home, root, engine };
}

test('US-16 storage estimate is zero before a folder is selected and excludes Trash and duplicates', () => {
  const { engine, root } = setup();
  assert.equal(engine.storageEstimate(), 0);
  write(path.join(root, 'a.pdf'), 'duplicate bytes');
  write(path.join(root, 'b.pdf'), 'duplicate bytes');
  engine.openFolder(root);
  assert.ok(engine.snapshot.duplicates.length);
  engine.trashItems = [{ path: path.join(root, '.Trash', 'old.bin'), bytes: 1e9 }];
  assert.equal(engine.storageEstimate(), 0, 'moving duplicates to Trash does not immediately free disk space');
});

test('US-16 storage estimate excludes active, protected, NEVER, and unprovable project artifacts', () => {
  const { engine, root } = setup();
  const old = makeJsProject(root, 'cs3140-old');
  makeJsProject(root, 'cs3140-active', { ageDays: 1 });
  makeJsProject(root, 'cs3140-keep');
  const never = makeJsProject(root, 'cs3140-never');
  makeJsProject(root, 'cs3140-secret', { secret: true });
  makeJsProject(root, 'cs3140-dirty', { dirty: true });
  engine.profile.protect('cs3140-keep');
  engine.profile.setZone(path.join(never, 'node_modules'), 'never');
  engine.openFolder(root);
  const oldBytes = engine.dev.find((d) => d.path === path.join(old, 'node_modules')).bytes;
  assert.ok(oldBytes > 0);
  assert.equal(engine.storageEstimate(), oldBytes);
});

test('US-16 repeated storage checks reuse their estimate without rescanning or re-reading project proof', () => {
  const { engine, root } = setup();
  const old = makeJsProject(root, 'cs3140-old');
  engine.openFolder(root);
  const estimate = engine.storageEstimate();
  assert.ok(estimate > 0);
  engine.scanFolder = () => { throw new Error('timer must never scan'); };
  // A reminder explicitly says latest scan; it does not promise these bytes are still eligible now.
  write(path.join(old, 'node_modules', '.env'), 'new private data since scan');
  for (let i = 0; i < 100; i++) assert.equal(engine.storageEstimate(), estimate);
});

test('US-16 a fresh scan rechecks proof and drops newly unsafe artifacts', () => {
  const { engine, root } = setup();
  const old = makeJsProject(root, 'cs3140-old');
  engine.openFolder(root);
  assert.ok(engine.storageEstimate() > 0);
  write(path.join(old, 'node_modules', '.env'), 'new private data');
  engine.openFolder(root);
  assert.equal(engine.storageEstimate(), 0);
});

test('US-16 global Docker and inactive model-cache candidates contribute without counting recent models', () => {
  const { engine, home, root } = setup();
  function model(name, days) {
    const dir = path.join(home, '.cache', 'huggingface', 'hub', `models--${name}`);
    write(path.join(dir, 'snapshots', 'a'.repeat(40), 'model.safetensors'), 'm'.repeat(8192));
    age(dir, days);
  }
  model('old-model', 60);
  model('recent-model', 1);
  engine.openFolder(root);
  const old = engine.ml.find((m) => m.model === 'old-model');
  assert.ok(old?.offered);
  engine.docker = { available: true, items: [{ type: 'docker-image', label: 'rebuildable', path: 'docker:sha256:fixture', bytes: 1000 }] };
  assert.equal(engine.storageEstimate(), old.bytes + 1000);
});

test('US-16 after an approved cleanup, the reminder estimate is cleared until a new scan', async () => {
  const { engine, root } = setup();
  const project = makeJsProject(root, 'cs3140-old');
  engine.openFolder(root);
  assert.ok(engine.storageEstimate() > 0);
  const plan = await engine.plan('Free up space');
  assert.ok(plan.actions.some((a) => a.path === path.join(project, 'node_modules')));
  assert.equal(engine.execute(plan.planId, plan.actions.map((a) => a.id)).ok, true);
  assert.ok(!fs.existsSync(path.join(project, 'node_modules')));
  assert.equal(engine.storageEstimate(), 0);
});

test('US-16 changing the selected folder to NEVER suppresses even an existing cached estimate', () => {
  const { engine, root } = setup();
  makeJsProject(root, 'cs3140-old');
  engine.openFolder(root);
  assert.ok(engine.storageEstimate() > 0);
  engine.profile.setZone(root, 'never');
  assert.equal(engine.storageEstimate(), 0);
});
