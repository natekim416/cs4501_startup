// US-08 (#9) · Xcode build data and simulators.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmp, write, age, makeJsProject } = require('./helpers');

// A temp folder that's removed when the test ends.
function tempDir(t) {
  const dir = tmp();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString();
const IOS16 = 'com.apple.CoreSimulator.SimRuntime.iOS-16-0';
const IOS17 = 'com.apple.CoreSimulator.SimRuntime.iOS-17-0';
const plist = (workspace) => `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>LastAccessedDate</key><date>2026-01-01T00:00:00Z</date><key>WorkspacePath</key><string>${workspace}</string></dict></plist>`;

// A DerivedData folder for a workspace, with some build output, last built `days` ago.
function derivedData(home, name, workspace, days) {
  const dir = path.join(home, 'Library', 'Developer', 'Xcode', 'DerivedData', name);
  write(path.join(dir, 'info.plist'), plist(workspace));
  write(path.join(dir, 'Build', 'Products', 'Debug-iphonesimulator', 'App.app', 'App'), 'b'.repeat(64 * 1024));
  age(dir, days);
  return dir;
}

// A stand-in for `xcrun`: answers the two simctl list commands and records every call.
function fakeXcrun({ devices = {}, runtimes = {} } = {}) {
  const calls = [];
  const run = (cmd, args) => {
    calls.push([cmd, ...args].join(' '));
    if (args.join(' ') === 'simctl list devices --json') return JSON.stringify({ devices });
    if (args.join(' ') === 'simctl runtime list -j') return JSON.stringify(runtimes);
    return '';
  };
  return { run, calls };
}

// iOS 16 last booted 200 days ago (one device, 4 GB of data, a 7 GB runtime image).
const OLD_SIM = {
  devices: { [IOS16]: [{ name: 'iPhone 14', udid: 'U1', lastBootedAt: daysAgo(200), dataPath: '/tmp/x', dataPathSize: 4e9 }] },
  runtimes: { 'R16': { identifier: 'R16', runtimeIdentifier: IOS16, version: '16.0', sizeBytes: 7e9, deletable: true } },
};

// A stand-in for the Anthropic SDK that returns the queued plans in order (see llm-planner.test.js).
function fakeClient(plans) {
  const requests = [];
  const reply = (p) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(p) }] });
  return { requests, beta: { messages: { create: async (req) => (requests.push(req), reply(plans.shift())) } } };
}

// An engine with a fake home whose ~/Library is NEVER, like the real one, and a JS project in the folder.
function setup(t, xcrun = fakeXcrun()) {
  const { Engine } = require('../../backend/engine');
  const home = tempDir(t);
  const root = tempDir(t);
  makeJsProject(root, 'webapp');
  const engine = new Engine({ dataDir: tempDir(t), apiKey: '', home, xcodeRun: xcrun.run });
  engine.profile.setZone(root, 'free');
  engine.profile.setZone(path.join(home, 'Library'), 'never');
  return { engine, home, root };
}

test('US-08 DerivedData for a project that no longer exists is offered as rebuildable', (t) => {
  const { xcodeItems } = require('../../backend/ecosystems/xcode');
  const home = tempDir(t);
  const dd = path.dirname(write(path.join(home, 'Library', 'Developer', 'Xcode', 'DerivedData', 'OldApp-abc123', 'info.plist'), '<plist><dict><key>WorkspacePath</key><string>/nope/OldApp.xcodeproj</string></dict></plist>'));
  age(dd, 45);
  const items = xcodeItems({ home, run: () => '{"devices":{}}' });
  const item = items.find((i) => i.path === dd);
  assert.strictEqual(item.label, 'rebuildable');
  assert.match(item.reason, /rebuilds it on the next build/);
});

test('US-08 simulator runtimes unused for 180 days are offered with size and a re-download note', (t) => {
  const { xcodeItems } = require('../../backend/ecosystems/xcode');
  const old = new Date(Date.now() - 200 * 864e5).toISOString();
  const json = JSON.stringify({ devices: { 'com.apple.CoreSimulator.SimRuntime.iOS-16-0': [{ name: 'iPhone 14', udid: 'U1', lastBootedAt: old, dataPath: '/tmp/x', dataPathSize: 4e9 }] } });
  const items = xcodeItems({ home: tempDir(t), run: () => json });
  const sim = items.find((i) => i.type === 'simulator');
  assert.ok(sim.bytes >= 4e9);
  assert.match(sim.reason, /Xcode Settings/);
});

test('US-08 Xcode Archives and the rest of ~/Library stay NEVER', (t) => {
  const { validate } = require('../../backend/validator');
  const { Profile } = require('../../backend/profile');
  const home = require('os').homedir();
  const profile = new Profile(path.join(tempDir(t), 'p.json'));
  const archives = path.join(home, 'Library', 'Developer', 'Xcode', 'Archives', '2026-01-01');
  const res = validate({ actions: [{ id: 'a', op: 'delete_rebuildable', path: archives, dest: '', keep: '', reason: 'x' }] }, { scan: { root: home, files: [], dirs: [] }, findings: [], profile });
  assert.strictEqual(res.ok, false);
  // It must be refused *because* it's an Archive, not just because the type is unknown.
  assert.match(res.errors.map((e) => e.message).join(' '), /Xcode Archives.*crash reports/);
});

test('US-08 DerivedData for a project that still exists is offered only after 30 days without a build', (t) => {
  const { xcodeItems } = require('../../backend/ecosystems/xcode');
  const home = tempDir(t);
  const projects = tempDir(t);
  const workspace = (name) => (fs.mkdirSync(path.join(projects, `${name}.xcodeproj`), { recursive: true }), path.join(projects, `${name}.xcodeproj`));
  const recent = derivedData(home, 'Recent-aaa', workspace('Recent'), 5);
  const idle = derivedData(home, 'Idle-bbb', workspace('Idle'), 40);
  // Shared caches with no info.plist aren't any one project's build data, so they're left alone.
  const shared = path.dirname(write(path.join(home, 'Library', 'Developer', 'Xcode', 'DerivedData', 'ModuleCache.noindex', 'm.pcm'), 'm'));
  age(shared, 90);
  const items = xcodeItems({ home, run: () => '{"devices":{}}' });
  const paths = items.map((i) => i.path);
  assert.ok(!paths.includes(recent), 'a project built 5 days ago is offered');
  assert.ok(!paths.includes(shared), 'a shared cache is offered');
  const item = items.find((i) => i.path === idle);
  assert.ok(item, 'a project not built for 40 days is not offered');
  assert.strictEqual(item.type, 'xcode-deriveddata');
  assert.match(item.reason, /Idle/);
  assert.match(item.reason, /40 days/);
  assert.ok(item.bytes >= 64 * 1024, `measured ${item.bytes} bytes`);
});

test("US-08 a simulator runtime is kept if any device booted in the last 180 days, or if there's no date to prove it", (t) => {
  const { xcodeItems } = require('../../backend/ecosystems/xcode');
  const IOS15 = 'com.apple.CoreSimulator.SimRuntime.iOS-15-0';
  const xcrun = fakeXcrun({
    devices: {
      // One old device and one recent one: the runtime is still in use.
      [IOS17]: [{ name: 'iPhone 15', udid: 'A', lastBootedAt: daysAgo(400), dataPathSize: 1e9 }, { name: 'iPad', udid: 'B', lastBootedAt: daysAgo(3), dataPathSize: 1e9 }],
      // Never booted, and nothing else says when it was last used: no proof, so it stays.
      [IOS15]: [{ name: 'iPhone 13', udid: 'C', dataPathSize: 1e6 }],
      // Never booted, but Xcode says the runtime itself was last used 300 days ago.
      [IOS16]: [{ name: 'iPhone 14', udid: 'D', dataPathSize: 1e6 }],
    },
    runtimes: { R16: { identifier: 'R16', runtimeIdentifier: IOS16, version: '16.0', sizeBytes: 7e9, lastUsedAt: daysAgo(300), deletable: true } },
  });
  const sims = xcodeItems({ home: tempDir(t), run: xcrun.run }).filter((i) => i.type === 'simulator');
  assert.deepStrictEqual(sims.map((s) => s.path), [`simulator:${IOS16}`]);
  assert.ok(sims[0].bytes >= 7e9, 'the runtime image counts toward the size');
  assert.match(sims[0].reason, /iOS 16\.0/);
});

test('US-08 a simulator runtime that ships inside Xcode is never offered, however old', (t) => {
  const { xcodeItems } = require('../../backend/ecosystems/xcode');
  const xcrun = fakeXcrun({
    devices: OLD_SIM.devices,
    runtimes: { R16: { ...OLD_SIM.runtimes.R16, lastUsedAt: daysAgo(400), deletable: false } },
  });
  const sims = xcodeItems({ home: tempDir(t), run: xcrun.run }).filter((i) => i.type === 'simulator');
  assert.deepStrictEqual(sims, [], 'offered a runtime that simctl cannot delete');
});

test('US-08 asking to clean Xcode offers only the Xcode items, and they run even though ~/Library is NEVER', async (t) => {
  const xcrun = fakeXcrun(OLD_SIM);
  const { engine, home, root } = setup(t, xcrun);
  const gone = derivedData(home, 'OldApp-abc', '/nope/OldApp.xcodeproj', 45);
  // A project built today keeps its DerivedData, and makes the DerivedData folder itself look active.
  const live = tempDir(t);
  fs.mkdirSync(path.join(live, 'Live.xcodeproj'));
  const busy = derivedData(home, 'Live-def', path.join(live, 'Live.xcodeproj'), 0);
  engine.scanFolder(root);
  const plan = await engine.plan('Clean up my Xcode build data and old simulators');
  assert.deepStrictEqual(plan.actions.map((a) => [a.op, a.path]).sort(), [['delete_rebuildable', gone], ['remove_simulator', `simulator:${IOS16}`]]);
  assert.ok(plan.actions.every((a) => a.checked !== false), 'an old project is marked active because another one was built');
  const run = engine.execute(plan.planId, plan.actions.map((a) => a.id));
  assert.ok(run.ok, JSON.stringify(run.errors));
  assert.ok(!fs.existsSync(gone), 'the old DerivedData is still there');
  assert.ok(fs.existsSync(busy), "today's DerivedData was deleted");
  assert.ok(fs.existsSync(path.join(root, 'webapp', 'node_modules')), 'an Xcode request deleted node_modules');
  assert.ok(xcrun.calls.includes('xcrun simctl delete U1'), xcrun.calls.join('\n'));
  assert.ok(xcrun.calls.includes('xcrun simctl runtime delete R16'), xcrun.calls.join('\n'));
});

test('US-08 the validator opens only the exact Xcode items, and nothing else in ~/Library', async (t) => {
  const { validate } = require('../../backend/validator');
  const { engine, home, root } = setup(t, fakeXcrun(OLD_SIM));
  const old = derivedData(home, 'OldApp-abc', '/nope/OldApp.xcodeproj', 45);
  const live = tempDir(t);
  fs.mkdirSync(path.join(live, 'Live.xcodeproj'));
  const busy = derivedData(home, 'Live-def', path.join(live, 'Live.xcodeproj'), 0);
  const support = path.dirname(write(path.join(home, 'Library', 'Developer', 'Xcode', 'iOS DeviceSupport', '16.0', 'Symbols', 's'), 's'));
  engine.scanFolder(root);
  const check = (op, p) => validate({ actions: [{ id: 'a', op, path: p, dest: '', keep: '', reason: 'x' }] }, { scan: engine.snapshot, findings: [], profile: engine.profile, home, xcode: engine.xcode });
  assert.ok(check('delete_rebuildable', old).ok, JSON.stringify(check('delete_rebuildable', old).errors));
  assert.ok(check('remove_simulator', `simulator:${IOS16}`).ok);
  for (const p of [path.dirname(old), support, path.join(home, 'Library', 'Developer', 'Xcode')]) {
    const res = check('delete_rebuildable', p);
    assert.strictEqual(res.ok, false, `${p} was allowed`);
    assert.match(res.errors[0].message, /NEVER/);
  }
  const recent = check('delete_rebuildable', busy);
  assert.strictEqual(recent.ok, false, 'DerivedData built today was allowed');
  // Its own reason, not the NEVER one (whose path also says "Xcode").
  assert.match(recent.errors[0].message, /built in the last 30 days/);
  const made = check('remove_simulator', `simulator:${IOS17}`);
  assert.strictEqual(made.ok, false, 'a simulator nobody offered was allowed');
  assert.match(made.errors[0].message, /simulator runtime/);
});

test('US-08 DerivedData that is built again after the plan is made is refused at approval', async (t) => {
  const { engine, home, root } = setup(t);
  const projects = tempDir(t);
  fs.mkdirSync(path.join(projects, 'Idle.xcodeproj'));
  const dd = derivedData(home, 'Idle-bbb', path.join(projects, 'Idle.xcodeproj'), 40);
  engine.scanFolder(root);
  const plan = await engine.plan('Clean Xcode DerivedData');
  assert.deepStrictEqual(plan.actions.map((a) => a.path), [dd]);
  age(dd, 0); // the user opened Xcode and built it again
  const run = engine.execute(plan.planId, plan.actions.map((a) => a.id));
  assert.strictEqual(run.ok, false, 'deleted build data that was just rebuilt');
  assert.ok(fs.existsSync(dd));
});

test('US-08 undoing an Xcode cleanup says how each item comes back, instead of offering a command to run', async (t) => {
  const { engine, home, root } = setup(t, fakeXcrun(OLD_SIM));
  derivedData(home, 'OldApp-abc', '/nope/OldApp.xcodeproj', 45);
  engine.scanFolder(root);
  const plan = await engine.plan('Clean up Xcode');
  assert.ok(engine.execute(plan.planId, plan.actions.map((a) => a.id)).ok);
  const undo = engine.undo();
  assert.deepStrictEqual(undo.needsRebuild, [], 'undo offers a REBUILD command for Xcode items');
  const notes = (undo.notes || []).join('\n');
  assert.match(notes, /rebuilds it on the next build/);
  assert.match(notes, /Xcode Settings/);
});

test("US-08 the one-line summary counts simulator runtimes and doesn't claim nothing outside the folder changes", async (t) => {
  const { engine, home, root } = setup(t, fakeXcrun(OLD_SIM));
  derivedData(home, 'OldApp-abc', '/nope/OldApp.xcodeproj', 45);
  engine.scanFolder(root);
  const plan = await engine.plan('Clean up Xcode');
  assert.match(plan.oneLine, /1 rebuildable folder/);
  assert.match(plan.oneLine, /remove 1 unused simulator runtime \(\d+ GB\)/);
  assert.doesNotMatch(plan.oneLine, /Nothing outside/);
});

test('US-08 Claude is told which Xcode items it may use, and how', async (t) => {
  const { Engine } = require('../../backend/engine');
  const home = tempDir(t);
  const root = tempDir(t);
  const dd = derivedData(home, 'OldApp-abc', '/nope/OldApp.xcodeproj', 45);
  const client = fakeClient([{ summary: 'Nothing to do.', actions: [], questions: [] }]);
  const engine = new Engine({ dataDir: tempDir(t), llmClient: client, home, xcodeRun: fakeXcrun(OLD_SIM).run });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  await engine.plan('Clean up Xcode');
  const sent = client.requests[0];
  const snapshot = JSON.parse(sent.messages[0].content.split('\n').slice(3).join('\n'));
  assert.deepStrictEqual(snapshot.xcode_items.map((x) => x.path).sort(), [dd, `simulator:${IOS16}`].sort());
  assert.match(sent.system, /remove_simulator/);
  assert.match(sent.system, /xcode_items/);
  assert.match(sent.system, /~\/Library is a never zone[^\n]*xcode_items/, 'the rules tell Claude ~/Library is closed except for xcode_items');
  assert.ok(sent.output_config.format.schema.properties.actions.items.properties.op.enum.includes('remove_simulator'));
});
