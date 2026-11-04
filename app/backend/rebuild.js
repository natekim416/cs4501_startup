// US-15: one click rebuilds a folder Cleanasaurus deleted, using the exact command the rebuild proof saved.
const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// Runs the saved command in the project. The command came from our own recipe table, never from the LLM.
function defaultRun(command, { cwd }) {
  execSync(command, { cwd, stdio: 'pipe', timeout: 15 * 60 * 1000 });
}

function rebuild(recipe, { run = defaultRun, record = () => {} } = {}) {
  let warning = null;
  try {
    if (recipe.lockfile && recipe.lockfileHash && sha256(recipe.lockfile) !== recipe.lockfileHash) {
      warning = 'Your lockfile changed since I deleted this folder, so the rebuild will follow the new lockfile.';
    }
  } catch {
    warning = 'I could not read the lockfile I saved, so the rebuild may differ from what was deleted.';
  }
  const started = Date.now();
  try {
    run(recipe.command, { cwd: recipe.cwd });
    record({ event: 'rebuild', ok: true, ms: Date.now() - started });
    return { ok: true, warning, message: `Rebuilt with \`${recipe.command}\`.` };
  } catch (err) {
    record({ event: 'rebuild_failed', ok: false, ms: Date.now() - started });
    return { ok: false, warning, message: `The rebuild failed. Run this yourself in ${recipe.cwd}:\n${recipe.command}`, error: String(err.message || err).slice(0, 500) };
  }
}

module.exports = { rebuild };
