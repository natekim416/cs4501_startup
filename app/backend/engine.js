// Ties the pieces together: scan -> malware check -> plan -> validate -> retry -> ask the user.
const os = require('os');
const path = require('path');
const { scan } = require('./scanner');
const { scanFiles } = require('./malware');
const { validate } = require('./validator');
const { makePlan } = require('./planner');
const { Executor } = require('./executor');
const { Profile } = require('./profile');

const MAX_ATTEMPTS = 3;

class Engine {
  constructor({ dataDir = path.join(os.homedir(), '.cleanasaurus'), apiKey = process.env.ANTHROPIC_API_KEY } = {}) {
    this.profile = new Profile(path.join(dataDir, 'profile.json'));
    this.executor = new Executor(dataDir);
    this.apiKey = apiKey;
    this.folder = null;
    this.snapshot = null;
    this.findings = [];
    this.lastPlan = null;
  }

  get mode() {
    return this.apiKey ? 'llm' : 'demo';
  }

  scanFolder(folder) {
    this.folder = folder;
    this.snapshot = scan(folder);
    const malware = scanFiles(this.snapshot.files);
    this.findings = malware.findings;
    return {
      folder,
      fileCount: this.snapshot.files.length,
      totalBytes: this.snapshot.totalBytes,
      duplicateGroups: this.snapshot.duplicates.length,
      duplicateBytes: this.snapshot.duplicates.reduce((s, g) => s + g.size * (g.files.length - 1), 0),
      malwareEngine: malware.engine,
      findings: this.findings,
      zone: this.profile.zoneFor(folder),
    };
  }

  // Plans, validates, and feeds errors back to the planner until the plan passes or attempts run out.
  async plan(request, onAttempt = () => {}) {
    if (!this.folder) throw new Error('Pick a folder first.');
    this.scanFolder(this.folder);
    const ctx = { scan: this.snapshot, findings: this.findings, profile: this.profile };
    const attempts = [];
    let previous = null;
    let plan;
    let check;

    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
      const made = await makePlan({ request, ...ctx, previous, apiKey: this.apiKey });
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
      questions.unshift({
        text: `I couldn't make every step safe after ${MAX_ATTEMPTS} tries, so I left out ${bad.size || 'some'} action(s). Can you tell me more about what you want?`,
        options: ['Run only the safe part', 'Cancel'],
      });
    }
    for (const s of check.strange) questions.push({ text: s.text, options: ['Yes, go ahead', 'No, leave it'], action: s.action });

    this.lastPlan = { request, plan, check };
    return {
      mode: this.mode,
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
    this.profile.remember(`${question.replace(/\?$/, '')}: ${choice}`);
    const request = this.lastPlan ? this.lastPlan.request : '';
    return this.plan(`${request} (User answered "${question}" with "${choice}")`, onAttempt);
  }

  execute(actionIds) {
    if (!this.lastPlan) throw new Error('No plan to run.');
    const chosen = this.lastPlan.plan.actions.filter((a) => actionIds.includes(a.id));
    // Re-check the exact subset the user approved, since unchecking a mkdir can break a later move.
    const check = validate({ actions: chosen }, { scan: scan(this.folder), findings: this.findings, profile: this.profile });
    if (!check.ok) return { ok: false, errors: check.errors.map((e) => e.message) };
    const run = this.executor.run(chosen);
    this.lastPlan = null;
    return { ok: true, ...run, bytesFreed: check.bytesFreed };
  }

  undo() {
    return this.executor.undoLast();
  }
}

module.exports = { Engine };
