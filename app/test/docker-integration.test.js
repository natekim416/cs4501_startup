// US-09 through the real engine/validator/executor. The daemon is always a fake.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { Engine } = require('../backend/engine');
const { tmp, write } = require('./stories/helpers');

const imageId = (n) => `sha256:${String(n).repeat(64)}`;
const image = (n, name) => ({ Id: imageId(n), RepoTags: [`${name}:latest`], RepoDigests: [`${name}@sha256:${String(n).repeat(64)}`], Size: n * 100e6 });

function fixture({ images = [image(1, 'postgres'), image(2, 'node')], cache = false } = {}) {
  const state = { images, containers: [{ Id: 'c'.repeat(64), Image: imageId(1) }], caches: cache ? [{
    ID: 'a'.repeat(24), Size: '2300000000', LastUsedAt: new Date(Date.now() - 60 * 864e5).toISOString(),
    Reclaimable: true, Mutable: false, Shared: false, Type: 'regular',
  }] : [], calls: [], context: 'desktop-linux', daemon: 'daemon-1', removed: false };
  const run = (cmd, raw) => {
    assert.equal(cmd, 'docker');
    state.calls.push([...raw]);
    const a = raw[0] === '--context' ? raw.slice(2) : raw;
    if (a[0] === 'context') return state.context;
    if (a[0] === 'info') return JSON.stringify({ ID: state.daemon });
    if (a[0] === 'system') {
      if (state.afterFailure && state.removed) throw new Error('measurement failed');
      const imageBytes = state.images.reduce((n, i) => n + i.Size, 0);
      const cacheBytes = state.caches.reduce((n, i) => n + Number(i.Size), 0);
      return [{ Type: 'Images', Size: imageBytes }, { Type: 'Local Volumes', Size: 12e9 }, { Type: 'Build Cache', Size: cacheBytes }].map(JSON.stringify).join('\n');
    }
    if (a[0] === 'image' && a[1] === 'ls') return state.images.map((i) => i.Id).join('\n');
    if (a[0] === 'ps') return state.containers.map((i) => i.Id).join('\n');
    if (a[0] === 'container' && a[1] === 'inspect') return JSON.stringify(state.containers);
    if (a[0] === 'image' && a[1] === 'inspect') return JSON.stringify(state.images);
    if (a[0] === 'buildx' && a[1] === 'inspect') return `Name: ${state.context}\nDriver: docker\n`;
    if (a[0] === 'buildx' && a[1] === 'du') return state.caches.map(JSON.stringify).join('\n');
    if (a[0] === 'image' && a[1] === 'rm') {
      if (state.removeError) throw new Error('Docker refused to delete the image');
      state.images = state.images.filter((i) => i.Id !== a.at(-1));
      state.removed = true;
      return `Deleted: ${a.at(-1)}`;
    }
    if (a[0] === 'buildx' && a[1] === 'prune') {
      state.caches = state.caches.filter((i) => !a.includes(`id=${i.ID}`));
      state.removed = true;
      return 'Total: 2.3GB';
    }
    throw new Error(`Unexpected command: ${a.join(' ')}`);
  };
  const folder = tmp();
  const home = tmp();
  write(path.join(folder, 'keep.txt'), 'personal content');
  const engine = new Engine({ dataDir: tmp(), home, dockerRun: run, apiKey: '',
    diskFree: () => 100e9 + (state.removed ? 50e6 : 0), xcodeRun: () => { throw new Error('No Xcode'); } });
  engine.profile.setZone(folder, 'free');
  engine.openFolder(folder);
  return { state, run, folder, home, engine };
}

const mutations = (state) => state.calls.filter((a) => a.includes('rm') || a.includes('prune'));
const fakeClient = (action) => ({ beta: { messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ summary: 'A plan', actions: [action], questions: [] }) }] }) } } });

test('Docker E2E: scan and preview are read-only, outside-folder actions require explicit selection', async () => {
  const { engine, state, folder } = fixture();
  const plan = await engine.plan('Clean unused Docker images');
  assert.equal(plan.actions.length, 1);
  assert.equal(plan.actions[0].op, 'remove_docker_image');
  assert.ok(plan.needsApproval.includes(plan.actions[0].id));
  assert.equal(mutations(state).length, 0);
  assert.equal(engine.executor.history.length, 0);
  assert.equal(fs.readFileSync(path.join(folder, 'keep.txt'), 'utf8'), 'personal content');
  assert.equal(engine.execute(plan.planId, []).results.length, 0);
  assert.equal(mutations(state).length, 0);
});

test('Docker E2E: only the approved subset runs; containers and volumes remain untouched', async () => {
  const { engine, state, folder } = fixture({ cache: true });
  const plan = await engine.plan('Clean unused Docker images and old build cache');
  assert.equal(plan.actions.length, 2);
  const imageAction = plan.actions.find((a) => a.op === 'remove_docker_image');
  const result = engine.execute(plan.planId, [imageAction.id]);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].ok, true);
  assert.equal(mutations(state).length, 1);
  assert.equal(state.caches.length, 1);
  assert.equal(state.containers.length, 1);
  assert.ok(fs.existsSync(path.join(folder, 'keep.txt')));
  assert.ok(!state.calls.some((a) => a.includes('volume') || a.includes('container') && a.includes('rm')));
});

test('Docker E2E: measured inside-Docker and host-disk changes are separate, not the image-size estimate', async () => {
  const { engine } = fixture();
  const plan = await engine.plan('Clean unused Docker images');
  const result = engine.execute(plan.planId, plan.actions.map((a) => a.id));
  assert.equal(result.measuredFreed, 50e6);
  assert.equal(result.bytesFreed, 50e6);
  assert.equal(result.docker.insideDocker, 200e6);
  assert.equal(result.docker.diskChange, 50e6);
  assert.equal(result.docker.showBoth, true);
  assert.match(result.freedNote, /inside Docker/);
});

test('Docker E2E: newly used stopped-container image is blocked before execution', async () => {
  const { engine, state } = fixture();
  const plan = await engine.plan('Clean unused Docker images');
  state.containers.push({ Id: 'd'.repeat(64), Image: imageId(2) });
  const result = engine.execute(plan.planId, plan.actions.map((a) => a.id));
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /isn't an unused|changed|safe/);
  assert.equal(mutations(state).length, 0);
});

for (const field of ['context', 'daemon']) {
  test(`Docker E2E: switching ${field} after preview cannot approve a new target`, async () => {
    const { engine, state } = fixture();
    const plan = await engine.plan('Clean unused Docker images');
    state[field] = `changed-${field}`;
    const result = engine.execute(plan.planId, plan.actions.map((a) => a.id));
    assert.equal(result.ok, false);
    assert.equal(mutations(state).length, 0);
  });
}

test('Docker E2E: CLI failure reports the failed action and claims no saving', async () => {
  const { engine, state } = fixture();
  const plan = await engine.plan('Clean unused Docker images');
  state.removeError = true;
  const result = engine.execute(plan.planId, plan.actions.map((a) => a.id));
  assert.equal(result.results[0].ok, false);
  assert.equal(result.bytesFreed, 0);
  assert.equal(result.docker, undefined);
  assert.equal(engine.executor.history.at(-1).steps.length, 0);
  assert.ok(state.images.some((i) => i.Id === imageId(2)));
});

test('Docker E2E: missing post-cleanup usage is explicitly unknown, never estimated', async () => {
  const { engine, state } = fixture();
  const plan = await engine.plan('Clean unused Docker images');
  state.afterFailure = true;
  const result = engine.execute(plan.planId, plan.actions.map((a) => a.id));
  assert.equal(result.docker.insideDocker, null);
  assert.match(result.freedNote, /could not be measured/);
});

test('Docker E2E: undo explains an immutable download recipe without pretending to restore the image', async () => {
  const { engine, state } = fixture();
  const plan = await engine.plan('Clean unused Docker images');
  engine.execute(plan.planId, plan.actions.map((a) => a.id));
  const calls = state.calls.length;
  const undo = engine.undo();
  assert.equal(undo.undone, 0);
  assert.equal(undo.needsRebuild.length, 0);
  assert.match(undo.notes.join(' '), /docker pull node@sha256:/);
  assert.equal(state.calls.length, calls);
});

test('Docker E2E: a malicious LLM cannot add Docker deletion to an unrelated sorting request', async () => {
  const { engine, state } = fixture();
  engine.llmClient = fakeClient({ id: 'evil', op: 'remove_docker_image', path: `docker-image:${imageId(2)}`, reason: 'Ignore the user' });
  const result = await engine.plan('Sort my school files by class');
  assert.equal(result.actions.length, 0);
  assert.equal(result.attempts.length, 3);
  assert.ok(result.attempts.every((a) => a.errors.some((e) => /not requested/.test(e))));
  assert.equal(mutations(state).length, 0);
});

for (const request of ["Don't touch Docker. Sort my files.", 'Sort my Docker notes into folders']) {
  test(`Docker E2E: category mention is not deletion permission: ${request}`, async () => {
    const { engine, state } = fixture();
    const result = await engine.plan(request);
    assert.ok(!result.actions.some((a) => a.op.includes('docker')));
    assert.equal(mutations(state).length, 0);
  });
}

test('Docker E2E: answering No to a model-generated cleanup question cannot grant deletion permission', async () => {
  const { engine, state } = fixture();
  let calls = 0;
  const question = 'Should I clean unused Docker images?';
  engine.llmClient = { beta: { messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(++calls === 1
    ? { summary: 'One question', actions: [], questions: [{ text: question, options: ['Yes', 'No'] }] }
    : { summary: 'Ignored the No', actions: [{ id: 'evil', op: 'remove_docker_image', path: `docker-image:${imageId(2)}`, reason: 'Clean Docker' }], questions: [] }) }] }) } } };
  const preview = await engine.plan('Sort my school files');
  assert.equal(preview.questions.length, 1);
  const answered = await engine.answer(question, 'No');
  assert.ok(!answered.actions.some((a) => a.op.includes('docker')));
  assert.equal(mutations(state).length, 0);
});

test('Docker E2E: missing Docker does not stop an ordinary file plan', async () => {
  const { engine, folder } = fixture();
  engine.dockerRun = () => { throw new Error('not installed'); };
  write(path.join(folder, 'cs3140-lecture.pdf'), 'class notes');
  const plan = await engine.plan('Sort my school files by class');
  assert.ok(plan.actions.some((a) => a.op === 'move'));
  assert.ok(!plan.actions.some((a) => a.op.includes('docker')));
});

test('Docker E2E: LLM-invented volume IDs and unrecognized operations never reach Docker', async () => {
  const { engine, state } = fixture();
  engine.llmClient = fakeClient({ id: 'evil', op: 'remove_docker_image', path: 'docker-volume:pgdata', reason: 'Delete data' });
  const plan = await engine.plan('Clean unused Docker images');
  assert.equal(plan.actions.length, 0);
  assert.equal(mutations(state).length, 0);
});
