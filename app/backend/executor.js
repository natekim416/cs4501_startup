// Carries out an approved plan. Personal files are never permanently deleted: removed files go to the
// Dino Bin and suspicious files go to quarantine. Rebuildable folders are really deleted (that's what
// frees space), and their rebuild recipe is logged so undo can tell the user how to get them back.
const fs = require('fs');
const path = require('path');

class Executor {
  // trashDir: where removed personal files go. The app passes the macOS Trash (US-13); without it they go
  // to the app's own Dino Bin, which keeps tests away from the real Trash.
  constructor(dataDir, { trashDir = null } = {}) {
    this.trashDir = trashDir;
    this.binDir = path.join(dataDir, 'dino-bin');
    this.quarantineDir = path.join(dataDir, 'quarantine');
    this.logFile = path.join(dataDir, 'undo-log.json');
    this.history = [];
    try {
      this.history = JSON.parse(fs.readFileSync(this.logFile, 'utf8'));
    } catch {
      // No history yet.
    }
  }

  saveLog() {
    fs.mkdirSync(path.dirname(this.logFile), { recursive: true });
    fs.writeFileSync(this.logFile, JSON.stringify(this.history, null, 2));
  }

  run(actions) {
    const batch = { id: Date.now().toString(36), at: new Date().toISOString(), steps: [] };
    const results = [];
    for (const a of actions) {
      try {
        const step = this.apply(a, batch.id);
        if (step) batch.steps.push({ ...step, actionId: a.id });
        results.push({ id: a.id, ok: true });
      } catch (err) {
        results.push({ id: a.id, ok: false, error: err.message });
      }
    }
    this.history.push(batch);
    this.saveLog();
    return { batchId: batch.id, results, steps: batch.steps.length };
  }

  apply(a, batchId) {
    if (a.op === 'mkdir') {
      if (fs.existsSync(a.path)) return null;
      fs.mkdirSync(a.path, { recursive: true });
      return { type: 'mkdir', path: a.path };
    }
    if (a.op === 'move' || a.op === 'rename') {
      const to = a.op === 'move' ? path.join(a.dest, path.basename(a.path)) : a.dest;
      if (fs.existsSync(to)) throw new Error(`${to} already exists`);
      fs.renameSync(a.path, to);
      return { type: 'move', from: a.path, to };
    }
    if (a.op === 'trash_duplicate' && this.trashDir) {
      fs.mkdirSync(this.trashDir, { recursive: true });
      const to = freeName(this.trashDir, path.basename(a.path));
      fs.renameSync(a.path, to);
      return { type: 'move', from: a.path, to };
    }
    if (a.op === 'trash_duplicate' || a.op === 'quarantine') {
      const base = a.op === 'quarantine' ? this.quarantineDir : this.binDir;
      const dir = path.join(base, batchId);
      fs.mkdirSync(dir, { recursive: true });
      const to = path.join(dir, `${Date.now()}-${path.basename(a.path)}`);
      fs.renameSync(a.path, to);
      if (a.op === 'quarantine') stripExecute(to);
      return { type: 'move', from: a.path, to };
    }
    if (a.op === 'delete_rebuildable') {
      if (!a.recipe) throw new Error(`No rebuild recipe for ${a.path}; refusing to delete it.`);
      fs.rmSync(a.path, { recursive: true });
      return { type: 'deleted', path: a.path, recipe: a.recipe };
    }
    if (a.op === 'clear_cache') {
      // Empty the cache but keep its folder; the package manager re-downloads what it needs.
      for (const e of fs.readdirSync(a.path)) fs.rmSync(path.join(a.path, e), { recursive: true });
      return { type: 'deleted', path: a.path, recipe: a.recipe || { command: 're-downloads automatically on the next install', cwd: a.path } };
    }
    throw new Error(`Unknown op ${a.op}`);
  }

  // US-14: reverses one action from a run and leaves every other action done.
  undoAction(batchId, actionId) {
    const batch = this.history.find((b) => b.id === batchId);
    const step = batch && batch.steps.find((st) => st.actionId === actionId && !st.undone);
    if (!step) return { undone: 0, needsRebuild: [] };
    const res = this.reverse(step);
    if (res.undone) step.undone = true;
    this.saveLog();
    return res;
  }

  // Undoes one logged step. A deleted build folder can't be moved back, so it's returned for rebuilding.
  reverse(step) {
    if (step.type === 'deleted') return { undone: 0, needsRebuild: [{ path: step.path, ...step.recipe }] };
    try {
      if (step.type === 'move') {
        fs.mkdirSync(path.dirname(step.from), { recursive: true });
        fs.renameSync(step.to, step.from);
      } else if (step.type === 'mkdir' && fs.readdirSync(step.path).length === 0) {
        fs.rmdirSync(step.path);
      }
      return { undone: 1, needsRebuild: [] };
    } catch {
      return { undone: 0, needsRebuild: [] };
    }
  }

  // Reverses the most recent batch, newest step first.
  undoLast() {
    const batch = this.history.pop();
    if (!batch) return { undone: 0, needsRebuild: [] };
    let undone = 0;
    const needsRebuild = [];
    // Keep undoing the rest even if one step can't be reversed; skip steps already undone one by one.
    for (const step of [...batch.steps].reverse()) {
      if (step.undone) continue;
      const res = this.reverse(step);
      undone += res.undone;
      needsRebuild.push(...res.needsRebuild);
    }
    this.saveLog();
    return { undone, needsRebuild };
  }
}

// Finder-style name for the Trash: "notes.pdf", then "notes 2.pdf", "notes 3.pdf"...
function freeName(dir, name) {
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  let candidate = path.join(dir, name);
  for (let i = 2; fs.existsSync(candidate); i++) candidate = path.join(dir, `${stem} ${i}${ext}`);
  return candidate;
}

function stripExecute(target) {
  try {
    const mode = fs.statSync(target).mode;
    fs.chmodSync(target, mode & ~0o111);
  } catch {
    // Bundles and read-only files can stay as they are; they're already isolated.
  }
}

module.exports = { Executor };
