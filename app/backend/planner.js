// Turns a plain-English request into a structured action plan.
// With an Anthropic API key it asks Claude; without one it falls back to an offline
// rule-based planner so the app can still be demoed (shown as DEMO MODE in the UI).
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { projectInfo } = require('./devclutter');
const { courseCodes } = require('./intent');

const MODEL = 'claude-opus-5-5';
const MAX_FILES_IN_PROMPT = 400;

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'actions', 'questions'],
  properties: {
    summary: { type: 'string' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'op', 'path', 'dest', 'keep', 'reason'],
        properties: {
          id: { type: 'string' },
          op: { type: 'string', enum: ['mkdir', 'move', 'rename', 'trash_duplicate', 'quarantine', 'delete_rebuildable', 'clear_cache', 'delete_from_trash', 'remove_simulator'] },
          path: { type: 'string' },
          dest: { type: 'string' },
          keep: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'options'],
        properties: {
          text: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

const SYSTEM = `You are Cleanasaurus, a careful file-organizing assistant that runs on the user's own computer.
You turn the user's request into a plan of file actions. You never touch files yourself: a validator checks your plan, then the user approves it.

Actions (all paths absolute; use "" for fields an op does not use):
- mkdir: create folder "path".
- move: move file "path" into existing folder "dest" (create it with an earlier mkdir if needed).
- rename: rename file "path" to the full new path "dest".
- trash_duplicate: remove "path" because it is byte-identical to "keep". Only use for files listed in the same duplicate group.
- quarantine: isolate "path". Only for files listed in malware_findings.
- clear_cache: empty the package-manager cache folder "path". Only for paths listed in package_caches, and only if the user asks about caches or wants as much space as possible.
- delete_from_trash: permanently delete "path", an item already in the user's Trash. Only for paths listed in trash_items, and only when the user asks to empty the Trash or permanently delete trashed files. It can't be undone; the user must confirm it separately.
- delete_rebuildable: permanently delete the folder "path" because it can be rebuilt. Only for items listed in rebuildable_items, or Xcode DerivedData folders listed in xcode_items. The validator re-checks the rebuild proof (gitignored, lockfile present, no secrets, project unchanged for 30 days, no uncommitted work) and rejects anything it can't prove.
- remove_simulator: remove the simulator runtime "path" (an id like simulator:com.apple.CoreSimulator.SimRuntime.iOS-16-0) and its devices. Only for simulator runtimes listed in xcode_items, and only if the user asks about Xcode or simulators, or wants as much space as possible.

Rules:
- Every action needs a short, plain-English "reason".
- Only put new folders and moved files inside the allowed destination roots.
- Never act on files in "never" zones. Files in "ask" zones are allowed but the user will be asked.
- ~/Library is a never zone. The only exceptions are the exact paths in xcode_items; never anything else there, and never Xcode Archives.
- Follow the user's saved preferences.
- Never propose any action inside a folder listed in protected_projects (names, or patterns like capstone-*). The user asked to always keep them, and the validator will reject it.
- Don't propose deleting anything in a project with uncommitted: true or last_changed_days under 30 unless the user named that project; the validator will reject it anyway.
- If the user says which classes or projects they're done with, delete only artifacts from those projects (use the "projects" list; course codes like "CS 3140" match folder names like cs3140-hw1). Put the project name at the start of each reason. If you can't tell which projects they mean, ask with the candidate projects as options instead of guessing.
- If something is ambiguous or unusual (files that look like versions of each other, a request that could mean two things), do not guess: add a question with 2-4 short options and leave those files alone.
- If you receive validator errors, fix exactly those problems and return the full corrected plan.`;

// Course code, age, and uncommitted work for a project, so Claude can match "done with CS 3140"
// and avoid proposing work in progress. The validator still checks all of it independently.
function describeProject(project) {
  const info = projectInfo(project);
  const code = courseCodes(path.basename(project))[0];
  return { course: code ? `${code.replace(/\d+$/, '').toUpperCase()} ${code.match(/\d+$/)[0]}` : null, last_changed_days: info.lastChangedDays, uncommitted: info.uncommitted };
}

function summarizeScan(scan, findings, profile, dev = [], caches = [], trashItems = [], xcode = []) {
  const dupIndex = new Map();
  scan.duplicates.forEach((g, i) => g.files.forEach((f) => dupIndex.set(f, i + 1)));
  const files = scan.files.slice(0, MAX_FILES_IN_PROMPT).map((f) => ({
    path: f.path,
    size: f.size,
    modified: f.modified.slice(0, 10),
    duplicate_group: dupIndex.get(f.path) || null,
  }));
  return {
    folder: scan.root,
    existing_subfolders: scan.dirs.map((d) => path.join(scan.root, d)),
    files,
    files_omitted: Math.max(0, scan.files.length - MAX_FILES_IN_PROMPT),
    duplicate_groups: scan.duplicates.map((g, i) => ({ group: i + 1, files: g.files })),
    malware_findings: findings.map((f) => ({ path: f.path, evidence: f.evidence })),
    rebuildable_items: dev.filter((d) => d.label === 'rebuildable').map((d) => ({ path: d.path, project: path.basename(d.project), bytes: d.bytes, how: d.reason, ...describeProject(d.project) })),
    projects: [...new Set(dev.map((d) => d.project))].map((p) => ({ name: path.basename(p), ...describeProject(p) })),
    package_caches: caches.map((c) => ({ path: c.path, bytes: c.bytes, how: c.reason })),
    trash_items: trashItems.slice(0, MAX_FILES_IN_PROMPT).map((t) => ({ path: t.path, bytes: t.bytes })),
    xcode_items: xcode.map((x) => ({ path: x.path, kind: x.type === 'simulator' ? 'simulator runtime' : 'Xcode DerivedData', bytes: x.bytes, how: x.reason })),
    zones: profile.data.zones,
    allowed_destination_roots: profile.data.targetPlan.destRoots.length ? profile.data.targetPlan.destRoots : [scan.root],
    target_plan_notes: profile.data.targetPlan.notes,
    saved_preferences: profile.data.preferences,
    protected_projects: profile.data.protected || [],
  };
}

async function llmPlan({ request, scan, dev, caches, trashItems = [], xcode = [], findings, profile, previous, apiKey, client = new Anthropic({ apiKey, timeout: 60000, maxRetries: 1 }) }) {
  let content = `User request: ${request}\n\nFolder snapshot (file names and metadata only):\n${JSON.stringify(summarizeScan(scan, findings, profile, dev, caches, trashItems, xcode))}`;
  if (previous) {
    content += `\n\nYour previous plan FAILED validation:\n${previous.errors.map((e) => `- ${e.action ? `[${e.action}] ` : ''}${e.message}`).join('\n')}\n\nPrevious plan:\n${JSON.stringify(previous.plan)}\n\nReturn a corrected full plan.`;
  }
  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: PLAN_SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content }],
    });
  } catch (err) {
    throw new Error(friendlyApiError(err));
  }
  if (response.stop_reason === 'refusal') throw new Error('The model declined this request.');
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    return JSON.parse(text);
  } catch {
    // Unparseable output becomes a validation error so the retry loop can fix it.
    return { summary: '', actions: null, questions: [] };
  }
}

// Red-team F13: what the user sees when Claude can't be reached. Never the raw response, which can
// carry request ids and internal error JSON.
function friendlyApiError(err) {
  const status = err && err.status;
  const code = err && (err.code || (err.cause && err.cause.code));
  if (status === 429) return 'Claude is busy right now (too many requests). Try again in a minute.';
  if (status === 401 || status === 403) return "Claude didn't accept the API key. Check the key in the .env file.";
  if (status >= 500 || status === 529) return 'Claude is having trouble right now. Try again in a few minutes.';
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN/.test(String(code)) || /timed? ?out|network|fetch failed/i.test(String(err && err.message))) {
    return "I couldn't reach Claude. Check your internet connection and try again.";
  }
  return `Claude returned an error${status ? ` (${status})` : ''}. Try again.`;
}

// ---------- Offline demo planner (no LLM) ----------

const CATEGORIES = [
  ['Images', ['.jpg', '.jpeg', '.png', '.gif', '.heic', '.webp']],
  ['Music', ['.mp3', '.wav', '.aiff', '.flac', '.m4a']],
  ['Video', ['.mp4', '.mov', '.mkv']],
  ['Documents', ['.pdf', '.doc', '.docx', '.pages', '.txt', '.pptx', '.key', '.xlsx']],
  ['Installers', ['.dmg', '.pkg', '.zip']],
];
const COURSE = /(?<![A-Za-z])([A-Z]{2,4})[ _-]?(\d{4})(?!\d)/i;

function demoPlan({ request, scan, dev = [], caches = [], trashItems = [], xcode = [], findings, profile, previous, intent = { matched: [], isIntent: false } }) {
  const want = (re) => re.test(request);
  const sortSchool = want(/school|class|course|lecture/i);
  const sortAll = want(/organi[sz]e|sort|tidy|clean up|folders?/i);
  const doneWith = want(/done with|finished with|over with/i);
  const dedupe = want(/dup|space|storage|clean|free|copies/i) || doneWith;
  const root = profile.data.targetPlan.destRoots[0] || scan.root;
  const actions = [];
  const questions = [];
  const made = new Set(scan.dirs.map((d) => path.join(scan.root, d)));
  const gone = new Set();
  // US-04: files inside a protected folder are left alone (the validator would reject them anyway).
  const guarded = (p) => Boolean(profile.protectedBy && profile.protectedBy(p, scan.root));
  let n = 0;
  // On a retry, leave out anything the validator already rejected instead of proposing it again.
  const rejected = new Set();
  if (previous && Array.isArray(previous.plan.actions)) {
    const bad = new Set(previous.errors.map((e) => e.action));
    for (const a of previous.plan.actions) if (bad.has(a.id)) rejected.add(`${a.op}:${a.path}`);
  }
  const add = (a) => {
    if (!rejected.has(`${a.op}:${a.path}`)) actions.push({ id: `a${++n}`, dest: '', keep: '', ...a });
  };
  const ensureDir = (dir) => {
    if (made.has(dir)) return;
    if (!made.has(path.dirname(dir)) && path.dirname(dir) !== scan.root) ensureDir(path.dirname(dir));
    made.add(dir);
    add({ op: 'mkdir', path: dir, reason: `New folder for ${path.basename(dir)}` });
  };

  // US-24: only when asked to empty the Trash; nothing else in the plan.
  if (want(/(empty|clear|delete).*(trash|bin)|(trash|bin).*(empty|for good|permanent)/i)) {
    for (const t of trashItems) add({ op: 'delete_from_trash', path: t.path, reason: `${t.name} is already in the Trash` });
    return { summary: trashItems.length ? `Your Trash has ${trashItems.length} item(s). Check the ones to delete for good.` : 'Your Trash is empty.', actions, questions };
  }
  // US-08: an Xcode request plans only Xcode's own clutter, nothing in the folder.
  if (want(/xcode|simulators?|derived ?data/i)) {
    for (const x of xcode) add({ op: x.type === 'simulator' ? 'remove_simulator' : 'delete_rebuildable', path: x.path, reason: x.reason });
    return { summary: xcode.length ? `I found ${xcode.length} Xcode item(s) you haven't used in a while.` : "I didn't find any Xcode build data or simulators you haven't used in a while.", actions, questions };
  }
  if (want(/cache/i)) {
    for (const c of caches) add({ op: 'clear_cache', path: c.path, reason: c.reason });
  }
  for (const f of findings) {
    if (guarded(f.path)) continue;
    add({ op: 'quarantine', path: f.path, reason: f.evidence.join('; ') });
    gone.add(f.path);
  }
  if (dedupe) {
    // Rebuildable dev folders first: that's where the space is. If the request names projects
    // ("done with CS 3140"), only those; if it's ambiguous, ask instead.
    if (intent.ambiguous) questions.push(intent.ambiguous);
    const named = new Set(intent.matched);
    for (const d of dev) {
      if (d.label !== 'rebuildable' || rejected.has(d.path) || intent.ambiguous) continue;
      const project = path.basename(d.project);
      if (doneWith && !named.has(project)) continue;
      if ((intent.kept || []).includes(project)) continue;
      const why = named.has(project) ? `${project}: you said you're done with it. ${d.reason}` : `${project}: ${d.reason}`;
      add({ op: 'delete_rebuildable', path: d.path, project, reason: why });
    }
    for (const g of doneWith ? [] : scan.duplicates) {
      const [keep, ...rest] = g.files;
      for (const p of rest) {
        if (gone.has(p) || gone.has(keep) || guarded(p)) continue;
        // Identical files inside code projects (a LICENSE, an index.js) aren't clutter.
        if (profile.zoneFor(p) === 'never' || profile.zoneFor(keep) === 'never') continue;
        add({ op: 'trash_duplicate', path: p, keep, reason: `Exact copy of ${path.basename(keep)}` });
        gone.add(p);
      }
    }
  }
  // Similar names with different contents are versions: ask instead of guessing.
  const byStem = new Map();
  for (const f of scan.files) {
    // Files inside code projects are source, not versions of a document.
    if (profile.zoneFor(f.path) === 'never' || guarded(f.path)) continue;
    const stem = f.name.toLowerCase().replace(/\s*\(\d+\)|[-_ ]?(final|v\d+|copy)(?=[-_ .(]|$)/gi, '');
    if (!byStem.has(stem)) byStem.set(stem, []);
    byStem.get(stem).push(f);
  }
  const versionFiles = new Set();
  for (const group of byStem.values()) {
    const unique = new Set(group.map((f) => f.sha256 || `${f.size}`));
    if (group.length < 2 || unique.size < 2) continue;
    const text = `I found ${group.length} different versions of "${group[0].name}". What should I do with them?`;
    const answer = profile.data.preferences.find((p) => p.startsWith(text.replace(/\?$/, '')));
    if (!answer) {
      group.forEach((f) => versionFiles.add(f.path));
      questions.push({ text, options: ['Keep all of them', 'Keep only the newest', 'Put them in a Versions folder'] });
    } else if (!answer.endsWith('Keep all of them')) {
      const newest = [...group].sort((a, b) => b.modified.localeCompare(a.modified))[0];
      const dir = path.join(root, answer.endsWith('Keep only the newest') ? 'Old versions' : 'Versions');
      ensureDir(dir);
      for (const f of group) {
        versionFiles.add(f.path);
        if (answer.endsWith('Keep only the newest') && f === newest) continue;
        add({ op: 'move', path: f.path, dest: dir, reason: `You said: ${answer.split(': ').pop()}` });
      }
    }
  }
  if (sortSchool || sortAll) {
    for (const f of scan.files) {
      if (gone.has(f.path) || versionFiles.has(f.path) || f.isBundle || guarded(f.path)) continue;
      if (path.dirname(f.path) !== scan.root) continue; // only tidy the top level
      const course = f.name.match(COURSE);
      let dir = null;
      if (course && (sortSchool || sortAll)) {
        dir = path.join(root, 'School', `${course[1].toUpperCase()}${course[2]}`);
      } else if (sortAll) {
        const cat = CATEGORIES.find(([, exts]) => exts.includes(f.ext));
        if (cat) dir = path.join(root, cat[0]);
      }
      if (!dir) continue;
      ensureDir(dir);
      add({ op: 'move', path: f.path, dest: dir, reason: course ? `Matches class ${course[1].toUpperCase()} ${course[2]}` : `${path.basename(dir)} file` });
    }
  }
  const summary = actions.length ? `Here's my plan for "${request}".` : 'I could not find anything to do for that request.';
  return { summary, actions, questions };
}

// An injected client (tests, or a future server proxy) also means "use the LLM".
async function makePlan(args) {
  if (args.apiKey || args.client) return { mode: 'llm', plan: await llmPlan(args) };
  return { mode: 'demo', plan: demoPlan(args) };
}

module.exports = { makePlan, demoPlan, PLAN_SCHEMA, MODEL };
