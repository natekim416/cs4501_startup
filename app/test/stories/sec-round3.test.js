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
