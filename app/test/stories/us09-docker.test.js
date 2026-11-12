// US-09 (#10) · Docker images and build cache.
const test = require('node:test');
const assert = require('node:assert');

// Fake `docker` CLI output: two images, one used by a stopped container, plus a volume.
function fakeDocker(cmd, args) {
  const a = args.join(' ');
  if (a.startsWith('info')) return '{}';
  if (a.startsWith('image ls')) return ['{"ID":"img1","Repository":"postgres","Tag":"16","Size":"400MB"}', '{"ID":"img2","Repository":"node","Tag":"18","Size":"1.1GB"}'].join('\n');
  if (a.startsWith('ps -a')) return '{"Image":"postgres:16","ImageID":"img1","State":"exited"}';
  if (a.startsWith('volume ls')) return '{"Name":"pgdata"}';
  if (a.startsWith('builder du')) return 'Total: 2.3GB';
  return '';
}

test('US-09 images no container uses are offered with size and "re-downloads on the next pull"', () => {
  const { dockerItems } = require('../../backend/ecosystems/docker');
  const res = dockerItems({ run: fakeDocker });
  const imgs = res.items.filter((i) => i.type === 'docker-image');
  assert.deepStrictEqual(imgs.map((i) => i.id), ['img2']);
  assert.match(imgs[0].reason, /re-downloads on the next pull/);
});

test('US-09 Docker volumes are never offered', () => {
  const { dockerItems } = require('../../backend/ecosystems/docker');
  const res = dockerItems({ run: fakeDocker });
  assert.ok(!res.items.some((i) => i.type === 'docker-volume' && i.label === 'rebuildable'));
});

test('US-09 when Docker is not running, it is skipped with a message instead of failing the plan', () => {
  const { dockerItems } = require('../../backend/ecosystems/docker');
  const res = dockerItems({ run: () => { throw new Error('Cannot connect to the Docker daemon'); } });
  assert.strictEqual(res.available, false);
  assert.match(res.message, /Docker isn't running/);
  assert.deepStrictEqual(res.items, []);
});

test('US-09 when the disk change is smaller than the space freed inside Docker, both numbers are shown', () => {
  const { reportDockerFreed } = require('../../backend/ecosystems/docker');
  const r = reportDockerFreed({ insideDocker: 1.1e9, diskChange: 0.2e9 });
  assert.strictEqual(r.showBoth, true);
  assert.match(r.text, /inside Docker/);
});

// Engine-level: the whole flow with a fake docker that records what it was asked to run.
function dockerEngine() {
  const { tmp } = require('./helpers');
  const { Engine } = require('../../backend/engine');
  const calls = [];
  const run = (cmd, args) => {
    calls.push(args.join(' '));
    return fakeDocker(cmd, args);
  };
  const folder = tmp();
  const engine = new Engine({ dataDir: tmp(), apiKey: '', home: tmp(), trashDir: tmp(), dockerRun: run });
  engine.profile.setZone(folder, 'free');
  engine.scanFolder(folder);
  return { engine, calls };
}

test('US-09 "clean up Docker" plans the unused image and the build cache; approving removes exactly those, and undo says how they come back', async () => {
  const { engine, calls } = dockerEngine();
  const plan = await engine.plan('Clean up Docker');
  assert.deepStrictEqual(plan.actions.map((a) => [a.op, a.path]).sort(), [['remove_docker', 'docker-image:img2'], ['remove_docker', 'docker:build-cache']]);
  const run = engine.execute(plan.planId, plan.actions.map((a) => a.id));
  assert.strictEqual(run.ok, true, JSON.stringify(run.errors));
  assert.ok(calls.includes('image rm img2'));
  assert.ok(calls.includes('builder prune -f'));
  assert.ok(!calls.some((c) => /img1|volume rm/.test(c)), 'the used image and the volume are never touched');
  const undo = engine.undo();
  assert.match(undo.notes.join(' '), /docker pull node:18/);
});

test('US-09 the validator refuses an image a container uses, a volume, or anything the Docker check didn\'t find', () => {
  const { engine } = dockerEngine();
  const { validate } = require('../../backend/validator');
  const ctx = { scan: engine.snapshot, findings: [], profile: engine.profile, home: engine.home, docker: engine.docker };
  for (const p of ['docker-image:img1', 'docker-volume:pgdata', 'docker-image:made-up']) {
    const res = validate({ actions: [{ id: 'a1', op: 'remove_docker', path: p, dest: '', keep: '', reason: 'x' }] }, ctx);
    assert.strictEqual(res.ok, false, `${p} was allowed`);
  }
});
