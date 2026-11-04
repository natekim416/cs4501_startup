// Carries out an approved plan. Personal files are never permanently deleted: removed files go to the
// Dino Bin and suspicious files go to quarantine. Rebuildable folders are really deleted (that's what
// frees space), and their rebuild recipe is logged so undo can tell the user how to get them back.
const fs = require('fs');
const path = require('path');

class Executor {
  constructor(dataDir) {
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
        if (step) batch.steps.push(step);
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
    throw new Error(`Unknown op ${a.op}`);
  }

  // Reverses the most recent batch, newest step first.
  undoLast() {
    const batch = this.history.pop();
    if (!batch) return { undone: 0, needsRebuild: [] };
    let undone = 0;
    const needsRebuild = [];
    for (const step of [...batch.steps].reverse()) {
      try {
        if (step.type === 'deleted') {
          // Deleted for real: it comes back by rebuilding, not by moving files.
          needsRebuild.push({ path: step.path, ...step.recipe });
          continue;
        }
        if (step.type === 'move') {
          fs.mkdirSync(path.dirname(step.from), { recursive: true });
          fs.renameSync(step.to, step.from);
        } else if (step.type === 'mkdir' && fs.readdirSync(step.path).length === 0) {
          fs.rmdirSync(step.path);
        }
        undone++;
      } catch {
        // Keep undoing the rest even if one step can't be reversed.
      }
    }
    this.saveLog();
    return { undone, needsRebuild };
  }
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
