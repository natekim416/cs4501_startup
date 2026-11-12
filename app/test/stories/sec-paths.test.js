// SEC · One path, checked and acted on: no "..", no symlink detours, no case tricks. Red-team F3, F4, F5, F9.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { tmp, write, age, makeJsProject } = require('./helpers');
const { Engine } = require('../../backend/engine');
const { Executor } = require('../../backend/executor');
const { validate } = require('../../backend/validator');
const { Profile } = require('../../backend/profile');

// A folder being cleaned (FREE) next to a vault the user marked NEVER, with a symlink from one to the other.
function setup() {
  const base = tmp();
  const downloads = path.join(base, 'Downloads');
  const vault = path.join(base, 'Vault');
  write(path.join(downloads, 'notes.txt'), 'downloads copy');
  write(path.join(vault, 'notes.txt'), 'the only copy of my thesis notes');
  fs.mkdirSync(path.join(vault, 'deep'));
  // shortcut -> Vault/deep, so "shortcut/.." is Vault to the OS, but Downloads to a lexical check.
  fs.symlinkSync(path.join(vault, 'deep'), path.join(downloads, 'shortcut'));
  const engine = new Engine({ dataDir: tmp(), apiKey: '', home: tmp(), trashDir: tmp() });
  engine.profile.setZone(downloads, 'free');
  engine.profile.setZone(vault, 'never');
  engine.scanFolder(downloads);
  const ctx = { scan: engine.snapshot, findings: [], profile: engine.profile, home: engine.home, trashDir: engine.trashDir };
  return { base, downloads, vault, engine, ctx };
}
const act = (a) => ({ id: 'a1', dest: '', keep: '', reason: 'test', ...a });

test('SEC-3 a path with ".." is rejected, so a symlink can never point the executor somewhere the validator did not check (F3)', () => {
  const { downloads, vault, ctx } = setup();
  const sneaky = `${downloads}/shortcut/../notes.txt`; // built by hand: path.join would remove the ".." 
  fs.mkdirSync(path.join(downloads, 'Sorted'));
  const res = validate({ actions: [act({ op: 'move', path: sneaky, dest: path.join(downloads, 'Sorted') })] }, ctx);
  assert.strictEqual(res.ok, false);
  assert.match(res.errors[0].message, /\.\./);
  assert.ok(fs.existsSync(path.join(vault, 'notes.txt')));
});

test('SEC-3b the executor itself refuses a path with "..", even if the validator were skipped (F3)', () => {
  const { downloads, vault } = setup();
  const ex = new Executor(tmp(), { trashDir: tmp() });
  fs.mkdirSync(path.join(downloads, 'Sorted'));
  const run = ex.run([act({ op: 'move', path: `${downloads}/shortcut/../notes.txt`, dest: path.join(downloads, 'Sorted') })]);
  assert.strictEqual(run.results[0].ok, false);
  assert.ok(fs.existsSync(path.join(vault, 'notes.txt')), 'the vault file never moved');
});

test('SEC-3c a build folder reached through a symlink with ".." is rejected, and the vault node_modules survives (F3)', () => {
  const base = tmp();
  const downloads = path.join(base, 'Downloads');
  const vault = path.join(base, 'Vault');
  write(path.join(downloads, 'proj', 'package-lock.json'), '{}');
  write(path.join(downloads, 'proj', 'node_modules', 'x', 'i.js'), '1');
  write(path.join(vault, 'proj', 'node_modules', 'my-only-copy.txt'), 'vendored patch');
  fs.mkdirSync(path.join(vault, 'proj', 'deep'));
  fs.symlinkSync(path.join(vault, 'proj', 'deep'), path.join(downloads, 'proj', 'lnk'));
  age(downloads, 90);
  const engine = new Engine({ dataDir: tmp(), apiKey: '', home: tmp(), trashDir: tmp() });
  engine.profile.setZone(downloads, 'free');
  engine.profile.setZone(vault, 'never');
  engine.scanFolder(downloads);
  const res = validate({ actions: [act({ op: 'delete_rebuildable', path: `${downloads}/proj/lnk/../node_modules` })] }, { scan: engine.snapshot, findings: [], profile: engine.profile, home: engine.home });
  assert.strictEqual(res.ok, false);
  assert.match(res.errors[0].message, /\.\./);
});

test('SEC-4 moving into a symlinked folder that leads into a NEVER zone is rejected (F4)', () => {
  const { downloads, vault, ctx } = setup();
  const res = validate({ actions: [act({ op: 'move', path: path.join(downloads, 'notes.txt'), dest: path.join(downloads, 'shortcut') })] }, ctx);
  assert.strictEqual(res.ok, false);
  assert.match(res.errors[0].message, /NEVER/);
  assert.strictEqual(fs.readFileSync(path.join(vault, 'notes.txt'), 'utf8'), 'the only copy of my thesis notes');
});

test('SEC-5 on macOS, a different letter case still lands in the same NEVER zone, and locked folders stay locked (F5)', { skip: process.platform !== 'darwin' && 'case-insensitive file system only' }, () => {
  const profile = new Profile(path.join(tmp(), 'profile.json'));
  const home = os.homedir();
  for (const p of [path.join(home, 'library', 'LaunchAgents', 'x.plist'), path.join(home, 'LIBRARY'), '/system/Library', '/APPLICATIONS/Safari.app']) {
    assert.strictEqual(profile.zoneFor(p), 'never', p);
  }
  assert.throws(() => profile.setZone(path.join(home, 'library'), 'free'), /NEVER/);
  assert.ok(profile.isLocked(path.join(home, 'Library', '..', 'library')));
});

test('SEC-6 a duplicate is not "kept" by a copy inside a build folder the same plan deletes (F9)', () => {
  const root = tmp();
  const project = makeJsProject(root, 'old-app');
  write(path.join(root, 'survey.csv'), 'answers');
  write(path.join(project, 'node_modules', 'pkg', 'survey.csv'), 'answers');
  const engine = new Engine({ dataDir: tmp(), apiKey: '', home: tmp(), trashDir: tmp() });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const plan = {
    actions: [
      act({ id: 'a1', op: 'trash_duplicate', path: path.join(root, 'survey.csv'), keep: path.join(project, 'node_modules', 'pkg', 'survey.csv') }),
      act({ id: 'a2', op: 'delete_rebuildable', path: path.join(project, 'node_modules') }),
    ],
  };
  const files = engine.snapshot.files.map((f) => f.path);
  if (!files.includes(path.join(project, 'node_modules', 'pkg', 'survey.csv'))) engine.snapshot.files.push({ path: path.join(project, 'node_modules', 'pkg', 'survey.csv'), size: 7, modified: new Date().toISOString() });
  const res = validate(plan, { scan: engine.snapshot, findings: [], profile: engine.profile, home: engine.home });
  assert.strictEqual(res.ok, false);
  assert.match(res.errors.map((e) => e.message).join(' '), /no copy of survey\.csv survives/);
});
