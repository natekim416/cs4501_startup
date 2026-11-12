// US-08: Xcode's build data (DerivedData) and simulator runtimes. Both live in ~/Library, which is always
// NEVER, so only the exact items found here are opened up, and each one says how it comes back.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { measureFreeable } = require('../devclutter');

const DAY = 24 * 60 * 60 * 1000;
const BUILD_DAYS = 30;
const SIMULATOR_DAYS = 180;
const REBUILDS = 'Xcode rebuilds it on the next build.';
const REDOWNLOAD = 'If you need it again, it re-downloads from Xcode Settings > Components.';

const derivedDataDir = (home) => path.join(home, 'Library', 'Developer', 'Xcode', 'DerivedData');

// True for a project's own folder in DerivedData (not DerivedData itself, and nothing deeper).
function isDerivedData(p, home = os.homedir()) {
  return path.dirname(path.resolve(p)) === derivedDataDir(home);
}

// Runs xcrun only where simulators exist, so a Mac without Xcode never gets the "install developer tools" prompt.
function xcrunFor(home) {
  return (cmd, args) => {
    if (!fs.existsSync(path.join(home, 'Library', 'Developer', 'CoreSimulator'))) throw new Error('No simulators on this Mac.');
    return execFileSync(cmd, args, { stdio: 'pipe', timeout: 5 * 60 * 1000 }).toString();
  };
}

function list(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function parse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// The workspace a DerivedData folder was built from, null if its info.plist doesn't say, or undefined if
// there's no info.plist at all (a shared cache like ModuleCache.noindex, which belongs to no one project).
function workspaceOf(dir) {
  let text;
  try {
    text = fs.readFileSync(path.join(dir, 'info.plist'), 'utf8');
  } catch {
    return undefined;
  }
  const m = text.match(/<key>WorkspacePath<\/key>\s*<string>([^<]+)<\/string>/);
  return m ? m[1].replace(/&amp;/g, '&') : null;
}

// When the project was last built: the newest of the folder, its info.plist, and its top-level build folders.
// Xcode writes to these on every build, so this stays cheap even for a folder with 100,000 files.
function lastBuilt(dir) {
  let newest = 0;
  const look = (p) => {
    try {
      newest = Math.max(newest, fs.statSync(p).mtimeMs);
    } catch {
      // Gone, or unreadable: it doesn't count.
    }
  };
  look(dir);
  for (const e of list(dir)) look(path.join(dir, e));
  for (const sub of ['Build', 'Logs', 'Index.noindex']) for (const e of list(path.join(dir, sub))) look(path.join(dir, sub, e));
  return newest;
}

function derivedDataItems(home, now) {
  const items = [];
  for (const name of list(derivedDataDir(home))) {
    const dir = path.join(derivedDataDir(home), name);
    const workspace = workspaceOf(dir);
    if (workspace === undefined) continue;
    const project = workspace ? path.basename(workspace).replace(/\.(xcodeproj|xcworkspace|swiftpm)$/, '') : name.replace(/-[a-z]+$/, '');
    const gone = Boolean(workspace) && !fs.existsSync(workspace);
    const days = Math.floor((now - lastBuilt(dir)) / DAY);
    if (!gone && days < BUILD_DAYS) continue;
    const why = gone ? `${project} no longer exists at ${workspace}` : `${project} hasn't been built in ${days} days`;
    items.push({
      id: dir,
      type: 'xcode-deriveddata',
      path: dir,
      project,
      bytes: measureFreeable(dir),
      label: 'rebuildable',
      reason: `Xcode build data: ${why}. ${REBUILDS}`,
      rebuild: { command: null, cwd: home, note: `${project} build data: ${REBUILDS}` },
    });
  }
  return items;
}

// "com.apple.CoreSimulator.SimRuntime.iOS-16-0" -> "iOS 16.0"
function runtimeName(key) {
  const m = key.match(/SimRuntime\.([A-Za-z]+)-([\d-]+)$/);
  return m ? `${m[1]} ${m[2].replace(/-/g, '.')}` : key;
}

// A runtime is offered only if something proves it's unused: every device's last boot, and Xcode's own
// last-used date for the runtime, are all over 180 days old. With no date at all, it stays.
function simulatorItems(home, run, now) {
  let listed;
  try {
    listed = parse(run('xcrun', ['simctl', 'list', 'devices', '--json']));
  } catch {
    return [];
  }
  if (!listed || typeof listed.devices !== 'object') return [];
  let runtimes = {};
  try {
    runtimes = parse(run('xcrun', ['simctl', 'runtime', 'list', '-j'])) || {};
  } catch {
    // Xcode 14 and older have no runtime list; the devices are still offered.
  }
  const images = Object.values(runtimes).filter((r) => r && typeof r === 'object' && r.runtimeIdentifier);
  const items = [];
  for (const [key, devices] of Object.entries(listed.devices)) {
    if (!Array.isArray(devices)) continue;
    const image = images.find((r) => r.runtimeIdentifier === key);
    // A runtime that ships inside Xcode can't be removed on its own.
    if (image && image.deletable === false) continue;
    const dates = [...devices.map((d) => d.lastBootedAt), image && image.lastUsedAt].filter(Boolean).map(Date.parse).filter((n) => !Number.isNaN(n));
    if (!dates.length) continue;
    const days = Math.floor((now - Math.max(...dates)) / DAY);
    if (days < SIMULATOR_DAYS) continue;
    const name = runtimeName(key);
    // Exactly what will run, built here from simctl's own ids: the devices first, then the runtime image.
    const steps = [...devices.filter((d) => d.udid).map((d) => ['simctl', 'delete', d.udid]), ...(image && image.identifier ? [['simctl', 'runtime', 'delete', image.identifier]] : [])];
    const bytes = devices.reduce((n, d) => n + (Number(d.dataPathSize) || 0), 0) + (image ? Number(image.sizeBytes) || 0 : 0);
    items.push({
      id: `simulator:${key}`,
      type: 'simulator',
      path: `simulator:${key}`,
      project: null,
      name,
      bytes,
      label: 'rebuildable',
      reason: `${name} simulator, last used ${days} days ago (${devices.length} device${devices.length === 1 ? '' : 's'}). ${REDOWNLOAD}`,
      rebuild: { command: null, cwd: home, note: `${name} simulator: ${REDOWNLOAD}`, xcrun: steps },
    });
  }
  return items;
}

// Everything Xcode-related that's safe to offer, biggest first.
function xcodeItems({ home = os.homedir(), run = xcrunFor(home), now = Date.now() } = {}) {
  return [...derivedDataItems(home, now), ...simulatorItems(home, run, now)].sort((a, b) => b.bytes - a.bytes);
}

module.exports = { xcodeItems, xcrunFor, isDerivedData, BUILD_DAYS, SIMULATOR_DAYS };
