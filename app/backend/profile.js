// The user's profile: permission zones, target plan, and preferences learned from their answers.
// Stored as a JSON file on the user's own machine.
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const ZONES = ['free', 'ask', 'never'];
// FEAT-01: macOS and its apps need these, so they're always NEVER, and so is everything inside them.
const LOCKED = [path.join(HOME, 'Library'), '/System', '/Applications'];

const DEFAULT_PROFILE = {
  zones: [
    { path: path.join(HOME, 'Library'), zone: 'never' },
    { path: '/System', zone: 'never' },
    { path: '/Applications', zone: 'never' },
    { path: path.join(HOME, 'Documents'), zone: 'ask' },
    { path: path.join(HOME, 'Downloads'), zone: 'free' },
    { path: path.join(HOME, 'Desktop'), zone: 'free' },
  ],
  // Where organized files are allowed to end up. Empty means "inside the folder being cleaned".
  targetPlan: { destRoots: [], notes: '' },
  preferences: [],
  // null until the user answers, then true or false. See usage-log.js.
  usageLogging: null,
};

class Profile {
  constructor(file) {
    this.file = file;
    this.data = structuredClone(DEFAULT_PROFILE);
    try {
      this.data = { ...this.data, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    } catch {
      // First run: keep the defaults.
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  zoneFor(target, opts) {
    return this.zoneInfo(target, opts).zone;
  }

  // The most specific matching zone wins. Anything inside a code project (git repo) is never touched,
  // except that the rebuild proof may check a project's build folders (ignoreRepos).
  zoneInfo(target, { ignoreRepos = false } = {}) {
    const resolved = path.resolve(target);
    const repo = !ignoreRepos && gitRepoRoot(resolved);
    if (repo) return { zone: 'never', reason: `inside the code project ${repo}` };
    let best = null;
    for (const z of this.data.zones) {
      const root = path.resolve(z.path);
      if (resolved === root || resolved.startsWith(root + path.sep)) {
        if (!best || root.length > best.root.length) best = { root, zone: z.zone };
      }
    }
    return best ? { zone: best.zone, reason: `zone set for ${best.root}` } : { zone: 'ask', reason: 'no zone set, so I ask first' };
  }

  // Used by the "This folder" buttons: adds a zone for a folder, or replaces the one it has.
  setZone(zonePath, zone) {
    this.checkZone(zonePath, zone);
    this.data.zones = this.data.zones.filter((z) => path.resolve(z.path) !== path.resolve(zonePath));
    this.data.zones.push({ path: zonePath, zone });
    this.save();
  }

  // FEAT-01: changes a zone already in the list, in place. Returns the old and new zone.
  changeZone(zonePath, zone) {
    const entry = typeof zonePath === 'string' && this.data.zones.find((z) => path.resolve(z.path) === path.resolve(zonePath));
    if (!entry) throw new Error(`${zonePath} isn't in your zones list.`);
    this.checkZone(zonePath, zone);
    const from = entry.zone;
    entry.zone = zone;
    this.save();
    return { from, to: zone };
  }

  // The rules every zone change must pass, whatever the page asks for.
  checkZone(zonePath, zone) {
    if (!ZONES.includes(zone)) throw new Error(`"${zone}" isn't a zone. Use free, ask, or never.`);
    if (typeof zonePath !== 'string' || !path.isAbsolute(zonePath)) throw new Error('A zone needs the full path of a folder.');
    if (zone !== 'never' && this.isLocked(zonePath)) throw new Error(`${zonePath} is a macOS folder, so it always stays NEVER.`);
  }

  // True for a locked macOS folder, anything inside one, or a link that leads into one.
  isLocked(target) {
    return [path.resolve(target), realPath(target)].some((p) => LOCKED.some((root) => p === root || p.startsWith(root + path.sep)));
  }

  setTargetPlan(targetPlan) {
    this.data.targetPlan = { ...this.data.targetPlan, ...targetPlan };
    this.save();
  }

  remember(preference) {
    if (!this.data.preferences.includes(preference)) this.data.preferences.push(preference);
    this.save();
  }

  forget(preference) {
    this.data.preferences = this.data.preferences.filter((p) => p !== preference);
    this.save();
  }
}

// Returns the repo folder if target is inside a code project. A repo at the home folder
// or above (e.g. a dotfiles repo in ~) isn't a code project, so it doesn't count.
function gitRepoRoot(target) {
  const home = path.resolve(os.homedir());
  const inHome = target.startsWith(home + path.sep);
  for (let dir = target; dir !== path.dirname(dir); dir = path.dirname(dir)) {
    if (inHome && dir === home) return null;
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
  }
  return null;
}

// Where a path really leads, following links. For a folder that doesn't exist yet, the nearest
// existing parent is resolved and the rest is added back, so a link can't hide where it ends up.
function realPath(target) {
  const resolved = path.resolve(target);
  for (let dir = resolved; ; dir = path.dirname(dir)) {
    try {
      return path.join(fs.realpathSync(dir), path.relative(dir, resolved));
    } catch {
      if (dir === path.dirname(dir)) return resolved;
    }
  }
}

module.exports = { Profile, DEFAULT_PROFILE };
