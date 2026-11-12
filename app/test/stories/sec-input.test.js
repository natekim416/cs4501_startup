// INPUT · Hostile or broken input becomes a clear error, never a crash or a silent pass. Red-team F10–F13.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmp, write, makeJsProject } = require('./helpers');
const { Engine } = require('../../backend/engine');
const { rebuildProof } = require('../../backend/devclutter');
const { Profile } = require('../../backend/profile');

const client = (respond) => ({ beta: { messages: { create: respond } } });
const reply = (plan) => async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: typeof plan === 'string' ? plan : JSON.stringify(plan) }] });

function engineWith(llmClient, opts = {}) {
  const root = tmp();
  write(path.join(root, 'notes.pdf'), 'x');
  const engine = new Engine({ dataDir: tmp(), apiKey: '', home: tmp(), trashDir: tmp(), llmClient, ...opts });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  return engine;
}

test('INPUT-1 more kinds of secrets make a build folder irreplaceable, and an unreadable subfolder fails the proof (F10)', () => {
  for (const name of ['.envrc', 'credentials.json', '.npmrc', 'id_ecdsa', '.netrc', 'cert.p12', 'signing.pfx', 'release.keystore', '.env.local']) {
    const project = makeJsProject(tmp(), 'app');
    write(path.join(project, 'node_modules', 'pkg', name), 'secret');
    const proof = rebuildProof(path.join(project, 'node_modules'), { home: tmp() });
    assert.strictEqual(proof.ok, false, `${name} passed`);
    assert.ok(proof.failures.some((f) => f.condition === 'nothing_irreplaceable'), name);
  }
  if (process.getuid && process.getuid() !== 0) {
    const project = makeJsProject(tmp(), 'locked');
    const hidden = path.join(project, 'node_modules', 'private');
    write(path.join(hidden, '.env'), 'SECRET=1');
    fs.chmodSync(hidden, 0o000);
    try {
      const proof = rebuildProof(path.join(project, 'node_modules'), { home: tmp() });
      assert.strictEqual(proof.ok, false, 'an unreadable folder passed');
    } finally {
      fs.chmodSync(hidden, 0o755);
    }
  }
});

test('INPUT-2 malformed plans from the model become validator errors and retries, never a crash (F11)', async () => {
  for (const bad of [null, { summary: 's', actions: [null], questions: [] }, { summary: 's', actions: [{ id: 'a1', op: 'move', path: 123, dest: {}, keep: '', reason: 'x' }], questions: [] }, { summary: 's', actions: [], questions: 5 }, { summary: 's', actions: [], questions: 'abc' }]) {
    const engine = engineWith(client(reply(bad)));
    const plan = await engine.plan('tidy up');
    assert.ok(Array.isArray(plan.questions), JSON.stringify(bad));
    assert.ok(plan.questions.every((q) => q && typeof q.text === 'string' && Array.isArray(q.options) && q.text.length > 1), `${JSON.stringify(bad)} -> ${JSON.stringify(plan.questions)}`);
    assert.ok(Array.isArray(plan.actions));
  }
});

test('INPUT-3 a lockfile that is a folder, or unreadable, fails only that item\'s proof instead of the whole plan (F12)', async () => {
  const root = tmp();
  const project = makeJsProject(root, 'weird');
  fs.rmSync(path.join(project, 'package-lock.json'));
  fs.mkdirSync(path.join(project, 'package-lock.json'));
  makeJsProject(root, 'fine');
  const proof = rebuildProof(path.join(project, 'node_modules'), { home: tmp() });
  assert.strictEqual(proof.ok, false);
  assert.ok(proof.failures.some((f) => f.condition === 'recipe'));
  const engine = new Engine({ dataDir: tmp(), apiKey: '', home: tmp(), trashDir: tmp() });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const plan = await engine.plan('Free up space');
  assert.deepStrictEqual(plan.actions.map((a) => path.basename(path.dirname(a.path))), ['fine']);
});

test('INPUT-4 a rate-limited, failing, or silent Claude gives a plain message, not raw JSON, and never hangs (F13)', async () => {
  const limited = Object.assign(new Error('429 {"type":"error","error":{"type":"rate_limit_error"},"request_id":"req_123"}'), { status: 429 });
  const down = Object.assign(new Error('getaddrinfo ENOTFOUND api.anthropic.com'), { code: 'ENOTFOUND' });
  for (const [err, re] of [[limited, /busy|rate|try again/i], [down, /reach|connection|internet/i]]) {
    const engine = engineWith(client(async () => { throw err; }));
    await assert.rejects(engine.plan('tidy up'), (e) => re.test(e.message) && !/request_id|\{"type"/.test(e.message));
  }
  const hang = engineWith(client(() => new Promise(() => {})), { planTimeoutMs: 200 });
  const started = Date.now();
  await assert.rejects(hang.plan('tidy up'), /didn't answer|timed out|took too long/i);
  assert.ok(Date.now() - started < 3000, 'gave up quickly');
});

test('INPUT-5 execute takes only a list of exact action ids; a string can\'t match ids by substring', async () => {
  const engine = engineWith(null);
  const plan = await engine.plan('Organize everything');
  const res = engine.execute(plan.planId, 'a1a2a3a10');
  assert.strictEqual(res.ok, false);
});

test('INPUT-6 the target plan only accepts real folders outside NEVER zones', () => {
  const profile = new Profile(path.join(tmp(), 'profile.json'));
  assert.throws(() => profile.setTargetPlan({ destRoots: [path.join(require('os').homedir(), 'Library')] }), /NEVER/);
  assert.throws(() => profile.setTargetPlan({ destRoots: ['relative/path'] }), /full path/);
  const ok = tmp();
  profile.setTargetPlan({ destRoots: [ok] });
  assert.deepStrictEqual(profile.data.targetPlan.destRoots, [ok]);
});

test('INPUT-7 a folder to scan must be a full path to a real folder (red-team round 2 note)', () => {
  const engine = new Engine({ dataDir: tmp(), apiKey: '', home: tmp(), trashDir: tmp() });
  assert.throws(() => engine.openFolder('Downloads'), /full path/);
  assert.throws(() => engine.openFolder(42), /full path/);
  assert.throws(() => engine.openFolder(path.join(tmp(), 'missing')), /isn't a folder/);
  const file = write(path.join(tmp(), 'a.txt'), 'x');
  assert.throws(() => engine.openFolder(file), /isn't a folder/);
  const ok = tmp();
  assert.strictEqual(engine.openFolder(ok).folder, ok);
});
