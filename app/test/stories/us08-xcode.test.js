// US-08 (#9) · Xcode build data and simulators.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { tmp, write, age } = require('./helpers');
const TODO = { todo: 'US-08 (#9): Xcode cleanup not built yet' };

test('US-08 DerivedData for a project that no longer exists is offered as rebuildable', TODO, () => {
  const { xcodeItems } = require('../../backend/ecosystems/xcode');
  const home = tmp();
  const dd = path.dirname(write(path.join(home, 'Library', 'Developer', 'Xcode', 'DerivedData', 'OldApp-abc123', 'info.plist'), '<plist><dict><key>WorkspacePath</key><string>/nope/OldApp.xcodeproj</string></dict></plist>'));
  age(dd, 45);
  const items = xcodeItems({ home, run: () => '{"devices":{}}' });
  const item = items.find((i) => i.path === dd);
  assert.strictEqual(item.label, 'rebuildable');
  assert.match(item.reason, /rebuilds it on the next build/);
});

test('US-08 simulator runtimes unused for 180 days are offered with size and a re-download note', TODO, () => {
  const { xcodeItems } = require('../../backend/ecosystems/xcode');
  const old = new Date(Date.now() - 200 * 864e5).toISOString();
  const json = JSON.stringify({ devices: { 'com.apple.CoreSimulator.SimRuntime.iOS-16-0': [{ name: 'iPhone 14', udid: 'U1', lastBootedAt: old, dataPath: '/tmp/x', dataPathSize: 4e9 }] } });
  const items = xcodeItems({ home: tmp(), run: () => json });
  const sim = items.find((i) => i.type === 'simulator');
  assert.ok(sim.bytes >= 4e9);
  assert.match(sim.reason, /Xcode Settings/);
});

test('US-08 Xcode Archives and the rest of ~/Library stay NEVER', TODO, () => {
  const { validate } = require('../../backend/validator');
  const { Profile } = require('../../backend/profile');
  const home = require('os').homedir();
  const profile = new Profile(path.join(tmp(), 'p.json'));
  const archives = path.join(home, 'Library', 'Developer', 'Xcode', 'Archives', '2026-01-01');
  const res = validate({ actions: [{ id: 'a', op: 'delete_rebuildable', path: archives, dest: '', keep: '', reason: 'x' }] }, { scan: { root: home, files: [], dirs: [] }, findings: [], profile });
  assert.strictEqual(res.ok, false);
  // It must be refused *because* it's an Archive, not just because the type is unknown.
  assert.match(res.errors.map((e) => e.message).join(' '), /Xcode Archives.*crash reports/);
});
