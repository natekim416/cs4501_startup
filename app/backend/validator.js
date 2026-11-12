// The guardrail: every plan the LLM writes goes through here before the user sees it.
// It checks the plan against the real file system, the permission zones, the target plan,
// duplicate hashes, and malware findings, then dry-runs it on a virtual copy of the folder.
const fs = require('fs');
const path = require('path');
const { hashFile } = require('./scanner');
const { rebuildProof, measureFreeable, toolCaches, isXcodeArchive } = require('./devclutter');
const { isDerivedData } = require('./ecosystems/xcode');
const { inTrash, itemBytes } = require('./trash');
const { realPath } = require('./profile');
const { mlProof } = require('./ecosystems/ml');
const { cleanupIntent } = require('./cleanup-intent');

// "a/link/../b" means one place to path.resolve and another to the OS once "link" is a symlink, so a
// plan path with ".." is never allowed (red-team F3).
const hasDotDot = (p) => typeof p === 'string' && p.split(/[\\/]/).includes('..');

const OPS = new Set(['mkdir', 'move', 'rename', 'trash_duplicate', 'quarantine', 'delete_rebuildable', 'clear_cache', 'delete_from_trash', 'remove_simulator', 'remove_docker_image', 'clear_docker_build_cache', 'remove_ml_model']);
const BIG_FILE = 1024 ** 3;
const MAX_ACTIONS = 500;

function inside(child, root) {
  const c = path.resolve(child);
  const r = path.resolve(root);
  return c === r || c.startsWith(r + path.sep);
}

// xcode: what the Xcode check found unused (US-08). Only those exact items in ~/Library can be cleaned.
function validate(plan, { request = '', scan, findings, profile, now, named, home, condaExports, trashDir, xcode = [], docker = { items: [] }, ml = [], namedModels = [] }) {
  const errors = [];
  const warnings = [];
  const needsApproval = [];
  const strange = [];

  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.actions)) {
    return result(false, [{ action: null, message: 'Plan must be a JSON object with an "actions" array.' }]);
  }
  if (plan.actions.length > MAX_ACTIONS) {
    errors.push({ action: null, message: `Plan has ${plan.actions.length} actions; the limit is ${MAX_ACTIONS}. Split the work.` });
  }

  const destRoots = profile.data.targetPlan.destRoots.length ? profile.data.targetPlan.destRoots : [scan.root];
  const flagged = new Set(findings.map((f) => path.resolve(f.path)));
  const sizes = new Map(scan.files.map((f) => [path.resolve(f.path), f.size]));

  // Virtual file system for the dry run.
  const files = new Set(scan.files.map((f) => path.resolve(f.path)));
  const dirs = new Set([path.resolve(scan.root), ...scan.dirs.map((d) => path.resolve(scan.root, d))]);
  const fileExists = (p) => files.has(p);
  const dirExists = (p) => dirs.has(p) || (!files.has(p) && isRealDir(p));
  const removed = new Map(); // path -> the copy that must survive
  const recipes = {}; // action id -> how to rebuild what it deletes
  let bytesFreed = 0;
  const actionIds = new Set();
  const externalTargets = new Set();

  plan.actions.forEach((a, i) => {
    const id = a && a.id ? a.id : `#${i + 1}`;
    const fail = (message) => errors.push({ action: id, message });

    if (!a || typeof a !== 'object') return fail('Each action must be an object.');
    // Red-team F11: every field the model fills is text; anything else is an error to fix, not a crash.
    const wrong = ['id', 'op', 'path', 'dest', 'keep', 'reason'].find((k) => a[k] != null && typeof a[k] !== 'string');
    if (wrong) return fail(`"${wrong}" must be text.`);
    if (actionIds.has(id)) return fail('Each action must have a unique id.');
    actionIds.add(id);
    if (!OPS.has(a.op)) return fail(`Unknown op "${a.op}". Allowed: ${[...OPS].join(', ')}.`);
    if (['path', 'dest', 'keep'].some((k) => hasDotDot(a[k]))) return fail('Paths may not contain "..". Use the full, direct path.');
    if (a.op === 'remove_docker_image' || a.op === 'clear_docker_build_cache') {
      if (!cleanupIntent(request, [], docker.items).docker) return fail('Docker cleanup was not requested.');
      if (!a.reason) return fail('Every action needs a "reason" the user can read.');
      const type = a.op === 'remove_docker_image' ? 'docker-image' : 'docker-build-cache';
      const item = docker.items.find((x) => x.path === a.path && x.type === type && x.label === 'rebuildable');
      if (!item) return fail(`${a.path} isn't an unused, rebuildable Docker item from the current scan.`);
      if (externalTargets.has(a.path)) return fail('A Docker item may only be removed once per plan.');
      externalTargets.add(a.path);
      recipes[id] = { ...item.rebuild, dockerItem: item };
      bytesFreed += item.bytes;
      // Docker is outside the picked folder; show it unchecked, even in a FREE zone.
      needsApproval.push(id);
      return;
    }
    // US-08: a simulator runtime is an id, not a file. Only a runtime the Xcode check found unused can go,
    // and the steps that remove it come from that check, never from the plan.
    if (a.op === 'remove_simulator') {
      if (!a.reason) return fail('Every action needs a "reason" the user can read.');
      const sim = xcode.find((x) => x.type === 'simulator' && x.path === a.path);
      if (!sim) return fail(`${a.path} isn't a simulator runtime I found unused for 180 days.`);
      recipes[id] = sim.rebuild;
      bytesFreed += sim.bytes;
      return;
    }
    if (!a.path || !path.isAbsolute(a.path)) return fail('"path" must be an absolute path.');
    if (!a.reason) return fail('Every action needs a "reason" the user can read.');

    const src = path.resolve(a.path);
    // US-04: nothing inside a folder the user asked to always keep, whatever the op.
    const guard = protectedBy(profile, src, scan.root);
    if (guard) return fail(`${guard.project} is protected in DINO MEMORY (always keep "${guard.pattern}"). Leave it out of the plan.`);
    // US-08: Archives stay, whatever zone they're in.
    if (isXcodeArchive(src)) return fail(`${src} is an Xcode Archive. Xcode Archives are what crash reports need to be readable, so they always stay NEVER.`);
    if (a.op === 'remove_ml_model') {
      if (!cleanupIntent(request, ml.length ? ml : namedModels.map((model) => ({ model }))).ml) return fail('Model-cache cleanup was not requested.');
      if (profile.zoneFor(src) === 'never') return fail(`${src} is in a NEVER-touch zone.`);
      if (externalTargets.has(src)) return fail('A model may only be removed once per plan.');
      const proof = mlProof(src, { home, now, named: namedModels });
      if (!proof.ok) {
        for (const failure of proof.failures) fail(`Model cache check failed: ${failure.message}`);
        return;
      }
      if (cleanupIntent(request, [proof.item]).keptModels.includes(proof.item.model)) return fail('The user asked to keep this model.');
      const scope = cleanupIntent(request, ml.length ? ml : namedModels.map((model) => ({ model })));
      if (scope.onlyNamedModels && !scope.namedModels.includes(proof.item.model)) return fail('Only the exact models the user named may be removed for this request.');
      externalTargets.add(src);
      recipes[id] = { ...proof.item.rebuild, model: proof.item.model, home, named: namedModels };
      bytesFreed += proof.item.bytes;
      for (const f of [...files]) if (inside(f, src)) files.delete(f);
      needsApproval.push(id);
      return;
    }
    // US-08: DerivedData lives in ~/Library, which is NEVER. Only the exact folders the Xcode check found
    // unused are opened up (Xcode rebuilds them); any other folder there still meets the zone check below.
    const built = a.op === 'delete_rebuildable' && xcode.find((x) => x.type === 'xcode-deriveddata' && path.resolve(x.path) === src);
    if (built) {
      recipes[id] = built.rebuild;
      bytesFreed += built.bytes;
      return;
    }
    if (a.op === 'delete_rebuildable' && isDerivedData(src, home)) {
      return fail(`${path.basename(src)} is Xcode build data that was built in the last 30 days, or that I can't match to a project, so I won't delete it.`);
    }
    // US-30: a permanent delete is allowed only for something already in the Trash, and always asks.
    if (a.op === 'delete_from_trash') {
      if (!inTrash(src, trashDir)) return fail(`${src} isn't in the Trash. I can permanently delete only items already in the Trash.`);
      bytesFreed += itemBytes(src);
      needsApproval.push(id);
      return;
    }
    // A package-manager cache we know is matched by its exact path before the zone check: the Yarn and pnpm
    // caches live in ~/Library, which is always NEVER (REG-8). Anything else there, even next to them, still is.
    const knownCache = a.op === 'clear_cache' && toolCaches(home).find((c) => path.resolve(c.path) === src);
    // A code project is NEVER for moves, but its gitignored build folders are what the rebuild proof checks.
    const zone = a.op === 'delete_rebuildable' ? profile.zoneFor(src, { ignoreRepos: true }) : profile.zoneFor(src);
    if (zone === 'never' && !knownCache) return fail(`${src} is in a NEVER-touch zone. Remove this action.`);

    if (a.op === 'mkdir') {
      if (!destRoots.some((r) => inside(src, r))) return fail(`New folder ${src} is outside the target plan (${destRoots.join(', ')}).`);
      if (fileExists(src)) return fail(`Cannot create folder ${src}: a file with that name exists.`);
      dirs.add(src);
    } else if (a.op === 'move' || a.op === 'rename') {
      if (!fileExists(src)) return fail(`${src} does not exist (or was already moved/removed earlier in this plan).`);
      if (!inside(src, scan.root)) return fail(`${src} is outside the folder being cleaned.`);
      if (!a.dest || !path.isAbsolute(a.dest)) return fail('"dest" must be an absolute path.');
      const dest = a.op === 'move' ? path.join(path.resolve(a.dest), path.basename(src)) : path.resolve(a.dest);
      const destDir = path.dirname(dest);
      if (zone === 'never' || profile.zoneFor(dest) === 'never') return fail(`Destination ${dest} is in a NEVER-touch zone.`);
      const into = protectedBy(profile, dest, scan.root);
      if (into) return fail(`${into.project} is protected in DINO MEMORY, so nothing moves into it either.`);
      if (!destRoots.some((r) => inside(dest, r))) return fail(`Destination ${dest} is outside the target plan (${destRoots.join(', ')}).`);
      // Where the destination really leads, after symlinks, must also be inside the target plan (F4).
      if (!destRoots.some((r) => inside(realPath(a.dest), realPath(r)))) return fail(`${a.dest} leads outside the target plan through a link.`);
      if (!dirExists(destDir)) return fail(`Destination folder ${destDir} does not exist. Add a "mkdir" action before this one.`);
      if (fileExists(dest) || isRealFile(dest)) return fail(`${dest} already exists; this would overwrite it. Pick another name.`);
      if (src === dest) return fail('Source and destination are the same.');
      files.delete(src);
      files.add(dest);
      for (const [gone, keep] of removed) if (keep === src) removed.set(gone, dest);
      if (zone === 'ask' || profile.zoneFor(dest) === 'ask') needsApproval.push(id);
    } else if (a.op === 'trash_duplicate') {
      if (!fileExists(src)) return fail(`${src} does not exist (or was already moved/removed earlier in this plan).`);
      if (!a.keep || !path.isAbsolute(a.keep)) return fail('"keep" must be the absolute path of the copy that stays.');
      const keep = path.resolve(a.keep);
      if (keep === src) return fail('"keep" and "path" are the same file.');
      if (!fileExists(keep)) return fail(`The kept copy ${keep} would not exist after this plan, so nothing would survive.`);
      if (!sameContent(src, keep)) return fail(`${path.basename(src)} and ${path.basename(keep)} have different contents (SHA-256 differs). They are versions, not duplicates. Do not trash; ask the user instead.`);
      files.delete(src);
      removed.set(src, keep);
      bytesFreed += sizes.get(src) || 0;
      if (zone === 'ask') needsApproval.push(id);
    } else if (a.op === 'delete_rebuildable') {
      if (!inside(src, scan.root)) return fail(`${src} is outside the folder being cleaned.`);
      const proof = rebuildProof(src, { now, named, home, condaExports });
      if (!proof.ok) {
        for (const f of proof.failures) errors.push({ action: id, condition: f.condition, message: `Rebuild proof failed: ${f.message}` });
        return;
      }
      recipes[id] = proof.recipe;
      bytesFreed += measureFreeable(src);
      // Everything inside goes with it, so none of it can count as a surviving copy (F9).
      for (const f of [...files]) if (inside(f, src)) files.delete(f);
      if (zone === 'ask') needsApproval.push(id);
    } else if (a.op === 'clear_cache') {
      // Only the package-manager caches we know re-download on demand; nothing else, wherever it is.
      const known = knownCache;
      if (!known) return fail(`${src} is not a package-manager cache I know is safe to clear.`);
      recipes[id] = known.rebuild;
      bytesFreed += known.bytes;
      if (zone === 'ask') needsApproval.push(id);
    } else if (a.op === 'quarantine') {
      if (!fileExists(src)) return fail(`${src} does not exist.`);
      if (!flagged.has(src)) return fail(`${src} was not flagged by the malware scan. Only scanner-flagged files may be quarantined.`);
      files.delete(src);
    }

    if ((sizes.get(src) || 0) > BIG_FILE && a.op !== 'mkdir') {
      strange.push({ action: id, text: `${path.basename(src)} is over 1 GB. Are you sure it should be ${a.op === 'move' ? 'moved' : 'removed'}?` });
    }
  });

  // Every trashed duplicate must still have a surviving copy at the end of the plan.
  for (const [gone, keep] of removed) {
    if (!files.has(keep)) {
      errors.push({ action: null, message: `After the plan, no copy of ${path.basename(gone)} survives (its kept copy ${keep} was also removed or moved).` });
    }
  }

  // Flagged files the plan ignored are worth a warning, not a failure.
  for (const f of flagged) {
    if (files.has(f)) warnings.push(`Malware scan flagged ${path.basename(f)} but the plan leaves it in place.`);
  }

  return result(errors.length === 0, errors, warnings, needsApproval, strange, bytesFreed, recipes);
}

function result(ok, errors, warnings = [], needsApproval = [], strange = [], bytesFreed = 0, recipes = {}) {
  return { ok, errors, warnings, needsApproval, strange, bytesFreed, recipes };
}

// Older callers may pass a profile without US-04's protections.
function protectedBy(profile, target, root) {
  return typeof profile.protectedBy === 'function' ? profile.protectedBy(target, root) : null;
}

function sameContent(a, b) {
  try {
    return fs.statSync(a).size === fs.statSync(b).size && hashFile(a) === hashFile(b);
  } catch {
    return false;
  }
}

function isRealDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isRealFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

module.exports = { validate, OPS };
