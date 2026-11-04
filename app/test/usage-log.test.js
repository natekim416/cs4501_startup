const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { Engine } = require('../backend/engine');

function setup() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanasaurus-usage-'));
  const folder = path.join(base, 'Downloads');
  execFileSync('node', [path.join(__dirname, '..', 'scripts', 'make-demo-folder.js'), folder]);
  const dataDir = path.join(base, 'data');
  const engine = new Engine({ dataDir, apiKey: '' });
  engine.profile.setZone(base, 'free');
  return { base, folder, dataDir, engine };
}

const events = (engine) =>
  fs.readFileSync(engine.usage.file, 'utf8').trim().split('\n').map((line) => JSON.parse(line));

async function runAll(engine, folder, request = 'Free up space and sort my school files by class') {
  engine.openFolder(folder);
  const plan = await engine.plan(request);
  const run = engine.execute(plan.planId, plan.actions.map((a) => a.id));
  assert.ok(run.ok, JSON.stringify(run.errors));
  return plan;
}

test('the log is off until the user says yes, and nothing is written', async () => {
  const { folder, engine } = setup();
  await runAll(engine, folder);
  engine.undo();
  assert.ok(!fs.existsSync(engine.usage.file));
  assert.deepStrictEqual(engine.usage.status(), { asked: false, enabled: false, events: 0 });
});

test('a logged run has what the KPIs need: proposed, approved, undone, and when', async () => {
  const { folder, engine } = setup();
  engine.usage.setEnabled(true);
  engine.openFolder(folder);
  const plan = await engine.plan('Free up space and sort my school files by class');
  const ids = plan.actions.filter((a) => a.op !== 'trash_duplicate').map((a) => a.id);
  assert.ok(engine.execute(plan.planId, ids).ok);
  engine.undo();

  const log = events(engine);
  assert.deepStrictEqual(log.map((e) => e.event), ['logging_on', 'scan', 'plan', 'run', 'undo']);
  const [, , planned, run, undo] = log;
  assert.strictEqual(planned.mode, 'demo');
  assert.ok(planned.tries >= 1 && planned.passed === true);
  assert.strictEqual(run.proposed, plan.actions.length);
  assert.strictEqual(run.approved, ids.length);
  assert.ok(run.approved < run.proposed);
  assert.strictEqual(undo.undone, run.steps);
  assert.ok(!Number.isNaN(Date.parse(run.at)));
});

test('the log never holds file names, folder names, or what the user typed', async () => {
  const { base, folder, engine } = setup();
  engine.usage.setEnabled(true);
  const names = fs.readdirSync(folder);
  const plan = await (async () => {
    engine.openFolder(folder);
    return engine.plan('Organize everything SECRET-REQUEST-TEXT');
  })();
  const q = plan.questions.find((x) => x.text.includes('Resume'));
  const next = await engine.answer(q.text, 'Keep all of them');
  assert.ok(engine.execute(next.planId, next.actions.map((a) => a.id)).ok);
  engine.undo();

  const raw = fs.readFileSync(engine.usage.file, 'utf8');
  assert.ok(events(engine).some((e) => e.event === 'question_answered'));
  for (const name of names) assert.ok(!raw.includes(name), `log contains ${name}`);
  for (const text of [base, 'SECRET-REQUEST-TEXT', 'Keep all of them', 'Resume', '/']) {
    assert.ok(!raw.includes(text), `log contains ${text}`);
  }
});

test('text that is not a known label gets dropped', () => {
  const { engine } = setup();
  engine.usage.setEnabled(true);
  engine.usage.record('check', { name: 'resume.pdf', mode: 'resume.pdf', zone: 'ask', count: 2, ok: true });
  const { name, mode, zone, count, ok } = events(engine).at(-1);
  assert.deepStrictEqual({ name, mode, zone, count, ok }, { name: undefined, mode: undefined, zone: 'ask', count: 2, ok: true });
});

test('practice folders stay out of the log', async () => {
  const { folder, engine } = setup();
  engine.usage.setEnabled(true);
  engine.practiceFolders.add(folder);
  await runAll(engine, folder);
  engine.undo();
  assert.deepStrictEqual(events(engine).map((e) => e.event), ['logging_on']);
});

test('turning the log off deletes it, and the answer survives a restart', () => {
  const { dataDir, engine } = setup();
  engine.usage.setEnabled(true);
  assert.ok(fs.existsSync(engine.usage.file));
  engine.usage.setEnabled(false);
  assert.ok(!fs.existsSync(engine.usage.file));
  engine.usage.record('check');
  assert.ok(!fs.existsSync(engine.usage.file));

  const restarted = new Engine({ dataDir, apiKey: '' });
  assert.deepStrictEqual(restarted.usage.status(), { asked: true, enabled: false, events: 0 });
});

test('a logging failure does not stop a cleanup', async () => {
  const { base, folder, engine } = setup();
  engine.usage.setEnabled(true);
  engine.usage.file = path.join(base, 'no', 'such', 'folder', 'usage.jsonl');
  await runAll(engine, folder);
});

test('export makes an exact copy', () => {
  const { base, engine } = setup();
  engine.usage.setEnabled(true);
  const out = path.join(base, 'exported.jsonl');
  engine.usage.exportTo(out);
  assert.strictEqual(fs.readFileSync(out, 'utf8'), fs.readFileSync(engine.usage.file, 'utf8'));
});
