// The guardrail: every plan the LLM writes goes through here before the user sees it.
// It checks the plan against the real file system, the permission zones, the target plan,
// duplicate hashes, and malware findings, then dry-runs it on a virtual copy of the folder.
const fs = require('fs');
const path = require('path');
const { hashFile } = require('./scanner');

const OPS = new Set(['mkdir', 'move', 'rename', 'trash_duplicate', 'quarantine']);
const BIG_FILE = 1024 ** 3;
const MAX_ACTIONS = 500;

function inside(child, root) {
  const c = path.resolve(child);
  const r = path.resolve(root);
  return c === r || c.startsWith(r + path.sep);
}

function validate(plan, { scan, findings, profile }) {
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
  let bytesFreed = 0;

  plan.actions.forEach((a, i) => {
    const id = a && a.id ? a.id : `#${i + 1}`;
    const fail = (message) => errors.push({ action: id, message });

    if (!a || !OPS.has(a.op)) return fail(`Unknown op "${a && a.op}". Allowed: ${[...OPS].join(', ')}.`);
    if (!a.path || !path.isAbsolute(a.path)) return fail('"path" must be an absolute path.');
    if (!a.reason) return fail('Every action needs a "reason" the user can read.');

    const src = path.resolve(a.path);
    const zone = profile.zoneFor(src);
    if (zone === 'never') return fail(`${src} is in a NEVER-touch zone. Remove this action.`);

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
      if (!destRoots.some((r) => inside(dest, r))) return fail(`Destination ${dest} is outside the target plan (${destRoots.join(', ')}).`);
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

  return result(errors.length === 0, errors, warnings, needsApproval, strange, bytesFreed);
}

function result(ok, errors, warnings = [], needsApproval = [], strange = [], bytesFreed = 0) {
  return { ok, errors, warnings, needsApproval, strange, bytesFreed };
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
