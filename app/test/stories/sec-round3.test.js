// SEC round 3 · Findings from the red team's pass over the Beta stories (docker, ML, batching, local mode).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmp, write, makeJsProject } = require('./helpers');
const { Engine } = require('../../backend/engine');
const { validate } = require('../../backend/validator');

const act = (a) => ({ dest: '', keep: '', reason: 'test', ...a });
const reply = (plans) => {
  const queue = [...plans];
  return { beta: { messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(typeof queue[0] === 'function' ? queue.shift()() : queue.length > 1 ? queue.shift() : queue[0]) }] }) } } };
};

test('R3-1 two actions sharing an id are rejected, so approving one can never run the other (F1)', () => {
  const root = tmp();
  write(path.join(root, 'taxes.pdf'), 'x');
  write(path.join(root, 'taxes copy.pdf'), 'x');
  fs.mkdirSync(path.join(root, 'Docs'));
  const engine = new Engine({ dataDir: tmp(), apiKey: '', home: tmp(), trashDir: tmp() });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const plan = { actions: [
    act({ id: 'a2', op: 'move', path: path.join(root, 'taxes copy.pdf'), dest: path.join(root, 'Docs') }),
    act({ id: 'a2', op: 'trash_duplicate', path: path.join(root, 'taxes.pdf'), keep: path.join(root, 'taxes copy.pdf') }),
  ] };
  const res = validate(plan, { scan: engine.snapshot, findings: [], profile: engine.profile, home: engine.home });
  assert.strictEqual(res.ok, false);
  assert.match(res.errors.map((e) => e.message).join(' '), /share the id|unique/i);
  const missing = validate({ actions: [act({ op: 'mkdir', path: path.join(root, 'New') })] }, { scan: engine.snapshot, findings: [], profile: engine.profile, home: engine.home });
  assert.strictEqual(missing.ok, false, 'an action with no id is rejected too');
});

test('R3-2 a Mac-wide item (a build folder, a Docker image) appears once in a batched plan, not once per batch (F2)', async () => {
  const root = tmp();
  makeJsProject(root, 'old-app');
  for (let i = 0; i < 850; i++) write(path.join(root, 'files', `f${i}.txt`), `x${i}`);
  const nm = path.join(root, 'old-app', 'node_modules');
  const plan = { summary: 's', questions: [], actions: [act({ id: 'a1', op: 'delete_rebuildable', path: nm }), act({ id: 'a2', op: 'remove_docker', path: 'docker-image:img2' })] };
  const docker = (cmd, args) => {
    const a = args.join(' ');
    if (a.startsWith('image ls')) return '{"ID":"img2","Repository":"node","Tag":"18","Size":"1.1GB"}';
    return a.startsWith('info') ? '{}' : a.startsWith('builder du') ? 'Total: 0B' : '';
  };
  const engine = new Engine({ dataDir: tmp(), apiKey: '', home: tmp(), trashDir: tmp(), llmClient: reply([plan]), dockerRun: docker });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const res = await engine.plan('Free up as much space as you can');
  const keys = res.actions.map((a) => `${a.op} ${a.path}`);
  assert.strictEqual(keys.length, new Set(keys).size, `repeated: ${keys.join(' | ')}`);
  assert.deepStrictEqual(keys.sort(), [`delete_rebuildable ${nm}`, 'remove_docker docker-image:img2']);
  // The validator also refuses the same thing twice, whoever writes the plan.
  const twice = validate({ actions: [act({ id: 'x1', op: 'remove_docker', path: 'docker-image:img2' }), act({ id: 'x2', op: 'remove_docker', path: 'docker-image:img2' })] }, { scan: engine.snapshot, findings: [], profile: engine.profile, home: engine.home, docker: engine.docker });
  assert.strictEqual(twice.ok, false);
});

test('R3-3 a batched plan over 500 actions keeps the first 500 and says so, instead of throwing everything away (F3)', async () => {
  const root = tmp();
  for (let i = 0; i < 1300; i++) write(path.join(root, `f${String(i).padStart(4, '0')}.pdf`), `x${i}`);
  const client = { beta: { messages: { create: async (req) => {
    const snap = JSON.parse(req.messages[0].content.split('(file names and metadata only):\n')[1].split('\n\n')[0]);
    const actions = snap.files.map((f, i) => act({ id: `m${i}`, op: 'rename', path: f.path, dest: f.path.replace(/\.pdf$/, '-renamed.pdf') }));
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ summary: 's', questions: [], actions }) }] };
  } } } };
  const engine = new Engine({ dataDir: tmp(), apiKey: '', home: tmp(), trashDir: tmp(), llmClient: client });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const res = await engine.plan('Rename everything');
  assert.strictEqual(res.actions.length, 500);
  assert.ok(res.questions.some((q) => /first 500/.test(q.text)), JSON.stringify(res.questions.map((q) => q.text)));
});

test('R3-4 when every docker rm fails, the result does not claim space was freed inside Docker (F5)', async () => {
  const docker = (cmd, args) => {
    const a = args.join(' ');
    if (a.startsWith('image rm')) throw new Error('Error response from daemon: conflict');
    if (a.startsWith('image ls')) return '{"ID":"img2","Repository":"node","Tag":"18","Size":"1.1GB"}';
    return a.startsWith('info') ? '{}' : a.startsWith('builder du') ? 'Total: 0B' : '';
  };
  const folder = tmp();
  const engine = new Engine({ dataDir: tmp(), apiKey: '', home: tmp(), trashDir: tmp(), dockerRun: docker });
  engine.profile.setZone(folder, 'free');
  engine.scanFolder(folder);
  const plan = await engine.plan('Clean up Docker');
  const run = engine.execute(plan.planId, plan.actions.map((a) => a.id));
  assert.ok(!/inside Docker/.test(run.freedNote || ''), run.freedNote);
});

test('R3-5 a corrupt profile fails closed to local mode, so file names never leave the Mac by accident (F7)', () => {
  const dataDir = tmp();
  const a = new Engine({ dataDir, apiKey: 'sk-test', home: tmp(), trashDir: tmp() });
  a.setLocalMode(true);
  fs.writeFileSync(path.join(dataDir, 'profile.json'), '{ not json');
  const b = new Engine({ dataDir, apiKey: 'sk-test', home: tmp(), trashDir: tmp() });
  assert.strictEqual(b.mode, 'local');
});

test('R3-6 an image a container uses by digest or by full name is never offered, and one image with two tags is listed once (F4)', () => {
  const { dockerItems } = require('../../backend/ecosystems/docker');
  const run = (cmd, args) => {
    const a = args.join(' ');
    if (a.startsWith('info')) return '{}';
    if (a.startsWith('image ls')) return ['{"ID":"sha256:aaa111","Repository":"nginx","Tag":"1.25","Size":"200MB"}', '{"ID":"sha256:bbb222","Repository":"docker.io/library/web","Tag":"v1","Size":"300MB"}', '{"ID":"sha256:ccc333","Repository":"node","Tag":"18","Size":"1.1GB"}', '{"ID":"sha256:ccc333","Repository":"node","Tag":"lts","Size":"1.1GB"}'].join('\n');
    if (a.startsWith('ps -a')) return ['{"Image":"nginx@sha256:deadbeef"}', '{"Image":"web:v1"}'].join('\n');
    if (a.startsWith('image inspect')) return { 'nginx@sha256:deadbeef': 'sha256:aaa111', 'web:v1': 'sha256:bbb222' }[args.at(-1)] || '';
    if (a.startsWith('builder du')) return 'Total: 0B';
    return '';
  };
  const items = dockerItems({ run }).items.filter((i) => i.type === 'docker-image');
  assert.deepStrictEqual(items.map((i) => i.id), ['sha256:ccc333']);
});

test('R3-7 an image id that looks like a flag ("--all") is never passed to docker (F11)', () => {
  const { dockerItems } = require('../../backend/ecosystems/docker');
  const run = (cmd, args) => {
    const a = args.join(' ');
    if (a.startsWith('info')) return '{}';
    if (a.startsWith('image ls')) return ['{"ID":"--all","Repository":"x","Tag":"1","Size":"1MB"}', '{"ID":"-f img1","Repository":"y","Tag":"1","Size":"1MB"}'].join('\n');
    return a.startsWith('builder du') ? 'Total: 0B' : '';
  };
  assert.deepStrictEqual(dockerItems({ run }).items, []);
});

test('R3-8 clicking the storage-watch notification counts as handled, so it can notify again later instead of going silent (F10)', () => {
  const { StorageWatch } = require('../../backend/storage-watch');
  const sent = [];
  const w = new StorageWatch({ notify: (n) => sent.push(n), estimate: () => 5e9 });
  w.check({ usedFraction: 0.9, now: 0 });
  w.opened({ now: 0 });
  w.check({ usedFraction: 0.99, now: 8 * 864e5 });
  assert.strictEqual(sent.length, 2);
  // Even if the notification is never clicked or closed, it doesn't stay pending forever.
  const quiet = [];
  const w2 = new StorageWatch({ notify: (n) => quiet.push(n), estimate: () => 5e9 });
  w2.check({ usedFraction: 0.9, now: 0 });
  w2.check({ usedFraction: 0.9, now: 8 * 864e5 });
  assert.strictEqual(quiet.length, 2);
});

test('R3-9 the usage log records local mode and Docker removals as counts (F12)', () => {
  const { UsageLog } = require('../../backend/usage-log');
  const { Profile } = require('../../backend/profile');
  const dir = tmp();
  const l = new UsageLog(path.join(dir, 'u.jsonl'), new Profile(path.join(dir, 'p.json')));
  l.setEnabled(true);
  l.record('plan', { mode: 'local', ops_remove_docker: 2 });
  const text = fs.readFileSync(l.file, 'utf8');
  assert.match(text, /"mode":"local"/);
  assert.match(text, /"ops_remove_docker":2/);
});

test('R3-10 a model read yesterday is not "unused" just because its files are old (F9)', () => {
  const { mlItems } = require('../../backend/ecosystems/ml');
  const home = tmp();
  const file = write(path.join(home, '.cache', 'huggingface', 'hub', 'models--org--m', 'snapshots', 'a', 'w.bin'), 'w');
  const old = new Date(Date.now() - 90 * 864e5);
  const { age } = require('./helpers');
  age(path.join(home, '.cache', 'huggingface', 'hub', 'models--org--m'), 90);
  fs.utimesSync(file, new Date(Date.now() - 864e5), old); // read yesterday, written 90 days ago
  const [item] = mlItems({ home });
  assert.strictEqual(item.offered, false, item.reason);
});

test('R3-11 the semester sweep plans exactly its own projects; a folder name can\'t add another (F8)', async () => {
  const root = tmp();
  makeJsProject(root, 'CS2100 notes, myapp', { ageDays: 90 });
  makeJsProject(root, 'myapp', { ageDays: 2 });
  const engine = new Engine({ dataDir: tmp(), apiKey: '', home: tmp(), trashDir: tmp() });
  engine.profile.setZone(root, 'free');
  engine.profile.data.semesterEnd = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10);
  const info = engine.openFolder(root);
  assert.deepStrictEqual(info.sweep.projects, ['CS2100 notes, myapp']);
  const plan = await engine.plan(info.sweep.request);
  assert.ok(!plan.actions.some((a) => path.basename(path.dirname(a.path)) === 'myapp'), plan.actions.map((a) => a.path).join(', '));
});

test('R3-12 a batch that fails is reported without raw paths or internal error text (F6)', () => {
  const { mergeBatchPlans } = require('../../backend/planner');
  const merged = mergeBatchPlans([{ ok: false, actions: [], error: '/Users/x/secret-project/file.txt does not exist (or was already moved/removed earlier in this plan).' }]);
  assert.doesNotMatch(merged.questions[0].text, /\/Users|secret-project/);
});

test('R3-13 real docker inspect ids ("sha256:" + 64 hex) match image ls short ids, so used images stay protected (F4)', () => {
  const { dockerItems } = require('../../backend/ecosystems/docker');
  const full = 'sha256:aaa111bbb222ccc333ddd444eee555fff666aaa111bbb222ccc333ddd444eee5';
  const run = (cmd, args) => {
    const a = args.join(' ');
    if (a.startsWith('info')) return '{}';
    if (a.startsWith('image ls')) return '{"ID":"aaa111bbb222","Repository":"nginx","Tag":"1.25","Size":"200MB"}';
    if (a.startsWith('ps -a')) return '{"Image":"nginx@sha256:deadbeef"}';
    if (a.startsWith('image inspect')) return `${full}\n`;
    return a.startsWith('builder du') ? 'Total: 0B' : '';
  };
  assert.deepStrictEqual(dockerItems({ run }).items, []);
});

test('R3-14 the usage log counts Docker and simulator removals (F12)', () => {
  const { Engine } = require('../../backend/engine');
  const engine = new Engine({ dataDir: tmp(), apiKey: '', home: tmp(), trashDir: tmp() });
  const counts = engine.countOpsFor([{ op: 'remove_docker' }, { op: 'remove_docker' }, { op: 'remove_simulator' }]);
  assert.strictEqual(counts.ops_remove_docker, 2);
  assert.strictEqual(counts.ops_remove_simulator, 1);
});
