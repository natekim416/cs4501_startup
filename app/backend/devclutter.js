// Developer clutter: finds folders that can be rebuilt (node_modules, Python environments, package
// caches) and decides, with plain code, whether deleting one is provably safe. The LLM may propose a
// deletion, but only rebuildProof() can clear it. Anything we can't prove stays off-limits.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const DAY = 24 * 60 * 60 * 1000;
const INACTIVE_DAYS = 30;
const SKIP = new Set(['.git', '.Trash', '.cleanasaurus']);
const VM_EXTS = new Set(['.utm', '.vmwarevm', '.pvm', '.vmdk', '.qcow2', '.vdi', '.vhdx']);
const SECRET = /^(\.env(\.(?!example$|sample$|template$)[\w.-]+)?|id_rsa|id_ed25519|.*\.pem|.*\.key)$/i;

const JS_LOCKS = [
  ['pnpm-lock.yaml', 'pnpm install --frozen-lockfile'],
  ['yarn.lock', 'yarn install --frozen-lockfile'],
  ['package-lock.json', 'npm ci'],
];
// A path that goes into a rebuild command. Plain names stay as they are; anything else is single-quoted,
// so a folder named "env$(touch x)" or ";rm -rf ~" is only ever a name, never a command.
const shq = (s) => (/^[\w./@+:-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);

const PY_RECIPES = [
  ['uv.lock', () => 'uv sync'],
  ['poetry.lock', () => 'poetry install'],
  ['requirements.txt', (venv) => `python3 -m venv ${shq(venv)} && ${shq(venv)}/bin/pip install -r requirements.txt`],
];
const MINUTES = { node_modules: 'about 1 minute', 'python-venv': 'about 2 minutes', 'conda-env': 'about 5 minutes' };

const exists = (p) => fs.existsSync(p);
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// What kind of rebuildable folder this is, or null.
function typeOf(dir) {
  if (path.basename(dir) === 'node_modules') return 'node_modules';
  if (exists(path.join(dir, 'pyvenv.cfg'))) return 'python-venv';
  if (exists(path.join(dir, 'conda-meta'))) return 'conda-env';
  return null;
}

// The saved recipe for rebuilding a folder, or null if there isn't one.
function recipeFor(dir, type, { condaExports = {} } = {}) {
  const project = path.dirname(dir);
  if (type === 'node_modules') {
    const hit = JS_LOCKS.find(([lock]) => exists(path.join(project, lock)));
    return hit && { command: hit[1], cwd: project, lockfile: path.join(project, hit[0]) };
  }
  if (type === 'python-venv') {
    const hit = PY_RECIPES.find(([file]) => exists(path.join(project, file)));
    return hit && { command: hit[1](path.basename(dir)), cwd: project, lockfile: path.join(project, hit[0]) };
  }
  if (type === 'conda-env') {
    const yml = condaExports[dir] || [path.join(project, 'environment.yml'), path.join(dir, 'environment.yml')].find(exists);
    return yml && { command: `conda env create -f ${shq(yml)} -p ${shq(dir)}`, cwd: project, lockfile: yml };
  }
  return null;
}

function withHash(recipe) {
  return recipe && { ...recipe, lockfileHash: sha256(recipe.lockfile) };
}

// Xcode Archives hold the symbols that make crash reports readable, so nothing ever cleans them.
const isXcodeArchive = (p) => /[/\\]Xcode[/\\]Archives([/\\]|$)/.test(p) || p.endsWith('.xcarchive');

function vmBundle(p) {
  for (let dir = p; dir !== path.dirname(dir); dir = path.dirname(dir)) {
    if (VM_EXTS.has(path.extname(dir).toLowerCase())) return dir;
  }
  return null;
}

// US-02: a label for anything the user might look at: rebuildable (and how), not (and why), or unknown.
function labelPath(p, opts = {}) {
  if (p.startsWith('docker-volume:')) {
    return { label: 'not_rebuildable', type: 'docker-volume', reason: 'Not rebuildable: a Docker volume may hold a database.' };
  }
  if (isXcodeArchive(p)) {
    return { label: 'not_rebuildable', type: 'xcode-archive', reason: 'Not rebuildable: Xcode Archives are what crash reports need to be readable.' };
  }
  if (vmBundle(p)) {
    return { label: 'not_rebuildable', type: 'vm-disk', reason: "Not rebuildable: a virtual machine's disk. Deleting it loses the machine." };
  }
  const type = typeOf(p);
  if (!type) return { label: 'unknown', type: null, reason: "Unknown: I don't recognize this, so I treat it as not rebuildable." };
  const recipe = recipeFor(p, type, opts);
  if (!recipe) {
    return { label: 'not_rebuildable', type, reason: `Not rebuildable: no lockfile or manifest next to it, so I can't rebuild it exactly.` };
  }
  return { label: 'rebuildable', type, reason: `Rebuildable: \`${recipe.command}\`, ${MINUTES[type]}.`, rebuild: recipe };
}

// Bytes that deleting dir would really free. A file hard-linked from outside (pnpm's shared store)
// frees nothing, and a file linked twice inside dir counts once.
function measureFreeable(dir) {
  const inodes = new Map();
  const stack = [dir];
  while (stack.length) {
    const p = stack.pop();
    let st;
    try {
      st = fs.lstatSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      try {
        for (const e of fs.readdirSync(p)) stack.push(path.join(p, e));
      } catch {
        // Unreadable folder: count what we can.
      }
    } else if (st.isFile()) {
      const key = `${st.dev}:${st.ino}`;
      const seen = inodes.get(key) || { size: st.size, nlink: st.nlink, inside: 0 };
      seen.inside++;
      inodes.set(key, seen);
    }
  }
  let bytes = 0;
  for (const f of inodes.values()) if (f.inside >= f.nlink) bytes += f.size;
  return bytes;
}

const CACHES = [
  ['npm-cache', ['.npm', '_cacache'], 'npm cache clean --force'],
  ['yarn-cache', ['Library', 'Caches', 'Yarn'], 'yarn cache clean'],
  ['pnpm-cache', ['Library', 'pnpm', 'store'], 'pnpm store prune'],
];

// US-06: package-manager caches, one item each, only if they exist.
function toolCaches(home = os.homedir()) {
  return CACHES.map(([type, parts, command]) => ({ type, path: path.join(home, ...parts), command }))
    .filter((c) => exists(c.path))
    .map((c) => ({
      id: c.type,
      type: c.type,
      path: c.path,
      project: null,
      bytes: measureFreeable(c.path),
      label: 'rebuildable',
      reason: `Package-manager cache: packages re-download the next time you install. Cleared with \`${c.command}\`.`,
      rebuild: { command: c.command, cwd: home, lockfile: null },
    }));
}

function git(dir, args) {
  return execFileSync('git', ['-C', dir, ...args], { stdio: 'pipe' }).toString().trim();
}

// The project's own repo, ignoring a repo at the home folder or above (a dotfiles repo isn't a project).
function repoFor(dir, home) {
  let top;
  try {
    top = git(dir, ['rev-parse', '--show-toplevel']);
  } catch {
    return null;
  }
  const realTop = fs.realpathSync(top);
  const realHome = fs.realpathSync(home);
  return realHome === realTop || realHome.startsWith(realTop + path.sep) ? null : realTop;
}

// Newest change in the project, not counting rebuildable folders or git's own files.
function lastChanged(project) {
  let newest = 0;
  const stack = [{ p: project, depth: 0 }];
  while (stack.length) {
    const { p, depth } = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(p, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(p, e.name);
      if (SKIP.has(e.name)) continue;
      if (e.isDirectory()) {
        if (typeOf(full) || depth >= 6) continue;
        stack.push({ p: full, depth: depth + 1 });
      } else {
        try {
          newest = Math.max(newest, fs.lstatSync(full).mtimeMs);
        } catch {
          // Gone between readdir and stat.
        }
      }
    }
  }
  return newest;
}

function findSecret(dir) {
  const stack = [dir];
  while (stack.length) {
    const p = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(p, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isDirectory()) stack.push(path.join(p, e.name));
      else if (SECRET.test(e.name)) return path.join(p, e.name);
    }
  }
  return null;
}

// US-05: the rebuild proof. Every condition is checked by plain code, and each failure says why.
function rebuildProof(dir, { now = Date.now(), named = [], home = os.homedir(), condaExports } = {}) {
  const target = path.resolve(dir);
  const project = path.dirname(target);
  const name = path.basename(project);
  const where = `${name}/${path.basename(target)}`;
  const failures = [];
  const fail = (condition, message) => failures.push({ condition, message });

  const type = typeOf(target);
  if (!type || !exists(target)) {
    fail('known_type', `${where} isn't a folder type I know how to rebuild, so I won't delete it.`);
    return { ok: false, failures, recipe: null, type };
  }

  const repo = repoFor(project, home);
  if (repo) {
    const rel = path.relative(repo, fs.realpathSync(target));
    if (git(repo, ['ls-files', '--', rel])) fail('not_source', `git tracks files inside ${where}, so it's source code, not clutter.`);
    else {
      try {
        git(repo, ['check-ignore', '-q', '--', rel]);
      } catch {
        fail('not_source', `${where} isn't in .gitignore, so I can't prove it's a build folder.`);
      }
    }
    if (git(repo, ['status', '--porcelain'])) fail('clean_worktree', `${name} has uncommitted changes, so I won't touch anything in it.`);
  }

  const recipe = withHash(recipeFor(target, type, { condaExports }));
  if (!recipe) {
    const what = type === 'node_modules' ? 'lockfile (package-lock.json, yarn.lock, or pnpm-lock.yaml)' : 'lockfile or requirements file';
    fail('recipe', `no ${what} in ${name}, so it can't be rebuilt exactly.`);
  }

  const secret = findSecret(target);
  if (secret) fail('nothing_irreplaceable', `${where} contains ${path.basename(secret)}, which may hold secrets I can't get back.`);

  const isNamed = named.some((n) => n.toLowerCase() === name.toLowerCase());
  const days = Math.floor((now - lastChanged(project)) / DAY);
  if (!isNamed && days < INACTIVE_DAYS) {
    fail('inactive', `${name} changed ${days} day${days === 1 ? '' : 's'} ago. I only clean projects untouched for 30 days unless you name them.`);
  }

  return { ok: failures.length === 0, failures, recipe, type };
}

// What Claude (and the user) should know about a project before cleaning it.
function projectInfo(project, { now = Date.now(), home = os.homedir() } = {}) {
  const repo = repoFor(project, home);
  let uncommitted = false;
  if (repo) {
    try {
      uncommitted = Boolean(git(repo, ['status', '--porcelain']));
    } catch {
      uncommitted = false;
    }
  }
  return { lastChangedDays: Math.floor((now - lastChanged(project)) / DAY), uncommitted };
}

// US-07: a conda environment with no environment.yml gets exported first; the export is the recipe.
function exportCondaEnv(env, { dataDir, run = (cmd, args) => execFileSync(cmd, args, { stdio: 'pipe' }).toString() }) {
  const yml = run('conda', ['env', 'export', '-p', env]);
  const file = path.join(dataDir, 'conda-exports', `${path.basename(env)}-${Date.now()}.yml`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, yml);
  return withHash({ command: `conda env create -f ${shq(file)} -p ${shq(env)}`, cwd: path.dirname(env), lockfile: file });
}

// Every labeled item under root: rebuildable folders and things we must never touch.
function findArtifacts(root, opts = {}) {
  const items = [];
  const stack = [{ dir: root, depth: 0 }];
  while (stack.length) {
    const { dir, depth } = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory() || SKIP.has(e.name)) continue;
      const full = path.join(dir, e.name);
      const isVm = VM_EXTS.has(path.extname(e.name).toLowerCase());
      const type = !isVm && typeOf(full);
      if (isVm || type) {
        const label = labelPath(full, opts);
        items.push({
          id: full,
          path: full,
          type: label.type,
          project: path.dirname(full),
          bytes: measureFreeable(full),
          label: label.label,
          reason: label.reason,
          rebuild: label.rebuild || null,
        });
      } else if (depth < 8) {
        stack.push({ dir: full, depth: depth + 1 });
      }
    }
  }
  return items.sort((a, b) => b.bytes - a.bytes);
}

module.exports = { typeOf, labelPath, isXcodeArchive, rebuildProof, measureFreeable, toolCaches, exportCondaEnv, findArtifacts, lastChanged, projectInfo, INACTIVE_DAYS };
