// Minimal functionality: the smallest set of checks that proves the MVP does its job.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { Engine } = require('../backend/engine');

function setup() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanasaurus-min-'));
  const folder = path.join(base, 'Downloads');
  execFileSync('node', [path.join(__dirname, '..', 'scripts', 'make-demo-folder.js'), folder]);
  const engine = new Engine({ dataDir: path.join(base, 'data'), apiKey: '' });
  engine.profile.setZone(folder, 'free');
  engine.scanFolder(folder);
  const listAll = () =>
    execFileSync('find', [folder, '-type', 'f']).toString().trim().split('\n').map((p) => path.relative(folder, p)).sort();
  return { folder, engine, listAll };
}

async function planAndRun(engine, request) {
  const plan = await engine.plan(request);
  const run = engine.execute(plan.planId, plan.actions.map((a) => a.id));
  assert.ok(run.ok, JSON.stringify(run.errors));
  assert.ok(run.results.every((r) => r.ok), JSON.stringify(run.results.filter((r) => !r.ok)));
  return { plan, run };
}

test('MIN-1 free up space: removes exact duplicates and keeps one copy of each', async () => {
  const { folder, engine } = setup();
  const { run } = await planAndRun(engine, 'Free up space');
  assert.ok(run.bytesFreed > 30 * 1024 * 1024);
  assert.ok(fs.existsSync(path.join(folder, 'SummerVideo.mp4')));
  assert.ok(!fs.existsSync(path.join(folder, 'SummerVideo (1).mp4')));
  assert.ok(fs.existsSync(path.join(folder, 'CS4501_Lecture3_Transformers.pdf')));
  assert.ok(!fs.existsSync(path.join(folder, 'CS4501_Lecture3_Transformers (2).pdf')));
});

test('MIN-2 sort school files: lecture PDFs end up in class folders', async () => {
  const { folder, engine } = setup();
  await planAndRun(engine, 'Sort my school files by class');
  for (const [course, file] of [['CS4501', 'CS4501_Lecture4_RAG.pdf'], ['CS3100', 'CS3100_Midterm_Review.pdf'], ['APMA3100', 'APMA3100_Notes.pdf']]) {
    assert.ok(fs.existsSync(path.join(folder, 'School', course, file)), `${file} should be in School/${course}`);
  }
});

test('MIN-3 scan for malware: only flagged files are quarantined', async () => {
  const { folder, engine } = setup();
  const { plan } = await planAndRun(engine, 'Scan for malware');
  assert.deepStrictEqual(plan.actions.map((a) => a.op), ['quarantine', 'quarantine']);
  assert.ok(!fs.existsSync(path.join(folder, 'free_vst_crack.command')));
  assert.ok(!fs.existsSync(path.join(folder, 'syllabus.pdf.command')));
  assert.ok(fs.existsSync(path.join(folder, 'vacation.jpg')));
});

test('MIN-4 nothing is lost: every file is either still in the folder or in the bin/quarantine', async () => {
  const { engine, listAll } = setup();
  const before = listAll().length;
  await planAndRun(engine, 'Organize everything');
  const kept = listAll().length;
  const binned = ['dino-bin', 'quarantine']
    .map((d) => path.join(engine.executor.binDir, '..', d))
    .filter((d) => fs.existsSync(d))
    .reduce((n, d) => n + execFileSync('find', [d, '-type', 'f']).toString().trim().split('\n').filter(Boolean).length, 0);
  assert.strictEqual(kept + binned, before);
});

test('MIN-5 undo restores the folder exactly', async () => {
  const { engine, listAll } = setup();
  const before = listAll();
  await planAndRun(engine, 'Organize everything');
  assert.notDeepStrictEqual(listAll(), before);
  engine.undo();
  assert.deepStrictEqual(listAll(), before);
});

test('MIN-6 unchecking actions: only approved actions run', async () => {
  const { folder, engine } = setup();
  const plan = await engine.plan('Free up space');
  const one = plan.actions.find((a) => a.op === 'trash_duplicate');
  const run = engine.execute(plan.planId, [one.id]);
  assert.ok(run.ok);
  assert.strictEqual(run.results.length, 1);
  assert.ok(!fs.existsSync(one.path));
  assert.ok(fs.existsSync(path.join(folder, 'free_vst_crack.command')), 'unapproved quarantine should not run');
});

test('MIN-7 NEVER zone: nothing is planned or touched', async () => {
  const { folder, engine, listAll } = setup();
  const before = listAll();
  engine.profile.setZone(folder, 'never');
  const plan = await engine.plan('Organize everything');
  assert.strictEqual(plan.actions.length, 0);
  assert.deepStrictEqual(listAll(), before);
});

test('MIN-8 asks about look-alike versions instead of guessing, and remembers the answer', async () => {
  const { folder, engine } = setup();
  const plan = await engine.plan('Organize everything');
  const q = plan.questions.find((x) => x.text.includes('3 different versions'));
  assert.ok(q, 'should ask about the 3 resume versions');
  assert.ok(!plan.actions.some((a) => a.path.includes('Resume')), 'should not touch resumes before asking');
  const next = await engine.answer(q.text, 'Put them in a Versions folder');
  const run = engine.execute(next.planId, next.actions.map((a) => a.id));
  assert.ok(run.ok);
  for (const f of ['Resume.pdf', 'Resume_FINAL.pdf', 'Resume_FINAL_v2.pdf']) assert.ok(fs.existsSync(path.join(folder, 'Versions', f)));
});

test('MIN-9 running the same request twice is safe (second run finds less to do)', async () => {
  const { engine } = setup();
  await planAndRun(engine, 'Organize everything');
  const again = await engine.plan('Organize everything');
  assert.ok(again.attempts.at(-1).ok, JSON.stringify(again.attempts));
  const run = engine.execute(again.planId, again.actions.map((a) => a.id));
  assert.ok(run.ok, JSON.stringify(run.errors));
});
