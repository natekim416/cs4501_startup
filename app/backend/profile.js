// The user's profile: permission zones, target plan, and preferences learned from their answers.
// Stored as a JSON file on the user's own machine.
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();

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

  setZone(zonePath, zone) {
    this.data.zones = this.data.zones.filter((z) => path.resolve(z.path) !== path.resolve(zonePath));
    this.data.zones.push({ path: zonePath, zone });
    this.save();
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

module.exports = { Profile, DEFAULT_PROFILE, protectName };
