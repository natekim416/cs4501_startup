// US-09 (#10) · Docker images and build cache.
const test = require('node:test');
const assert = require('node:assert');
const TODO = { todo: 'US-09 (#10): Docker cleanup not built yet' };

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

test('US-09 images no container uses are offered with size and "re-downloads on the next pull"', TODO, () => {
  const { dockerItems } = require('../../backend/ecosystems/docker');
  const res = dockerItems({ run: fakeDocker });
  const imgs = res.items.filter((i) => i.type === 'docker-image');
  assert.deepStrictEqual(imgs.map((i) => i.id), ['img2']);
  assert.match(imgs[0].reason, /re-downloads on the next pull/);
});

test('US-09 Docker volumes are never offered', TODO, () => {
  const { dockerItems } = require('../../backend/ecosystems/docker');
  const res = dockerItems({ run: fakeDocker });
  assert.ok(!res.items.some((i) => i.type === 'docker-volume' && i.label === 'rebuildable'));
});

test('US-09 when Docker is not running, it is skipped with a message instead of failing the plan', TODO, () => {
  const { dockerItems } = require('../../backend/ecosystems/docker');
  const res = dockerItems({ run: () => { throw new Error('Cannot connect to the Docker daemon'); } });
  assert.strictEqual(res.available, false);
  assert.match(res.message, /Docker isn't running/);
  assert.deepStrictEqual(res.items, []);
});

test('US-09 when the disk change is smaller than the space freed inside Docker, both numbers are shown', TODO, () => {
  const { reportDockerFreed } = require('../../backend/ecosystems/docker');
  const r = reportDockerFreed({ insideDocker: 1.1e9, diskChange: 0.2e9 });
  assert.strictEqual(r.showBoth, true);
  assert.match(r.text, /inside Docker/);
});
