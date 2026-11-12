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
  // US-04: projects to always keep, by folder name or a pattern like capstone-*. Shown in DINO MEMORY.
  protected: [],
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
  // A path is checked both as written and where it really leads (symlinks followed), and the stricter
  // zone wins, so a link can't carry a file into a NEVER zone (red-team F4). On macOS the disk ignores
  // letter case, so ~/library is ~/Library (F5).
  zoneInfo(target, { ignoreRepos = false } = {}) {
    const resolved = path.resolve(target);
    const repo = !ignoreRepos && gitRepoRoot(resolved);
    if (repo) return { zone: 'never', reason: `inside the code project ${repo}` };
    let worst = null;
    for (const p of new Set([resolved, realPath(resolved)])) {
      let best = null;
      for (const z of this.data.zones) {
        // A zone matches by its path as saved or where it really leads (on macOS /var is /private/var).
        const root = [path.resolve(z.path), realPath(z.path)].find((r) => within(p, r));
        if (root && (!best || root.length > best.root.length)) best = { root, zone: z.zone };
      }
      const info = best ? { zone: best.zone, reason: `zone set for ${best.root}` } : { zone: 'ask', reason: 'no zone set, so I ask first' };
      if (!worst || ZONES.indexOf(info.zone) > ZONES.indexOf(worst.zone)) worst = info;
    }
    return worst;
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
    return [path.resolve(target), realPath(target)].some((p) => LOCKED.some((root) => within(p, root) || within(p, realPath(root))));
  }

  setTargetPlan(targetPlan) {
    // Organized files may only go to real, full paths outside NEVER zones (red-team note on set-target).
    for (const root of (targetPlan && targetPlan.destRoots) || []) {
      if (typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('The target plan needs the full path of a folder.');
      if (this.isLocked(root) || this.zoneFor(root) === 'never') throw new Error(`${root} is in a NEVER zone, so files can't be organized into it.`);
    }
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

  // US-04: protect a project in every later plan. The validator enforces it, not the LLM.
  protect(name) {
    const clean = protectName(name);
    if (!this.data.protected.includes(clean)) this.data.protected.push(clean);
    this.save();
    return clean;
  }

  unprotect(name) {
    this.data.protected = this.data.protected.filter((p) => p !== name);
    this.save();
  }

  // The saved name or pattern that protects a folder called `name`, or null. Like macOS, it ignores case.
  protectedPattern(name) {
    return (this.data.protected || []).find((p) => globMatch(p, name)) || null;
  }

  // The protected folder that `target` is in, checking it and each parent up to the scanned folder.
  protectedBy(target, root) {
    const top = path.resolve(root);
    for (let dir = path.resolve(target); dir === top || dir.startsWith(top + path.sep); dir = path.dirname(dir)) {
      const pattern = this.protectedPattern(path.basename(dir));
      if (pattern) return { project: path.basename(dir), pattern };
      if (dir === top) break;
    }
    return null;
  }
}

// A protection is a folder name or a pattern with *, never a path.
function protectName(name) {
  const clean = typeof name === 'string' ? name.trim() : '';
  if (!clean || /[/\\]/.test(clean) || clean === '.' || clean === '..') {
    throw new Error(`"${name}" isn't a project name. Use a folder name like capstone-team7, or a pattern like capstone-*.`);
  }
  return clean;
}

function globMatch(pattern, name) {
  const re = pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${re}$`, 'i').test(name);
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

// True if p is root or inside it. APFS on macOS ignores letter case by default, so compare that way there.
function within(p, root) {
  const fold = process.platform === 'darwin' ? (s) => s.toLowerCase() : (s) => s;
  const a = fold(p);
  const b = fold(root);
  return a === b || a.startsWith(b + path.sep);
}

module.exports = { Profile, DEFAULT_PROFILE, protectName, realPath, within };
