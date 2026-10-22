const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { Engine } = require('../backend/engine');
const { validate } = require('../backend/validator');

function setup() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanasaurus-test-'));
  const folder = path.join(base, 'Downloads');
  execFileSync('node', [path.join(__dirname, '..', 'scripts', 'make-demo-folder.js'), folder]);
  const engine = new Engine({ dataDir: path.join(base, 'data'), apiKey: '' });
  // Treat the temp folder as a free zone, like a real Downloads folder.
  engine.profile.setZone(base, 'free');
  return { base, folder, engine };
}

test('scan finds duplicates and flags the test malware', () => {
  const { folder, engine } = setup();
  const info = engine.scanFolder(folder);
  assert.strictEqual(info.duplicateGroups, 4);
  const flagged = info.findings.map((f) => f.name).sort();
  assert.deepStrictEqual(flagged, ['free_vst_crack.command', 'syllabus.pdf.command']);
});

test('demo plan passes validation, asks about resume versions, and can be undone', async () => {
  const { folder, engine } = setup();
  engine.scanFolder(folder);
  const before = fs.readdirSync(folder).sort();
  const plan = await engine.plan('Free up space and sort my school files by class');
  assert.ok(plan.attempts.at(-1).ok);
  assert.ok(plan.questions.some((q) => q.text.includes('Resume')));
  assert.ok(plan.bytesFreed > 0);
  const run = engine.execute(plan.planId, plan.actions.map((a) => a.id));
  assert.ok(run.ok, JSON.stringify(run.errors));
  assert.ok(fs.existsSync(path.join(folder, 'School', 'CS4501', 'CS4501_Lecture3_Transformers.pdf')));
  assert.ok(!fs.existsSync(path.join(folder, 'free_vst_crack.command')));
  engine.undo();
  assert.deepStrictEqual(fs.readdirSync(folder).sort(), before);
});

test('answers are remembered and used on the next plan', async () => {
  const { folder, engine } = setup();
  engine.scanFolder(folder);
  const plan = await engine.plan('Organize everything');
  const q = plan.questions.find((x) => x.text.includes('Resume'));
  const next = await engine.answer(q.text, 'Keep only the newest');
  assert.ok(engine.profile.data.preferences.some((p) => p.endsWith('Keep only the newest')));
  assert.ok(!next.questions.some((x) => x.text.includes('Resume')));
  assert.ok(next.actions.some((a) => a.path.endsWith('Resume.pdf') && a.dest.endsWith('Old versions')));
});

test('validator rejects unsafe plans with errors the LLM can act on', () => {
  const { folder, engine } = setup();
  engine.scanFolder(folder);
  const ctx = { scan: engine.snapshot, findings: engine.findings, profile: engine.profile };
  const p = (name) => path.join(folder, name);
  const res = validate(
    {
      actions: [
        { id: 'x1', op: 'trash_duplicate', path: p('Resume.pdf'), keep: p('Resume_FINAL.pdf'), reason: 'older' },
        { id: 'x2', op: 'quarantine', path: p('vacation.jpg'), reason: 'looks bad' },
        { id: 'x3', op: 'move', path: p('IMG_4802.png'), dest: p('Pictures'), reason: 'image' },
        { id: 'x4', op: 'move', path: p('APMA3100_Notes.pdf'), dest: path.join(os.homedir(), 'Library'), reason: 'notes' },
        { id: 'x5', op: 'delete_everything', path: p('beat_idea.wav'), reason: 'nope' },
      ],
    },
    ctx,
  );
  assert.strictEqual(res.ok, false);
  const byAction = Object.fromEntries(res.errors.map((e) => [e.action, e.message]));
  assert.match(byAction.x1, /different contents/);
  assert.match(byAction.x2, /not flagged/);
  assert.match(byAction.x3, /does not exist/);
  assert.match(byAction.x4, /NEVER|outside the target plan/);
  assert.match(byAction.x5, /Unknown op/);
});

test('failed plans are retried with the validator errors, then the user is asked', async () => {
  const { folder, engine } = setup();
  engine.scanFolder(folder);
  const planner = require('../backend/planner');
  const real = planner.makePlan;
  const seen = [];
  // A planner that keeps proposing a bad action, to exercise the retry loop.
  planner.makePlan = async (args) => {
    seen.push(args.previous ? args.previous.errors.length : 0);
    return { mode: 'llm', plan: { summary: 'bad', questions: [], actions: [{ id: 'b1', op: 'quarantine', path: path.join(folder, 'vacation.jpg'), dest: '', keep: '', reason: 'x' }] } };
  };
  delete require.cache[require.resolve('../backend/engine')];
  const { Engine: FreshEngine } = require('../backend/engine');
  const e2 = new FreshEngine({ dataDir: engine.executor.binDir + '-2', apiKey: '' });
  e2.profile.setZone(path.dirname(folder), 'free');
  e2.scanFolder(folder);
  const plan = await e2.plan('quarantine my photos');
  planner.makePlan = real;
  assert.strictEqual(plan.attempts.length, 3);
  assert.deepStrictEqual(seen, [0, 1, 1]);
  assert.strictEqual(plan.actions.length, 0);
  assert.match(plan.questions[0].text, /couldn't make a safe plan/);
  assert.deepStrictEqual(plan.questions[0].options, ['OK']);
});

test('a NEVER-zone folder gets a clear refusal instead of three failed tries', async () => {
  const { folder, engine } = setup();
  engine.scanFolder(folder);
  engine.profile.setZone(folder, 'never');
  const plan = await engine.plan('Free up space');
  assert.strictEqual(plan.attempts.length, 0);
  assert.strictEqual(plan.actions.length, 0);
  assert.match(plan.summary, /NEVER zone/);
});

test('only the newest plan can be approved', async () => {
  const { folder, engine } = setup();
  engine.scanFolder(folder);
  const first = await engine.plan('Free up space');
  const second = await engine.plan('Sort my school files by class');
  const stale = engine.execute(first.planId, first.actions.map((a) => a.id));
  assert.strictEqual(stale.ok, false);
  assert.match(stale.errors[0], /out of date/);
  const fresh = engine.execute(second.planId, second.actions.map((a) => a.id));
  assert.ok(fresh.ok, JSON.stringify(fresh.errors));
  assert.ok(fresh.results.every((r) => r.ok));
});
