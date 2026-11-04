// Builders for the story tests: fake dev projects with real git history, lockfiles, and old mtimes.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const DAY = 24 * 60 * 60 * 1000;

function tmp(prefix = 'cleanasaurus-story-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function write(file, content = 'x') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

// Sets every mtime under dir (dir included) to `days` ago, so the project looks inactive.
function age(dir, days) {
  const when = new Date(Date.now() - days * DAY);
  const visit = (p) => {
    const stat = fs.lstatSync(p);
    if (stat.isDirectory()) for (const e of fs.readdirSync(p)) if (e !== '.git') visit(path.join(p, e));
    fs.utimesSync(p, when, when);
  };
  visit(dir);
}

function git(dir, ...args) {
  return execFileSync('git', ['-C', dir, ...args], {
    stdio: 'pipe',
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
  }).toString();
}

function gitCommitAll(dir) {
  git(dir, 'init', '-q');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init', '--allow-empty');
}

const LOCKFILES = { npm: 'package-lock.json', yarn: 'yarn.lock', pnpm: 'pnpm-lock.yaml' };

// A JavaScript project with node_modules. Options cover every rebuild-proof condition.
function makeJsProject(root, name, { lock = 'npm', ageDays = 60, repo = true, ignored = true, dirty = false, tracked = false, secret = false, kb = 64 } = {}) {
  const dir = path.join(root, name);
  write(path.join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0' }));
  write(path.join(dir, 'index.js'), 'console.log("hi")\n');
  if (lock) write(path.join(dir, LOCKFILES[lock]), `lock for ${name}\n`);
  write(path.join(dir, 'node_modules', 'left-pad', 'index.js'), 'x'.repeat(kb * 1024));
  if (secret) write(path.join(dir, 'node_modules', '.env'), 'API_KEY=secret\n');
  if (repo) {
    if (ignored) write(path.join(dir, '.gitignore'), 'node_modules/\n');
    gitCommitAll(dir);
    if (tracked) {
      git(dir, 'add', '-f', 'node_modules/left-pad/index.js');
      git(dir, 'commit', '-q', '-m', 'oops, committed a dependency');
    }
    if (dirty) write(path.join(dir, 'index.js'), 'console.log("uncommitted")\n');
  }
  age(dir, ageDays);
  return dir;
}

const PY_RECIPES = { requirements: 'requirements.txt', uv: 'uv.lock', poetry: 'poetry.lock' };

// A Python project with a .venv virtual environment.
function makePyProject(root, name, { recipe = 'requirements', ageDays = 60, repo = false } = {}) {
  const dir = path.join(root, name);
  write(path.join(dir, 'main.py'), 'print("hi")\n');
  if (recipe) write(path.join(dir, PY_RECIPES[recipe]), 'numpy==2.1.0\n');
  write(path.join(dir, '.venv', 'pyvenv.cfg'), 'home = /usr/bin\n');
  write(path.join(dir, '.venv', 'lib', 'python3.12', 'site-packages', 'numpy', '__init__.py'), 'x'.repeat(32 * 1024));
  if (repo) {
    write(path.join(dir, '.gitignore'), '.venv/\n');
    gitCommitAll(dir);
  }
  age(dir, ageDays);
  return dir;
}

module.exports = { DAY, tmp, write, age, git, gitCommitAll, makeJsProject, makePyProject, LOCKFILES };
