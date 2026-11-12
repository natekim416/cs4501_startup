// Disposable-daemon smoke test. Never enabled on a developer's machine, even by test:live.
// The workflow runs this on a fresh GitHub-hosted Ubuntu VM; all mutations are restricted below.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const enabled = process.env.CLEANASAURUS_DOCKER_LIVE === '1' && process.env.GITHUB_ACTIONS === 'true';
const IMAGE = 'alpine:3.21.10'; // Fixed official Alpine patch release, never "latest".

test('DOCKER-LIVE: a stopped container protects its image; only the explicitly approved disposable image is removed', {
  skip: enabled ? false : 'requires CLEANASAURUS_DOCKER_LIVE=1 and GITHUB_ACTIONS=true on an ephemeral runner',
  timeout: 5 * 60_000,
}, async (t) => {
  assert.equal(process.platform, 'linux', 'This live test is restricted to the disposable Linux workflow.');
  const { Engine } = require('../../backend/engine');
  const { dockerItems } = require('../../backend/ecosystems/docker');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanasaurus-docker-live-'));
  const home = path.join(base, 'home');
  const folder = path.join(base, 'Downloads');
  fs.mkdirSync(home);
  fs.mkdirSync(folder);
  const personalFile = path.join(folder, 'keep.txt');
  fs.writeFileSync(personalFile, 'This personal file must survive the entire smoke test.');
  const containerName = `cleanasaurus-live-${process.pid}-${Date.now()}`;
  let context = null;
  let imageId = null;
  let containerId = null;
  let approvedImage = false;
  let cleanupOwnedImage = false;
  let imageOwned = false;
  const mutations = [];
  const invoke = (args) => execFileSync('docker', args, { encoding: 'utf8', stdio: 'pipe', timeout: 90_000, maxBuffer: 16 * 1024 * 1024 });
  const same = (actual, expected) => actual.length === expected.length && actual.every((value, i) => value === expected[i]);

  // This is the ONLY gateway to Docker in this test. Unknown commands and all broad prune commands
  // are rejected before starting a process. Even a faulty engine can mutate only our exact fixture.
  const run = (command, raw) => {
    assert.equal(command, 'docker');
    assert.ok(Array.isArray(raw) && raw.every((arg) => typeof arg === 'string'));
    if (same(raw, ['context', 'show'])) return invoke(raw);
    assert.equal(raw[0], '--context');
    assert.equal(raw[1], context, 'Every command must stay on the original context.');
    const args = raw.slice(2);
    const prefix = args.slice(0, 2).join(' ');
    const readOnly = ['image ls', 'image inspect', 'container inspect', 'system df', 'buildx inspect', 'buildx du'].includes(prefix)
      || args[0] === 'info' || args[0] === 'ps';
    if (readOnly) return invoke(raw);
    const pull = same(args, ['pull', IMAGE]) && !imageId;
    const create = imageId && same(args, ['container', 'create', '--name', containerName,
      '--label', 'cleanasaurus-live-test=1', imageId, 'true']);
    const removeContainer = containerId && same(args, ['container', 'rm', containerId]);
    const removeImage = imageOwned && imageId && (approvedImage || cleanupOwnedImage)
      && same(args, ['image', 'rm', '--no-prune', imageId]);
    assert.ok(pull || create || removeContainer || removeImage, `Blocked unapproved Docker mutation: ${JSON.stringify(args)}`);
    mutations.push([...args]);
    return invoke(raw);
  };
  const call = (args) => run('docker', ['--context', context, ...args]);
  try {
    context = run('docker', ['context', 'show']).trim();
    assert.match(context, /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/);
    const beforeIds = new Set(call(['image', 'ls', '--quiet', '--no-trunc']).trim().split(/\s+/).filter(Boolean));
    let existingTag = false;
    try { existingTag = JSON.parse(call(['image', 'inspect', IMAGE])).length > 0; } catch (error) {
      if (error.status !== 1) throw error;
    }
    assert.equal(existingTag, false, 'The fixture tag already exists; do not retarget another runner image.');
    call(['pull', IMAGE]);
    const pulled = JSON.parse(call(['image', 'inspect', IMAGE]));
    assert.equal(pulled.length, 1);
    imageId = pulled[0].Id;
    assert.match(imageId, /^sha256:[a-f0-9]{64}$/);
    assert.ok(Array.isArray(pulled[0].RepoDigests) && pulled[0].RepoDigests.length > 0, 'Fixture must have a registry download recipe.');
    // An existing image belongs to another runner fixture. Do not remove or retag it.
    assert.ok(!beforeIds.has(imageId), 'The disposable fixture image already existed; use a fresh runner.');
    imageOwned = true;
    containerId = call(['container', 'create', '--name', containerName,
      '--label', 'cleanasaurus-live-test=1', imageId, 'true']).trim();
    assert.match(containerId, /^[a-f0-9]{64}$/);
    const stopped = JSON.parse(call(['container', 'inspect', containerId]))[0];
    assert.equal(stopped.State.Running, false);
    assert.equal(stopped.Image, imageId);

    const protectedInventory = dockerItems({ run });
    assert.equal(protectedInventory.available, true, protectedInventory.message);
    assert.ok(protectedInventory.inventory.some((item) => item.id === imageId && item.inUse));
    assert.ok(!protectedInventory.items.some((item) => item.id === imageId), 'Stopped containers must protect their images.');
    t.diagnostic('Real CLI inspection excluded the image while its stopped container existed.');

    call(['container', 'rm', containerId]);
    containerId = null;
    const engine = new Engine({ dataDir: path.join(base, 'data'), home, apiKey: '', dockerRun: run,
      xcodeRun: () => { throw new Error('No Xcode in the disposable Linux fixture'); } });
    engine.profile.setZone(folder, 'free');
    engine.openFolder(folder);
    const plan = await engine.plan('Clean unused Docker images');
    const selected = plan.actions.find((action) => action.op === 'remove_docker_image' && action.path === `docker-image:${imageId}`);
    assert.ok(selected, `Our unused downloadable image was not offered: ${JSON.stringify({ plan, inventory: engine.docker })}`);
    assert.ok(plan.needsApproval.includes(selected.id), 'External Docker cleanup must start unchecked.');
    assert.equal(mutations.filter((args) => args[0] === 'image' && args[1] === 'rm').length, 0, 'Preview must not delete anything.');
    approvedImage = true;
    const result = engine.execute(plan.planId, [selected.id]);
    approvedImage = false;
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].ok, true, JSON.stringify(result.results));
    assert.ok(Number.isFinite(result.docker.insideDocker) && result.docker.insideDocker >= 0, 'Docker logical savings must be measured.');
    assert.ok(Number.isFinite(result.docker.diskChange), 'Host disk change must be reported separately.');
    const remaining = call(['image', 'ls', '--quiet', '--no-trunc']).trim().split(/\s+/).filter(Boolean);
    assert.ok(!remaining.includes(imageId), 'The approved disposable image should be gone.');
    assert.equal(fs.readFileSync(personalFile, 'utf8'), 'This personal file must survive the entire smoke test.');
    assert.deepEqual(mutations.filter((args) => args[0] === 'image' && args[1] === 'rm'), [['image', 'rm', '--no-prune', imageId]]);
    assert.ok(!mutations.some((args) => args.includes('prune') || args.includes('--force') || args[0] === 'volume'));
    t.diagnostic(JSON.stringify({ imageId, digest: pulled[0].RepoDigests[0], insideDocker: result.docker.insideDocker, hostDiskChange: result.docker.diskChange, fixtureCommands: mutations }));
  } finally {
    // Cleanup only the fixture's own immutable identities; never delete a preexisting runner resource.
    if (containerId) {
      try { call(['container', 'rm', containerId]); } catch (error) { t.diagnostic(`Fixture container cleanup: ${error.message}`); }
    }
    if (imageOwned && imageId) {
      const remaining = call(['image', 'ls', '--quiet', '--no-trunc']).trim().split(/\s+/).filter(Boolean);
      if (remaining.includes(imageId)) {
        cleanupOwnedImage = true;
        try { call(['image', 'rm', '--no-prune', imageId]); } catch (error) { t.diagnostic(`Fixture image cleanup: ${error.message}`); }
      }
    }
  }
});
