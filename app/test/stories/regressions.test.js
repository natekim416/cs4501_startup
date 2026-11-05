// Bugs found while building the Alpha. Each test was written to fail before the fix.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmp, makeJsProject } = require('./helpers');
const { Engine } = require('../../backend/engine');

test('REG-1 identical files inside code projects are not proposed as duplicates (found by US-11 test)', async () => {
  const root = tmp();
  makeJsProject(root, 'a');
  makeJsProject(root, 'b');
  const engine = new Engine({ dataDir: tmp(), apiKey: '' });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const plan = await engine.plan('Free up space');
  assert.ok(plan.actions.every((a) => a.op !== 'trash_duplicate'));
  assert.ok(plan.attempts[0].ok, 'first try should pass: nothing invalid was proposed');
});

test('REG-2 source files in different code projects do not trigger a "versions" question (found in a screenshot)', async () => {
  const root = tmp();
  makeJsProject(root, 'a');
  makeJsProject(root, 'b');
  fs.writeFileSync(path.join(root, 'b', 'index.js'), 'console.log("different")\n');
  const engine = new Engine({ dataDir: tmp(), apiKey: '' });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const plan = await engine.plan('Organize everything');
  assert.ok(!plan.questions.some((q) => /versions of "index\.js"/.test(q.text)), JSON.stringify(plan.questions));
});

test('REG-3 approving a named, still-active project passes the re-check at run time (found while wiring US-06/07; test written after the fix)', async () => {
  const root = tmp();
  makeJsProject(root, 'cs3140-final', { ageDays: 4 });
  const engine = new Engine({ dataDir: tmp(), apiKey: '' });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const plan = await engine.plan("I'm done with CS 3140");
  const run = engine.execute(plan.planId, plan.actions.map((a) => a.id));
  assert.ok(run.ok, JSON.stringify(run.errors));
  assert.ok(!fs.existsSync(path.join(root, 'cs3140-final', 'node_modules')));
});

test('REG-4 the scripted demo request never targets a course the user did not name (found by grader round 1)', async () => {
  const { makeDevDemo } = require('../../scripts/make-dev-demo');
  const root = makeDevDemo(path.join(tmp(), 'code'));
  const engine = new Engine({ dataDir: tmp(), apiKey: '' });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const plan = await engine.plan("I'm done with CS 3140 and the hackathon. Free up space.");
  const projects = plan.actions.map((a) => path.basename(path.dirname(a.path))).sort();
  assert.deepStrictEqual(projects, ['cs3140-final', 'cs3140-hw1']);
  assert.match(plan.attempts[0].errors.join(' '), /hoohacks-2026 has uncommitted changes/);
});

test('REG-5 the scanned folder itself is never offered as a project (found by grader round 3)', async () => {
  const { makeDevDemo } = require('../../scripts/make-dev-demo');
  const root = makeDevDemo(path.join(tmp(), 'code'));
  const engine = new Engine({ dataDir: tmp(), apiKey: '' });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const plan = await engine.plan("I'm done with the class with the robot project");
  const q = plan.questions.find((x) => /which projects/i.test(x.text));
  assert.ok(q && !q.options.includes('code'), JSON.stringify(q));
});

test('REG-6 in an ASK zone, approving with the moves unchecked creates no empty folders and says why (found by Papa on ~/Documents)', async () => {
  const { makeDemoFolder } = require('../../scripts/make-demo-folder');
  const folder = path.join(tmp(), 'Downloads');
  makeDemoFolder(folder);
  const engine = new Engine({ dataDir: tmp(), apiKey: '', home: tmp(), trashDir: tmp() });
  engine.profile.setZone(folder, 'ask');
  engine.scanFolder(folder);
  const plan = await engine.plan('Sort my school files by class');
  const moves = plan.actions.filter((a) => a.op === 'move');
  assert.ok(moves.length > 0 && moves.every((a) => plan.needsApproval.includes(a.id)), 'moves in an ASK zone wait for the user');
  // What the card checks by default: everything not marked ASK FIRST.
  const defaults = plan.actions.filter((a) => !plan.needsApproval.includes(a.id) && a.checked !== false).map((a) => a.id);
  const before = new Set(fs.readdirSync(folder));
  const res = engine.execute(plan.planId, defaults);
  assert.strictEqual(res.ok, true, JSON.stringify(res.errors));
  const created = fs.readdirSync(folder).filter((n) => !before.has(n));
  assert.deepStrictEqual(created, [], 'no folder is created when none of its files were checked');
  assert.match(res.freedNote, /14 moves? .*(check|ASK)/i);
});

test('REG-6b checking the moves too makes every file land exactly where the plan said', async () => {
  const { makeDemoFolder } = require('../../scripts/make-demo-folder');
  const folder = path.join(tmp(), 'Downloads');
  makeDemoFolder(folder);
  const engine = new Engine({ dataDir: tmp(), apiKey: '', home: tmp(), trashDir: tmp() });
  engine.profile.setZone(folder, 'ask');
  engine.scanFolder(folder);
  const plan = await engine.plan('Sort my school files by class');
  const res = engine.execute(plan.planId, plan.actions.map((a) => a.id));
  assert.strictEqual(res.ok, true, JSON.stringify(res.errors));
  const moves = plan.actions.filter((a) => a.op === 'move');
  for (const a of moves) {
    assert.ok(fs.existsSync(path.join(a.dest, path.basename(a.path))), `${path.basename(a.path)} landed in ${a.dest}`);
    assert.ok(!fs.existsSync(a.path), `${path.basename(a.path)} left its old place`);
  }
});

function sortedAndRun() {
  const { makeDemoFolder } = require('../../scripts/make-demo-folder');
  const folder = path.join(tmp(), 'Downloads');
  makeDemoFolder(folder);
  const engine = new Engine({ dataDir: tmp(), apiKey: '', home: tmp(), trashDir: tmp() });
  engine.profile.setZone(folder, 'free');
  engine.scanFolder(folder);
  return engine.plan('Sort my school files by class').then((plan) => {
    const res = engine.execute(plan.planId, plan.actions.map((a) => a.id));
    return { folder, engine, plan, res, made: plan.actions.filter((a) => a.op === 'mkdir').map((a) => a.path) };
  });
}

test('REG-7 undo removes the folders it created even after Finder left a hidden .DS_Store in them (found by Papa)', async () => {
  const { engine, made } = await sortedAndRun();
  for (const d of made) fs.writeFileSync(path.join(d, '.DS_Store'), 'x');
  const u = engine.undo();
  assert.deepStrictEqual(made.filter((d) => fs.existsSync(d)), [], 'every created folder is gone');
  assert.deepStrictEqual(u.keptFolders, []);
});

test('REG-7b undo keeps a created folder that now holds the user\'s own file, and says so (edge case)', async () => {
  const { engine, made } = await sortedAndRun();
  const mine = path.join(made.find((d) => /Music$/.test(d)), 'my new song.mp3');
  fs.writeFileSync(mine, 'mine');
  const u = engine.undo();
  assert.ok(fs.existsSync(mine), "the user's file is never touched");
  assert.deepStrictEqual(u.keptFolders.map((d) => path.basename(d)), ['Music']);
  assert.deepStrictEqual(made.filter((d) => fs.existsSync(d)).map((d) => path.basename(d)), ['Music']);
});

test('REG-7c undoing one move removes the folder it created once that folder is empty', async () => {
  const { engine, res, plan } = await sortedAndRun();
  const moves = plan.actions.filter((a) => a.op === 'move');
  const dest = moves[0].dest;
  const intoDest = moves.filter((a) => a.dest === dest);
  fs.writeFileSync(path.join(dest, '.DS_Store'), 'x');
  for (const a of intoDest) engine.undoAction(res.batchId, a.id);
  assert.ok(!fs.existsSync(dest), `${path.basename(dest)} should be removed after its last file moved back`);
});

// A temp folder that's removed when the test ends.
function tempDir(t) {
  const dir = tmp();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('REG-8 the Yarn and pnpm caches in ~/Library can be cleared, though ~/Library stays NEVER (found while building US-08)', async (t) => {
  const { validate } = require('../../backend/validator');
  const { write } = require('./helpers');
  const home = tempDir(t);
  const yarn = path.join(home, 'Library', 'Caches', 'Yarn');
  const pnpm = path.join(home, 'Library', 'pnpm', 'store');
  write(path.join(yarn, 'v6', 'blob'), 'y'.repeat(20 * 1024));
  write(path.join(pnpm, 'v3', 'files', 'blob'), 'p'.repeat(20 * 1024));
  const root = tempDir(t);
  makeJsProject(root, 'app');
  const engine = new Engine({ dataDir: tempDir(t), apiKey: '', home });
  engine.profile.setZone(root, 'free');
  // Like the real ~/Library, which FEAT-01 locks to NEVER. The US-06 tests used a home with no zones.
  engine.profile.setZone(path.join(home, 'Library'), 'never');
  engine.scanFolder(root);
  const plan = await engine.plan('Clear my package caches');
  const clear = plan.actions.filter((a) => a.op === 'clear_cache');
  assert.deepStrictEqual(clear.map((a) => a.path).sort(), [pnpm, yarn].sort(), JSON.stringify(plan.attempts));
  assert.ok(plan.attempts[0].ok, 'the caches were rejected before they got in');
  const run = engine.execute(plan.planId, clear.map((a) => a.id));
  assert.ok(run.ok, JSON.stringify(run.errors));
  assert.deepStrictEqual(fs.readdirSync(yarn), [], 'the Yarn cache is still full');
  assert.deepStrictEqual(fs.readdirSync(pnpm), [], 'the pnpm store is still full');
  // Only the exact known caches are opened up: everything else in ~/Library stays NEVER, even next to them.
  const other = path.dirname(write(path.join(home, 'Library', 'Caches', 'com.apple.Safari', 'Cache.db'), 'x'));
  for (const p of [other, path.join(home, 'Library', 'Caches'), path.join(yarn, 'v6')]) {
    const res = validate({ actions: [{ id: 'x', op: 'clear_cache', path: p, dest: '', keep: '', reason: 'x' }] }, { scan: engine.snapshot, findings: [], profile: engine.profile, home });
    assert.strictEqual(res.ok, false, `${p} was allowed`);
    assert.match(res.errors[0].message, /NEVER/);
  }
});

async function devEngine() {
  const { makeDevDemo } = require('../../scripts/make-dev-demo');
  const folder = makeDevDemo(path.join(tmp(), 'code'));
  const engine = new Engine({ dataDir: tmp(), apiKey: '', home: tmp(), trashDir: tmp() });
  engine.profile.setZone(folder, 'free');
  engine.scanFolder(folder);
  return engine;
}

test('REG-9 an answer that leaves nothing safe to do says why, instead of an empty reply (found by Papa)', async () => {
  for (const [pick, why] of [['hoohacks-2026', /uncommitted/i], ['cs2150-lab', /\.env|secret/i], ['old-experiment', /lockfile|manifest/i]]) {
    const engine = await devEngine();
    const first = await engine.plan("I'm done with something. Free up space.");
    const q = first.questions.find((x) => /which projects/i.test(x.text));
    const after = await engine.answer(q.text, pick);
    assert.strictEqual(after.actions.length, 0, pick);
    assert.match(after.summary, /nothing to approve/i, pick);
    assert.match(after.summary, why, `${pick}: ${after.summary}`);
  }
});

test('REG-9b every option of every question gives an approvable plan or says why there is nothing to approve', async () => {
  const { makeDemoFolder } = require('../../scripts/make-demo-folder');
  const setups = [
    ['Organize everything', async () => {
      const folder = path.join(tmp(), 'Downloads');
      makeDemoFolder(folder);
      const e = new Engine({ dataDir: tmp(), apiKey: '', home: tmp(), trashDir: tmp() });
      e.profile.setZone(folder, 'free');
      e.scanFolder(folder);
      return e;
    }],
    ["I'm done with the CS class. Free up space.", devEngine],
    ["I'm done with something. Free up space.", devEngine],
  ];
  for (const [request, make] of setups) {
    const probe = await (await make()).plan(request);
    assert.ok(probe.questions.length, `${request} asks something`);
    for (const q of probe.questions) {
      for (const choice of q.options) {
        const engine = await make();
        await engine.plan(request);
        const after = await engine.answer(q.text, choice);
        if (after.actions.length) {
          const run = engine.execute(after.planId, after.actions.map((a) => a.id), { confirmPermanent: true });
          assert.strictEqual(run.ok, true, `${request} / ${choice}: ${JSON.stringify(run.errors)}`);
        } else {
          assert.match(after.summary, /nothing to approve|which/i, `${request} / ${choice}: "${after.summary}"`);
        }
      }
    }
  }
});
