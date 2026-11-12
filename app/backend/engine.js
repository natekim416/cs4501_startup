// Ties the pieces together: scan -> malware check -> plan -> validate -> retry -> ask the user.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { scan } = require('./scanner');
const { findArtifacts, lastChanged, labelPath, toolCaches, exportCondaEnv, INACTIVE_DAYS } = require('./devclutter');
const { listTrash } = require('./trash');
const { xcodeItems, xcrunFor } = require('./ecosystems/xcode');
const { matchProjects, matchProtect } = require('./intent');
const { summarize } = require('./summary');
const { rebuild } = require('./rebuild');
const { breakdown } = require('./breakdown');
const { scanFiles } = require('./malware');
const { validate } = require('./validator');
const { makePlan } = require('./planner');
const { Executor } = require('./executor');
const { Profile, protectName } = require('./profile');
const { UsageLog } = require('./usage-log');

const MAX_ATTEMPTS = 3;
const OPS = ['mkdir', 'move', 'rename', 'trash_duplicate', 'quarantine', 'delete_rebuildable', 'clear_cache', 'remove_simulator'];
const ESTIMATE_GAP = 0.1;

// "a", "a and b", "a, b and c"
const listWords = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

// Free space on the disk that holds p, measured by the OS.
function diskFreeBytes(p) {
  const s = fs.statfsSync(p);
  return s.bavail * s.bsize;
}

// Decimal units, matching macOS and the UI.
function formatBytes(n) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1000 && i < units.length - 1) {
    n /= 1000;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
}

function countOps(actions) {
  return Object.fromEntries(OPS.map((op) => [`ops_${op}`, actions.filter((a) => a.op === op).length]));
}

// Red-team F13: a model that never answers can't leave the app stuck on "Planning...".
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Claude didn't answer within ${Math.round(ms / 1000)} seconds. Try again, or ask for something smaller.`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

class Engine {
  constructor({ dataDir = path.join(os.homedir(), '.cleanasaurus'), apiKey = process.env.ANTHROPIC_API_KEY, diskFree = diskFreeBytes, llmClient = null, home = os.homedir(), condaRun, trashDir = null, xcodeRun = null , planTimeoutMs = 90000 } = {}) {
    this.planTimeoutMs = planTimeoutMs;
    this.llmClient = llmClient;
    this.dataDir = dataDir;
    this.home = home;
    this.condaRun = condaRun;
    // US-08: runs `xcrun simctl` to list and remove simulators. Tests pass a fake.
    this.xcodeRun = xcodeRun || xcrunFor(home);
    this.xcode = [];
    this.caches = [];
    this.condaExports = {};
    this.diskFree = diskFree;
    this.profile = new Profile(path.join(dataDir, 'profile.json'));
    this.trashDir = trashDir;
    this.trashItems = [];
    this.executor = new Executor(dataDir, { trashDir, xcrun: this.xcodeRun });
    this.binName = trashDir ? 'the Trash' : 'the Dino Bin';
    this.usage = new UsageLog(path.join(dataDir, 'usage-log.jsonl'), this.profile);
    this.practiceFolders = new Set();
    this.apiKey = apiKey;
    this.folder = null;
    this.snapshot = null;
    this.dev = [];
    this.findings = [];
    this.lastPlan = null;
    this.planCount = 0;
  }

  get mode() {
    return this.apiKey || this.llmClient ? 'llm' : 'demo';
  }

  // Practice runs (the guided demo, --demo-folder) aren't real use, so they stay out of the usage log.
  track(event, fields) {
    if (!this.practiceFolders.has(this.folder)) this.usage.record(event, { mode: this.mode, ...fields });
  }

  // The user picked or rescanned a folder. plan() also rescans, so only this counts as a scan in the log.
  openFolder(folder) {
    const info = this.scanFolder(folder);
    this.track('scan', {
      files: info.fileCount,
      bytes: info.totalBytes,
      duplicateGroups: info.duplicateGroups,
      duplicateBytes: info.duplicateBytes,
      flagged: info.findings.length,
      zone: info.zone,
    });
    return info;
  }

  scanFolder(folder) {
    this.folder = folder;
    this.snapshot = scan(folder);
    this.dev = findArtifacts(folder);
    this.caches = toolCaches(this.home);
    this.xcode = this.findXcode();
    this.trashItems = listTrash(this.trashDir);
    this.exportCondaEnvs();
    const malware = scanFiles(this.snapshot.files);
    this.unknownApps = malware.findings.filter((f) => f.quarantine === false);
    this.findings = malware.findings.filter((f) => f.quarantine !== false);
    const rebuildable = this.dev.filter((d) => d.label === 'rebuildable');
    return {
      rebuildableCount: rebuildable.length,
      rebuildableBytes: rebuildable.reduce((s, d) => s + d.bytes, 0),
      folder,
      fileCount: this.snapshot.files.length,
      totalBytes: this.snapshot.totalBytes,
      duplicateGroups: this.snapshot.duplicates.length,
      duplicateBytes: this.snapshot.duplicates.reduce((s, g) => s + g.size * (g.files.length - 1), 0),
      malwareEngine: malware.engine,
      findings: this.findings,
      unknownApps: this.unknownApps.map((f) => ({ name: f.name, label: f.label })),
      zone: this.profile.zoneFor(folder),
      zoneReason: this.profile.zoneInfo(folder).reason,
    };
  }

  // US-07: an inactive conda environment with no environment.yml is exported first, so the export can be
  // its rebuild recipe. Skipped quietly if conda isn't installed.
  exportCondaEnvs() {
    for (const d of this.dev) {
      if (d.type !== 'conda-env' || d.label === 'rebuildable') continue;
      if (Date.now() - lastChanged(d.project) < INACTIVE_DAYS * 864e5) continue;
      try {
        const recipe = this.condaExports[d.path] ? null : exportCondaEnv(d.path, { dataDir: this.dataDir, ...(this.condaRun && { run: this.condaRun }) });
        if (recipe) this.condaExports[d.path] = recipe.lockfile;
      } catch {
        continue;
      }
      const label = labelPath(d.path, { condaExports: this.condaExports });
      Object.assign(d, { label: label.label, reason: label.reason, rebuild: label.rebuild || null });
    }
  }

  // Plans, validates, and feeds errors back to the planner until the plan passes or attempts run out.
  async plan(request, onAttempt = () => {}) {
    if (!this.folder) throw new Error('Pick a folder first.');
    const started = Date.now();
    this.lastPlan = null;
    if (this.profile.zoneFor(this.folder) === 'never') {
      this.track('plan', { refused: true, zone: 'never' });
      return this.emptyResult(`This folder is in a NEVER zone (${this.profile.zoneInfo(this.folder).reason}), so I won't touch anything in it.`);
    }
    this.scanFolder(this.folder);
    // US-01: "where did my space go?" is a question, not a cleanup. Measure and answer; change nothing.
    if (/where.*(space|storage)|what.*taking.*(space|room)|breakdown/i.test(request)) return this.answerBreakdown();
    // Projects the request names. Only these may skip the 30-day rule, and plain code decides it, not the LLM.
    // The scanned folder itself isn't a project (a VM bundle at the top level would otherwise make it one).
    const projectNames = [...new Set(this.dev.filter((d) => d.project !== this.folder).map((d) => path.basename(d.project)))];
    // US-04: "always keep …" is saved before anything is planned. If that's all the request says, stop
    // there; if it also asks for a cleanup, plan the rest with the new protection already in place.
    const protect = matchProtect(request, this.protectableNames());
    let saved = null;
    if (protect) {
      if (!protect.names.length) return this.askWhatToProtect();
      saved = this.protect(protect.names);
      if (!protect.cleanup) return this.emptyResult(saved.summary, { memoryChanged: true });
      request = protect.rest;
    }
    // Protected folders are left out before planning (the validator also rejects them) and listed in the reply.
    const dev = this.dev.filter((d) => !this.profile.protectedBy(d.path, this.folder));
    const protectedNames = this.protectedHere();
    const intent = this.pendingProjects ? { matched: this.pendingProjects, kept: [], ambiguous: null, isIntent: true } : matchProjects(request, projectNames);
    this.pendingProjects = null;
    const ctx = { scan: this.snapshot, dev, caches: this.caches, findings: this.findings, profile: this.profile, named: intent.matched, intent, home: this.home, condaExports: this.condaExports, trashDir: this.trashDir, trashItems: this.trashItems, xcode: this.xcode };
    const attempts = [];
    let previous = null;
    let plan;
    let check;

    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
      const made = await withTimeout(makePlan({ request, ...ctx, previous, apiKey: this.apiKey, client: this.llmClient || undefined }), this.planTimeoutMs);
      // Red-team F11: whatever comes back, the rest of the app only ever sees a plan-shaped object.
      plan = made.plan && typeof made.plan === 'object' ? made.plan : { summary: '', actions: null, questions: [] };
      check = validate(plan, ctx);
      const attempt = { attempt: i, ok: check.ok, errors: check.errors.map((e) => e.message) };
      attempts.push(attempt);
      onAttempt(attempt);
      if (check.ok) break;
      previous = { plan, errors: check.errors };
    }

    const questions = Array.isArray(plan.questions)
      ? plan.questions.filter((q) => q && typeof q.text === 'string' && Array.isArray(q.options)).map((q) => ({ text: q.text, options: q.options.filter((o) => typeof o === 'string') }))
      : [];
    if (!check.ok) {
      // Still failing after the retries: keep only the actions that pass on their own, and ask.
      const bad = new Set(check.errors.map((e) => e.action).filter(Boolean));
      const actions = Array.isArray(plan.actions) ? plan.actions.filter((a) => a && typeof a === 'object' && !bad.has(a.id)) : [];
      plan = { ...plan, actions };
      check = validate(plan, ctx);
      if (!check.ok) plan = { ...plan, actions: [] };
      questions.unshift(
        plan.actions.length
          ? {
              text: `I couldn't make every step safe after ${MAX_ATTEMPTS} tries, so I left out ${bad.size || 'some'} action(s). The safe part is in the plan above.`,
              options: ['Run only the safe part', 'Cancel'],
            }
          : {
              text: `I couldn't make a safe plan after ${MAX_ATTEMPTS} tries, so I'm not proposing anything. Check the Safety Log for why, then try rewording your request.`,
              options: ['OK'],
            },
      );
    }
    for (const s of check.strange) questions.push({ text: s.text, options: ['Yes, go ahead', 'No, leave it'], action: s.action });

    // Nothing safe to do: say why (the checker's reasons, or why a named project has nothing rebuildable),
    // so the user isn't left with an empty reply and nothing to approve.
    if (!(plan.actions || []).length && !questions.length) {
      const why = [...new Set(attempts.flatMap((a) => a.errors))];
      for (const name of intent.matched) {
        const items = this.dev.filter((d) => path.basename(d.project) === name);
        if (!items.some((d) => d.label === 'rebuildable')) why.push(...items.map((d) => `${name}: ${d.reason}`));
      }
      if (why.length) plan = { ...plan, summary: `I couldn't find anything safe to change, so there's nothing to approve:\n- ${why.join('\n- ')}` };
    }

    // A project the user named but touched recently is allowed, and shown unchecked so they decide.
    for (const a of plan.actions || []) {
      // US-30: permanent deletes start unchecked; the user opts in and confirms.
      if (a.op === 'delete_from_trash') Object.assign(a, { checked: false, note: 'Permanent: this deletes it from the Trash for good and cannot be undone.' });
      // Xcode's own build data has its own 30-day rule (US-08); its parent folder isn't a project.
      if (a.op !== 'delete_rebuildable' || this.xcode.some((x) => x.path === a.path)) continue;
      const days = Math.floor((Date.now() - lastChanged(path.dirname(a.path))) / 864e5);
      if (days < INACTIVE_DAYS) Object.assign(a, { checked: false, note: `${path.basename(path.dirname(a.path))} is still active (changed ${days} day${days === 1 ? '' : 's'} ago). Check it only if you're sure.` });
    }

    const planId = ++this.planCount;
    this.lastPlan = { id: planId, request, plan, check, named: ctx.named };
    this.track('plan', {
      zone: this.profile.zoneFor(this.folder),
      tries: attempts.length,
      passed: attempts.at(-1).ok,
      validatorErrors: attempts.reduce((n, a) => n + a.errors.length, 0),
      actions: (plan.actions || []).length,
      needsApproval: check.needsApproval.length,
      questions: questions.length,
      bytesToBin: check.bytesFreed,
      ms: Date.now() - started,
      ...countOps(plan.actions || []),
    });
    const sizes = new Map([...this.snapshot.files.map((f) => [f.path, f.size]), ...this.dev.map((d) => [d.path, d.bytes]), ...this.xcode.map((x) => [x.path, x.bytes]), ...this.trashItems.map((t) => [t.path, t.bytes])]);
    const dayAgo = Date.now() - 864e5;
    const recentlyOpened = (plan.actions || []).map((a) => a.path).filter((p) => {
      try {
        const st = fs.statSync(p);
        return Math.max(st.atimeMs, st.mtimeMs) > dayAgo && st.isFile();
      } catch {
        return false;
      }
    });
    const oneLine = summarize({ folder: this.folder, actions: (plan.actions || []).map((a) => ({ ...a, bytes: sizes.get(a.path) })) }, { recentlyOpened });
    const leftOut = protectedNames.length ? `Protected in DINO MEMORY, so I left out ${listWords(protectedNames)}.` : null;
    return {
      mode: this.mode,
      planId,
      oneLine,
      summary: [saved && saved.summary, plan.summary, leftOut].filter(Boolean).join('\n'),
      actions: plan.actions || [],
      questions,
      attempts,
      bytesFreed: check.bytesFreed,
      needsApproval: check.needsApproval,
      warnings: check.warnings,
      protected: protectedNames,
      memoryChanged: Boolean(saved),
    };
  }

  // US-08: Xcode build data and simulators unused long enough to offer. Run again at approval, so a
  // project rebuilt or a simulator booted since the plan was made is refused.
  findXcode() {
    return xcodeItems({ home: this.home, run: this.xcodeRun });
  }

  // A reply with nothing to approve.
  emptyResult(summary, extra = {}) {
    return { mode: this.mode, planId: null, summary, actions: [], questions: [], attempts: [], bytesFreed: 0, needsApproval: [], warnings: [], protected: [], ...extra };
  }

  // US-04: saves folders to always keep. Every name is checked before any is saved.
  protect(names) {
    const list = [...new Set((Array.isArray(names) ? names : [names]).map(protectName))];
    if (!list.length) throw new Error('Pick at least one project to keep.');
    for (const name of list) this.profile.protect(name);
    const them = list.length === 1 ? 'it' : 'them';
    return { saved: list, summary: `Got it. I'll always keep ${listWords(list)}. Every plan from now on leaves ${them} out, until you remove ${them} under DINO MEMORY.` };
  }

  // US-04: "keep anything on my resume" names no folder, so ask which ones instead of guessing.
  askWhatToProtect() {
    const options = this.protectableNames();
    if (!options.length) return this.emptyResult("I didn't find any projects or folders here to keep.");
    return this.emptyResult(null, { questions: [{ text: "Which projects should I always keep? I can't tell from your message, so check them and press SAVE.", options, pick: 'protect' }] });
  }

  // Folders a request can protect by name: code projects, plus the top-level folders of the scan.
  protectableNames() {
    const projects = this.dev.filter((d) => d.project !== this.folder).map((d) => path.basename(d.project));
    const top = this.snapshot.dirs.filter((d) => !d.includes(path.sep) && !d.startsWith('.'));
    return [...new Set([...projects, ...top])].sort();
  }

  // Folders in this scan that a saved protection names, for "I left out …".
  protectedHere() {
    const dirs = [this.folder, ...this.dev.map((d) => d.project), ...this.snapshot.dirs.map((d) => path.join(this.folder, d))];
    return [...new Set(dirs.map((d) => path.basename(d)).filter((name) => this.profile.protectedPattern(name)))].sort();
  }

  // Saves the answer to the profile so the same question isn't asked twice, then re-plans.
  async answer(question, choice, onAttempt) {
    this.track('question_answered');
    // Picking a project from "Which projects do you mean?" names exactly that project; re-parsing the
    // combined text would let a course code widen it to the project's siblings.
    if (/which projects/i.test(question)) {
      this.pendingProjects = [choice];
      const request = this.lastPlan ? this.lastPlan.request : '';
      return this.plan(`${request} (User picked ${choice})`, onAttempt);
    }
    this.profile.remember(`${question.replace(/\?$/, '')}: ${choice}`);
    const request = this.lastPlan ? this.lastPlan.request : '';
    return this.plan(`${request} (User answered "${question}" with "${choice}")`, onAttempt);
  }

  execute(planId, actionIds, { confirmPermanent = false } = {}) {
    // Only a list of exact ids: a string would match ids by substring (red-team note).
    if (!Array.isArray(actionIds) || !actionIds.every((x) => typeof x === 'string')) return { ok: false, errors: ['Pick actions from the plan.'] };
    // Only the newest plan can run: older cards may point at files that have since changed.
    if (!this.lastPlan || this.lastPlan.id !== planId) {
      return { ok: false, errors: ['This plan is out of date. Ask me again and approve the newest plan.'] };
    }
    const all = this.lastPlan.plan.actions;
    const picked = all.filter((a) => actionIds.includes(a.id));
    // A new folder exists to hold files. If none of the files headed into it were checked (moves in an
    // ASK zone start unchecked), skip it instead of leaving an empty folder behind.
    const into = (a) => (a.op === 'move' ? path.resolve(a.dest) : a.op === 'rename' ? path.dirname(path.resolve(a.dest)) : null);
    const filesInto = (dir, list) => list.some((a) => into(a) && (into(a) === dir || into(a).startsWith(dir + path.sep)));
    const chosen = picked.filter((a) => a.op !== 'mkdir' || !filesInto(path.resolve(a.path), all) || filesInto(path.resolve(a.path), picked));
    const skippedFolders = picked.length - chosen.length;
    const uncheckedMoves = all.filter((a) => (a.op === 'move' || a.op === 'rename') && !actionIds.includes(a.id)).length;
    // US-30: nothing is permanently deleted unless the user confirmed it in a separate step.
    if (chosen.some((a) => a.op === 'delete_from_trash') && !confirmPermanent) {
      return { ok: false, errors: ['Permanently deleting from the Trash needs your confirmation first.'] };
    }
    // Re-check the exact subset the user approved, since unchecking a mkdir can break a later move.
    const check = validate({ actions: chosen }, { scan: scan(this.folder), findings: this.findings, profile: this.profile, home: this.home, condaExports: this.condaExports, named: this.lastPlan.named, trashDir: this.trashDir, xcode: this.findXcode() });
    if (!check.ok) {
      this.track('run_blocked', { errors: check.errors.length });
      return { ok: false, errors: check.errors.map((e) => e.message) };
    }
    // Rebuildable folders carry the recipe the validator proved, so the executor can log how to rebuild them.
    const toRun = chosen.map((a) => (check.recipes[a.id] ? { ...a, recipe: check.recipes[a.id] } : a));
    const freeBefore = this.diskFree(this.folder);
    const run = this.executor.run(toRun);
    const measuredFreed = Math.max(0, this.diskFree(this.folder) - freeBefore);
    const ran = run.results.filter((r) => r.ok).length;
    this.track('run', {
      proposed: this.lastPlan.plan.actions.length,
      approved: chosen.length,
      ran,
      failed: chosen.length - ran,
      steps: run.steps,
      bytesToBin: check.bytesFreed,
      measuredFreed,
      ...countOps(chosen),
    });
    this.lastPlan = null;
    const report = this.freedReport(chosen, check.bytesFreed, measuredFreed);
    if (uncheckedMoves && skippedFolders) {
      const zone = this.profile.zoneFor(this.folder) === 'ask' ? " They're marked ASK FIRST because this folder is an ASK zone." : '';
      const moved = `${uncheckedMoves} move${uncheckedMoves === 1 ? '' : 's'} weren't checked, so those files stayed put and I didn't create their ${skippedFolders === 1 ? 'folder' : `${skippedFolders} folders`}.${zone} Check them and approve again to move them.`;
      report.freedNote = [report.freedNote, moved].filter(Boolean).join(' ');
    }
    return { ok: true, ...run, ...report };
  }

  // US-12: FREED is the measured change on disk. Binned files free space only when the bin is emptied,
  // and a big gap between the estimate and the measurement is shown rather than hidden.
  freedReport(actions, estimatedFreed, measuredFreed) {
    const sizes = new Map(this.snapshot.files.map((f) => [f.path, f.size]));
    const binned = actions.filter((a) => a.op === 'trash_duplicate').reduce((n, a) => n + (sizes.get(a.path) || 0), 0);
    const deletedEstimate = Math.max(0, estimatedFreed - binned);
    const showBoth = deletedEstimate > 0 && Math.abs(measuredFreed - deletedEstimate) / deletedEstimate > ESTIMATE_GAP;
    const notes = [];
    if (showBoth) notes.push(`Measured ${formatBytes(measuredFreed)} freed on disk (estimated ${formatBytes(deletedEstimate)}).`);
    if (binned) notes.push(`${formatBytes(binned)} moved to ${this.binName} frees up when you empty it.`);
    return { bytesFreed: measuredFreed, measuredFreed, estimatedFreed, binnedBytes: binned, showBoth, freedNote: notes.join(' ') };
  }

  answerBreakdown() {
    const b = breakdown(this.folder);
    const names = { javascript: 'JavaScript packages', python: 'Python environments', xcode: 'Xcode build data', docker: 'Docker', ml: 'ML model caches' };
    const types = Object.entries(b.byType).map(([k, v]) => `${names[k]}: ${formatBytes(v)}`).join('\n');
    const top = b.topProjects.map((p, i) => `${i + 1}. ${path.basename(p.path)}: ${formatBytes(p.bytes)}`).join('\n');
    const blocked = b.unreadable.map((u) => `${u.path}: ${u.howToFix}`).join('\n');
    const summary = `Here's where your space went. Nothing has changed yet.\n${types}\nLargest projects:\n${top}${blocked ? `\nI couldn't read:\n${blocked}` : ''}`;
    this.track('breakdown', { projects: b.topProjects.length, unreadable: b.unreadable.length });
    return { mode: this.mode, planId: null, summary, breakdown: b, actions: [], questions: [], attempts: [], bytesFreed: 0, needsApproval: [], warnings: [] };
  }

  // US-15: rebuild something we deleted, from the recipe the proof saved. Logged as a count, never a path.
  // The page names a deleted folder's recipe; the command that runs always comes from our own record (F1).
  rebuild(request, { run } = {}) {
    const recorded = this.executor.recordedRecipe(request);
    if (!recorded) return { ok: false, message: 'I can only rebuild a folder I deleted myself, using the command I saved when I deleted it.' };
    return rebuild(recorded, { ...(run && { run }), record: ({ event, ok, ms }) => this.track(event, { ok, ms }) });
  }

  undoAction(batchId, actionId) {
    const result = this.executor.undoAction(batchId, actionId);
    this.track('undo_one', { undone: result.undone });
    return result;
  }

  undo() {
    const result = this.executor.undoLast();
    this.track('undo', { undone: result.undone, needsRebuild: result.needsRebuild.length });
    return result;
  }
}

module.exports = { Engine };
