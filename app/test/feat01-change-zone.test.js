// FEAT-01 (#41) · Change a folder's permission zone from the zones panel.
// Not a user story: a team feature that extends US-26 (#27). These tests cover the rules the backend
// enforces, whatever the page asks for. test/ui-smoke.js clicks through the picker in the real window.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { Profile } = require('../backend/profile');
const { Engine } = require('../backend/engine');

const HOME = os.homedir();
const DOCUMENTS = path.join(HOME, 'Documents');
const LOCKED = [path.join(HOME, 'Library'), '/System', '/Applications'];

// A temp folder that's removed when the test ends.
function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanasaurus-feat-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function newProfile(t) {
  const file = path.join(tempDir(t), 'profile.json');
  return { file, profile: new Profile(file) };
}

const zoneOf = (profile, p) => profile.data.zones.find((z) => z.path === p).zone;

test('FEAT-01 changing a listed zone updates only that zone, in place, and saves it', (t) => {
  const { file, profile } = newProfile(t);
  const before = structuredClone(profile.data.zones);
  assert.deepStrictEqual(profile.changeZone(DOCUMENTS, 'free'), { from: 'ask', to: 'free' });
  const expected = before.map((z) => (z.path === DOCUMENTS ? { ...z, zone: 'free' } : z));
  assert.deepStrictEqual(profile.data.zones, expected);
  assert.deepStrictEqual(new Profile(file).data.zones, expected);
});

test('FEAT-01 only folders already in the zones list can be changed', (t) => {
  const { file, profile } = newProfile(t);
  const music = path.join(HOME, 'Music');
  assert.throws(() => profile.changeZone(music, 'free'), /isn't in your zones list/);
  assert.ok(!profile.data.zones.some((z) => z.path === music));
  assert.ok(!fs.existsSync(file), 'nothing should be saved');
});

test('FEAT-01 a zone must be free, ask, or never', (t) => {
  const { profile } = newProfile(t);
  const dir = tempDir(t);
  for (const bad of ['FREE', 'delete', '', undefined, null]) {
    assert.throws(() => profile.setZone(dir, bad), /isn't a zone/);
    assert.throws(() => profile.changeZone(DOCUMENTS, bad), /isn't a zone/);
  }
  assert.strictEqual(zoneOf(profile, DOCUMENTS), 'ask');
  assert.ok(!profile.data.zones.some((z) => z.path === dir));
});

test('FEAT-01 macOS folders are locked to NEVER, and so is everything inside them', (t) => {
  const { profile } = newProfile(t);
  for (const p of LOCKED) {
    for (const zone of ['free', 'ask']) {
      // The "This folder" buttons can't get around the lock by naming a folder inside it.
      assert.throws(() => profile.setZone(path.join(p, 'Caches'), zone), /macOS folder/);
      assert.throws(() => profile.changeZone(p, zone), /macOS folder/);
    }
    assert.strictEqual(profile.isLocked(p), true, p);
    assert.strictEqual(zoneOf(profile, p), 'never');
    assert.deepStrictEqual(profile.changeZone(p, 'never'), { from: 'never', to: 'never' });
  }
  assert.strictEqual(profile.isLocked(path.join(HOME, 'Downloads')), false);
  assert.strictEqual(profile.isLocked(path.join(HOME, 'LibraryNotes')), false, 'a name that only starts the same is not inside');
});

test('FEAT-01 a link that points into a locked folder is locked too', (t) => {
  const link = path.join(tempDir(t), 'lib');
  fs.symlinkSync(path.join(HOME, 'Library'), link);
  try {
    const { profile } = newProfile(t);
    assert.throws(() => profile.setZone(link, 'free'), /macOS folder/);
    // A folder that doesn't exist yet, reached through the link, still lands inside ~/Library.
    assert.throws(() => profile.setZone(path.join(link, 'no-such-folder'), 'ask'), /macOS folder/);
    assert.strictEqual(profile.isLocked(link), true);
  } finally {
    fs.unlinkSync(link); // Remove only the link, never what it points to.
  }
});

test('FEAT-01 a plan made before its folder became NEVER cannot run', async (t) => {
  const base = tempDir(t);
  const folder = path.join(base, 'Downloads');
  execFileSync('node', [path.join(__dirname, '..', 'scripts', 'make-demo-folder.js'), folder]);
  const engine = new Engine({ dataDir: path.join(base, 'data'), apiKey: '' });
  engine.profile.setZone(folder, 'free');
  engine.scanFolder(folder);
  const listAll = () => execFileSync('find', [folder, '-type', 'f']).toString().trim().split('\n').sort();

  const plan = await engine.plan('Free up space');
  assert.ok(plan.actions.length > 0, 'the demo folder should give a plan');
  const before = listAll();
  assert.deepStrictEqual(engine.profile.changeZone(folder, 'never'), { from: 'free', to: 'never' });
  const run = engine.execute(plan.planId, plan.actions.map((a) => a.id));
  assert.strictEqual(run.ok, false);
  assert.match(run.errors.join('\n'), /NEVER/);
  assert.deepStrictEqual(listAll(), before);
});
