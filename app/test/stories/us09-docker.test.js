// US-09 (#10). Every Docker call is simulated: these tests never contact a real daemon.
const test = require('node:test');
const assert = require('node:assert/strict');
const { dockerItems, executeDockerItem, reportDockerFreed, dockerFor, sizeBytes } = require('../../backend/ecosystems/docker');
const { tmp } = require('./helpers');

const id = (n) => `sha256:${String(n).repeat(64)}`;
const digest = (name, n) => `${name}@sha256:${String(n).repeat(64)}`;
const now = Date.UTC(2027, 0, 20);
const day = 864e5;
const image = (n, name) => ({ Id: id(n), RepoTags: [`${name}:latest`], RepoDigests: [digest(name, n)], Size: n * 100e6 });
const cache = (name = 'a'.repeat(24), fields = {}) => ({ ID: name, Size: '2300000000', LastUsedAt: new Date(now - 60 * day).toISOString(), Reclaimable: true, Mutable: false, Shared: false, Type: 'regular', ...fields });

function fixture() {
  const state = { images: [image(1, 'postgres'), image(2, 'node')], containers: [{ Id: 'c'.repeat(64), Image: id(1), State: { Status: 'exited' } }], caches: [], calls: [], context: 'desktop-linux', daemon: 'daemon-1', driver: 'docker', afterFailure: false, removed: false };
  const run = (command, raw) => {
    assert.equal(command, 'docker');
    state.calls.push([...raw]);
    const a = raw[0] === '--context' ? raw.slice(2) : raw;
    if (a.join(' ') === 'context show') return state.context;
    if (a[0] === 'info') return JSON.stringify({ ID: state.daemon });
    if (a[0] === 'system' && a[1] === 'df') {
      if (state.afterFailure && state.removed) throw new Error('measurement unavailable');
      const imageSize = state.images.reduce((sum, i) => sum + Number(i.Size), 0);
      const cacheSize = state.caches.reduce((sum, i) => sum + Number(i.Size), 0);
      return [{ Type: 'Images', Size: state.totalImageBytes ?? imageSize }, { Type: 'Containers', Size: '5MB' }, { Type: 'Local Volumes', Size: '20MB' }, { Type: 'Build Cache', Size: cacheSize }].map(JSON.stringify).join('\n');
    }
    if (a[0] === 'image' && a[1] === 'ls') return state.images.map((i) => i.Id).join('\n');
    if (a[0] === 'ps') return state.containers.map((c) => c.Id).join('\n');
    if (a[0] === 'container' && a[1] === 'inspect') return JSON.stringify(state.containers.filter((c) => a.includes(c.Id)));
    if (a[0] === 'image' && a[1] === 'inspect') return JSON.stringify(state.images.filter((i) => a.includes(i.Id)));
    if (a[0] === 'buildx' && a[1] === 'inspect') return `Name: ${state.context}\nDriver: ${state.driver}\n`;
    if (a[0] === 'buildx' && a[1] === 'du') return state.caches.map(JSON.stringify).join('\n');
    if (a[0] === 'image' && a[1] === 'rm') {
      if (state.removeError) throw new Error('Docker refused image removal');
      state.images = state.images.filter((i) => i.Id !== a.at(-1));
      state.removed = true;
      return `Deleted: ${a.at(-1)}`;
    }
    if (a[0] === 'buildx' && a[1] === 'prune') {
      state.caches = state.caches.filter((i) => !a.includes(`id=${i.ID}`));
      state.removed = true;
      return 'Total: 2.3GB';
    }
    throw new Error(`Unexpected Docker command: ${a.join(' ')}`);
  };
  return { state, run, list: () => dockerItems({ run, now }) };
}

const mutations = (state) => state.calls.filter((a) => a.includes('rm') || a.includes('prune'));

test('US-09 only immutable downloaded images unused by running AND stopped containers are offered', () => {
  const { state, list } = fixture();
  state.images.push(image(3, 'redis'));
  state.containers.push({ Id: 'd'.repeat(64), Image: id(3), State: { Status: 'running' } });
  const result = list();
  assert.deepEqual(result.items.map((i) => i.id), [id(2)]);
  assert.match(result.items[0].reason, /re-downloads on the next pull/);
  assert.match(result.items[0].rebuild.note, /docker pull node@sha256:/);
  assert.equal(result.items[0].bytes, 200e6);
  assert.equal(result.inventory.length, 3);
  assert.equal(result.inventory.filter((i) => i.inUse).length, 2);
});

test('US-09 Docker volumes and containers count toward storage but are never cleanup actions', () => {
  const { state, list } = fixture();
  const result = list();
  assert.equal(result.totalBytes, 325e6);
  assert.equal(result.usage['Local Volumes'], 20e6);
  assert.ok(result.items.every((i) => i.type === 'docker-image'));
  assert.equal(mutations(state).length, 0);
  assert.ok(!state.calls.some((a) => a[2] === 'volume' || a.includes('system') && a.includes('prune')));
});

test('US-09 unavailable or malformed daemon information skips Docker without failing other planning', () => {
  for (const run of [() => { throw new Error('Cannot connect'); }, () => 'not-json', () => '{}']) {
    const result = dockerItems({ run, now });
    assert.equal(result.available, false);
    assert.match(result.message, /Docker isn't running/);
    assert.deepEqual(result.items, []);
    assert.equal(result.totalBytes, null);
  }
});

test('US-09 local-only, dangling, malformed-recipe and multiply-tagged images stay untouched', () => {
  const { state, list } = fixture();
  state.containers = [];
  state.images = [
    { ...image(1, 'local'), RepoDigests: [] },
    { ...image(2, 'dangling'), RepoTags: [], RepoDigests: [] },
    { ...image(3, 'bad'), RepoDigests: ['--help'] },
    { ...image(4, 'multiple'), RepoTags: ['first:latest', 'second:latest'] },
  ];
  assert.deepEqual(list().items, []);
  assert.equal(list().inventory.length, 4);
  assert.equal(mutations(state).length, 0);
});

test('US-09 malformed or short IDs never become CLI arguments', () => {
  const { state, list } = fixture();
  state.images = [{ ...image(1, 'bad'), Id: '--force' }];
  const result = list();
  assert.deepEqual(result.items, []);
  assert.match(result.message, /couldn't verify/);
  assert.ok(!state.calls.some((a) => a.includes('inspect') && a.includes('--force')));
});

test('US-09 an incomplete container inspection fails closed', () => {
  const { state, run } = fixture();
  const result = dockerItems({ now, run: (cmd, args) => args.includes('container') ? '[]' : run(cmd, args) });
  assert.deepEqual(result.items, []);
  assert.match(result.message, /couldn't verify/);
  assert.equal(mutations(state).length, 0);
});

test('US-09 image removal uses only the pinned immutable ID, no force, no parent pruning', () => {
  const { state, run, list } = fixture();
  const selected = list().items[0];
  const result = executeDockerItem(selected, { run, now });
  assert.deepEqual(mutations(state), [['--context', 'desktop-linux', 'image', 'rm', '--no-prune', id(2)]]);
  assert.equal(result.insideDocker, 200e6);
  assert.equal(result.measured, true);
  assert.equal(state.containers.length, 1);
});

test('US-09 an image newly used by a stopped container is refused at execution', () => {
  const { state, run, list } = fixture();
  const selected = list().items[0];
  state.containers.push({ Id: 'd'.repeat(64), Image: id(2) });
  assert.throws(() => executeDockerItem(selected, { run, now }), /no longer safe/);
  assert.equal(mutations(state).length, 0);
});

test('US-09 a different daemon, changed digest, absent image or forged identity is refused', () => {
  for (const change of [
    (state) => { state.daemon = 'other-daemon'; },
    (state) => { state.images[1].RepoDigests = [digest('changed', 3)]; },
    (state) => { state.images.pop(); },
  ]) {
    const { state, run, list } = fixture();
    const selected = list().items[0];
    change(state);
    assert.throws(() => executeDockerItem(selected, { run, now }), /changed|no longer safe/);
    assert.equal(mutations(state).length, 0);
  }
  const { state, run, list } = fixture();
  assert.throws(() => executeDockerItem({ ...list().items[0], id: '--force' }, { run, now }), /no longer safe/);
  assert.equal(mutations(state).length, 0);
});

test('US-09 context changes cannot redirect execution to the newly selected context', () => {
  const { state, run, list } = fixture();
  const selected = list().items[0];
  state.context = 'other-context';
  executeDockerItem(selected, { run, now });
  assert.equal(mutations(state)[0][1], 'desktop-linux');
});

test('US-09 image removal errors are surfaced without retrying with force', () => {
  const { state, run, list } = fixture();
  const selected = list().items[0];
  state.removeError = true;
  assert.throws(() => executeDockerItem(selected, { run, now }), /refused/);
  assert.equal(mutations(state).length, 1);
  assert.ok(!mutations(state)[0].includes('--force'));
});

test('US-09 when measurement fails after removal, no virtual-size estimate is claimed as freed', () => {
  const { state, run, list } = fixture();
  const selected = list().items[0];
  state.afterFailure = true;
  const result = executeDockerItem(selected, { run, now });
  assert.equal(result.insideDocker, null);
  assert.equal(result.measured, false);
});

test('US-09 total usage uses Docker aggregate totals rather than double-counting image layers', () => {
  const { state, list } = fixture();
  state.totalImageBytes = 210e6; // two virtual images share 90 MB of layers
  assert.equal(list().totalBytes, 235e6);
  assert.equal(list().inventory.reduce((sum, i) => sum + i.bytes, 0), 300e6);
});

test('US-09 only old, private, immutable, unused regular build cache is offered', () => {
  const { state, list } = fixture();
  state.caches = [cache(), cache('b'.repeat(24), { LastUsedAt: new Date(now - day).toISOString() }),
    cache('c'.repeat(24), { Mutable: true }), cache('d'.repeat(24), { Shared: true }),
    cache('e'.repeat(24), { Reclaimable: false }), cache('f'.repeat(24), { LastUsedAt: null }),
    cache('g'.repeat(24), { Type: 'exec.cachemount' })];
  const offered = list().items.filter((i) => i.type === 'docker-build-cache');
  assert.deepEqual(offered.map((i) => i.id), ['a'.repeat(24)]);
  assert.match(offered[0].reason, /at least 30 days/);
});

test('US-09 cache age threshold is exactly 30 days', () => {
  const { state, list } = fixture();
  state.caches = [cache('a'.repeat(24), { LastUsedAt: new Date(now - 30 * day).toISOString() }),
    cache('b'.repeat(24), { LastUsedAt: new Date(now - 30 * day + 1).toISOString() })];
  assert.deepEqual(list().items.filter((i) => i.type === 'docker-build-cache').map((i) => i.id), ['a'.repeat(24)]);
});

test('US-09 cache removal is restricted to the approved ID, pinned builder, and old unused private records', () => {
  const { state, run, list } = fixture();
  state.caches = [cache(), cache('b'.repeat(24))];
  const selected = list().items.find((i) => i.type === 'docker-build-cache');
  const result = executeDockerItem(selected, { run, now });
  const [command] = mutations(state);
  assert.deepEqual(command, ['--context', 'desktop-linux', 'buildx', 'prune', '--builder', 'desktop-linux',
    '--filter', `id=${selected.id}`, '--filter', 'until=720h', '--filter', 'inuse=false', '--filter', 'mutable=false', '--filter', 'shared=false', '--force']);
  assert.equal(state.caches.length, 1);
  assert.equal(result.insideDocker, 2300e6);
  assert.ok(!command.includes('--all'));
});

test('US-09 cache newly used, shared, or mutable is refused before removal', () => {
  for (const changes of [{ LastUsedAt: new Date(now).toISOString() }, { Reclaimable: false }, { Shared: true }, { Mutable: true }]) {
    const { state, run, list } = fixture();
    state.caches = [cache()];
    const selected = list().items.find((i) => i.type === 'docker-build-cache');
    Object.assign(state.caches[0], changes);
    assert.throws(() => executeDockerItem(selected, { run, now }), /no longer safe/);
    assert.equal(mutations(state).length, 0);
  }
});

test('US-09 unsupported Buildx or nonlocal builder leaves cache untouched but keeps image planning', () => {
  const { state, list } = fixture();
  state.caches = [cache()];
  state.driver = 'docker-container';
  assert.deepEqual(list().items.map((i) => i.type), ['docker-image']);
  assert.equal(mutations(state).length, 0);
});

test('US-09 malformed Buildx output cannot create cleanup actions', () => {
  const { state, run } = fixture();
  state.caches = [cache()];
  const result = dockerItems({ now, run: (cmd, args) => args.includes('du') ? 'not-json' : run(cmd, args) });
  assert.deepEqual(result.items.map((i) => i.type), ['docker-image']);
  assert.match(result.message, /couldn't inspect old build cache/);
});

test('US-09 when disk change differs from space freed inside Docker, both are shown', () => {
  const result = reportDockerFreed({ insideDocker: 1.1e9, diskChange: 0.2e9 });
  assert.equal(result.showBoth, true);
  assert.match(result.text, /1.10 GB freed inside Docker/);
  assert.match(result.text, /0.20 GB change in free disk space/);
  assert.equal(reportDockerFreed({ insideDocker: 0, diskChange: 0 }).showBoth, false);
  assert.match(reportDockerFreed({ insideDocker: null, diskChange: -1e9 }).text, /couldn't be measured/);
});

test('US-09 size parsing accepts documented units and fails closed on malformed values', () => {
  for (const [raw, bytes] of [['1.1GB', 1.1e9], ['400 MB', 400e6], ['1GiB', 1024 ** 3], ['0B', 0], ['1234', 1234]]) assert.equal(sizeBytes(raw), bytes);
  for (const raw of ['unknown', '-1MB', '1MB (50%)', Infinity, null, {}, '1e100GB']) assert.equal(sizeBytes(raw), null);
});

test('US-09 the default runner refuses a practice home before invoking Docker', () => {
  assert.throws(() => dockerFor(tmp())('docker', ['info']), /practice home/);
});

test('US-09 duplicate container inspections cannot hide a second container dependency', () => {
  const { state, run } = fixture();
  state.containers.push({ Id: 'd'.repeat(64), Image: id(2) });
  const result = dockerItems({ now, run: (command, args) => args.includes('container')
    ? JSON.stringify([state.containers[0], state.containers[0]]) : run(command, args) });
  assert.deepEqual(result.items, []);
  assert.equal(mutations(state).length, 0);
});

test('US-09 malformed sizes and duplicate aggregate rows remain unknown, never reported as zero', () => {
  for (const response of [
    JSON.stringify([{ Type: 'Images', Size: 'unknown' }]),
    JSON.stringify([{ Type: 'Images', Size: '1GB' }, { Type: 'Images', Size: '1GB' }]),
    JSON.stringify([{ Type: 'Containers', Size: '1GB' }]),
  ]) {
    const { run } = fixture();
    const result = dockerItems({ now, run: (command, args) => args.includes('system') ? response : run(command, args) });
    assert.equal(result.totalBytes, null);
    assert.match(result.message, /couldn't measure/);
  }
});

test('US-09 absent Buildx is harmless and an invalid clock cannot classify cache as old', () => {
  const { state, run } = fixture();
  state.caches = [cache()];
  const absent = dockerItems({ now, run: (command, args) => {
    if (args.includes('buildx')) throw new Error('unknown command');
    return run(command, args);
  } });
  assert.deepEqual(absent.items.map((i) => i.type), ['docker-image']);
  assert.match(absent.message, /couldn't inspect old build cache/);
  assert.deepEqual(dockerItems({ run, now: NaN }).items.map((i) => i.type), ['docker-image']);
});

test('US-09 no Docker proof, invalid contexts, and unknown ops never run a removal', () => {
  const { state, run, list } = fixture();
  for (const item of [null, {}, { ...list().items[0], context: '--help' }, { ...list().items[0], type: 'docker-volume' }]) {
    assert.throws(() => executeDockerItem(item, { run, now }), /No verified|no longer safe/);
  }
  assert.equal(mutations(state).length, 0);
});
