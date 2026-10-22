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

  // The most specific matching zone wins. Anything inside a git repo is never touched.
  zoneFor(target) {
    const resolved = path.resolve(target);
    if (insideGitRepo(resolved)) return 'never';
    let best = null;
    for (const z of this.data.zones) {
      const root = path.resolve(z.path);
      if (resolved === root || resolved.startsWith(root + path.sep)) {
        if (!best || root.length > best.root.length) best = { root, zone: z.zone };
      }
    }
    return best ? best.zone : 'ask';
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
}

function insideGitRepo(target) {
  let dir = target;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) return true;
    dir = path.dirname(dir);
  }
  return false;
}

module.exports = { Profile, DEFAULT_PROFILE };
