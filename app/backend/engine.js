// Ties the pieces together: scan -> malware check -> plan -> validate -> retry -> ask the user.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { scan } = require('./scanner');
const { findArtifacts } = require('./devclutter');
const { scanFiles } = require('./malware');
const { validate } = require('./validator');
const { makePlan } = require('./planner');
const { Executor } = require('./executor');
const { Profile } = require('./profile');
const { UsageLog } = require('./usage-log');

const MAX_ATTEMPTS = 3;
const OPS = ['mkdir', 'move', 'rename', 'trash_duplicate', 'quarantine', 'delete_rebuildable'];
const ESTIMATE_GAP = 0.1;

// Free space on the disk that holds p, measured by the OS.
function diskFreeBytes(p) {
  const s = fs.statfsSync(p);
  return s.bavail * s.bsize;
}

function formatBytes(n) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
}

function countOps(actions) {
  return Object.fromEntries(OPS.map((op) => [`ops_${op}`, actions.filter((a) => a.op === op).length]));
}

class Engine {
  constructor({ dataDir = path.join(os.homedir(), '.cleanasaurus'), apiKey = process.env.ANTHROPIC_API_KEY, diskFree = diskFreeBytes, llmClient = null } = {}) {
    this.llmClient = llmClient;
    this.diskFree = diskFree;
    this.profile = new Profile(path.join(dataDir, 'profile.json'));
    this.executor = new Executor(dataDir);
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
    const malware = scanFiles(this.snapshot.files);
    this.findings = malware.findings;
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
      zone: this.profile.zoneFor(folder),
      zoneReason: this.profile.zoneInfo(folder).reason,
    };
  }

  // Plans, validates, and feeds errors back to the planner until the plan passes or attempts run out.
  async plan(request, onAttempt = () => {}) {
    if (!this.folder) throw new Error('Pick a folder first.');
    const started = Date.now();
    this.lastPlan = null;
    if (this.profile.zoneFor(this.folder) === 'never') {
      this.track('plan', { refused: true, zone: 'never' });
      return {
        mode: this.mode,
        planId: null,
        summary: `This folder is in a NEVER zone (${this.profile.zoneInfo(this.folder).reason}), so I won't touch anything in it.`,
        actions: [],
        questions: [],
        attempts: [],
        bytesFreed: 0,
        needsApproval: [],
        warnings: [],
      };
    }
    this.scanFolder(this.folder);
    const ctx = { scan: this.snapshot, dev: this.dev, findings: this.findings, profile: this.profile };
    const attempts = [];
    let previous = null;
    let plan;
    let check;

    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
      const made = await makePlan({ request, ...ctx, previous, apiKey: this.apiKey, client: this.llmClient || undefined });
      plan = made.plan;
      check = validate(plan, ctx);
      const attempt = { attempt: i, ok: check.ok, errors: check.errors.map((e) => e.message) };
      attempts.push(attempt);
      onAttempt(attempt);
      if (check.ok) break;
      previous = { plan, errors: check.errors };
    }

    const questions = [...(plan.questions || [])];
    if (!check.ok) {
      // Still failing after the retries: keep only the actions that pass on their own, and ask.
      const bad = new Set(check.errors.map((e) => e.action).filter(Boolean));
      const actions = Array.isArray(plan.actions) ? plan.actions.filter((a) => !bad.has(a.id)) : [];
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

    const planId = ++this.planCount;
    this.lastPlan = { id: planId, request, plan, check };
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
    return {
      mode: this.mode,
      planId,
      summary: plan.summary,
      actions: plan.actions || [],
      questions,
      attempts,
      bytesFreed: check.bytesFreed,
      needsApproval: check.needsApproval,
      warnings: check.warnings,
    };
  }

  // Saves the answer to the profile so the same question isn't asked twice, then re-plans.
  async answer(question, choice, onAttempt) {
    this.track('question_answered');
    this.profile.remember(`${question.replace(/\?$/, '')}: ${choice}`);
    const request = this.lastPlan ? this.lastPlan.request : '';
    return this.plan(`${request} (User answered "${question}" with "${choice}")`, onAttempt);
  }

  execute(planId, actionIds) {
    // Only the newest plan can run: older cards may point at files that have since changed.
    if (!this.lastPlan || this.lastPlan.id !== planId) {
      return { ok: false, errors: ['This plan is out of date. Ask me again and approve the newest plan.'] };
    }
    const chosen = this.lastPlan.plan.actions.filter((a) => actionIds.includes(a.id));
    // Re-check the exact subset the user approved, since unchecking a mkdir can break a later move.
    const check = validate({ actions: chosen }, { scan: scan(this.folder), findings: this.findings, profile: this.profile });
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
    return { ok: true, ...run, ...this.freedReport(chosen, check.bytesFreed, measuredFreed) };
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
    if (binned) notes.push(`${formatBytes(binned)} moved to the Dino Bin frees up when you empty it.`);
    return { bytesFreed: measuredFreed, measuredFreed, estimatedFreed, binnedBytes: binned, showBoth, freedNote: notes.join(' ') };
  }

  undo() {
    const result = this.executor.undoLast();
    this.track('undo', { undone: result.undone, needsRebuild: result.needsRebuild.length });
    return result;
  }
}

module.exports = { Engine };
