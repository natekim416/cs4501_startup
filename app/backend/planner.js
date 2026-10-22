// Turns a plain-English request into a structured action plan.
// With an Anthropic API key it asks Claude; without one it falls back to an offline
// rule-based planner so the app can still be demoed (shown as DEMO MODE in the UI).
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

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
          op: { type: 'string', enum: ['mkdir', 'move', 'rename', 'trash_duplicate', 'quarantine'] },
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

Rules:
- Every action needs a short, plain-English "reason".
- Only put new folders and moved files inside the allowed destination roots.
- Never act on files in "never" zones. Files in "ask" zones are allowed but the user will be asked.
- Follow the user's saved preferences.
- If something is ambiguous or unusual (files that look like versions of each other, a request that could mean two things), do not guess: add a question with 2-4 short options and leave those files alone.
- If you receive validator errors, fix exactly those problems and return the full corrected plan.`;

function summarizeScan(scan, findings, profile) {
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
    zones: profile.data.zones,
    allowed_destination_roots: profile.data.targetPlan.destRoots.length ? profile.data.targetPlan.destRoots : [scan.root],
    target_plan_notes: profile.data.targetPlan.notes,
    saved_preferences: profile.data.preferences,
  };
}

async function llmPlan({ request, scan, findings, profile, previous, apiKey }) {
  const client = new Anthropic({ apiKey });
  let content = `User request: ${request}\n\nFolder snapshot (file names and metadata only):\n${JSON.stringify(summarizeScan(scan, findings, profile))}`;
  if (previous) {
    content += `\n\nYour previous plan FAILED validation:\n${previous.errors.map((e) => `- ${e.action ? `[${e.action}] ` : ''}${e.message}`).join('\n')}\n\nPrevious plan:\n${JSON.stringify(previous.plan)}\n\nReturn a corrected full plan.`;
  }
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: PLAN_SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content }],
  });
  if (response.stop_reason === 'refusal') throw new Error('The model declined this request.');
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    return JSON.parse(text);
  } catch {
    // Unparseable output becomes a validation error so the retry loop can fix it.
    return { summary: '', actions: null, questions: [] };
  }
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

function demoPlan({ request, scan, findings, profile }) {
  const want = (re) => re.test(request);
  const sortSchool = want(/school|class|course|lecture/i);
  const sortAll = want(/organi[sz]e|sort|tidy|clean up|folders?/i);
  const dedupe = want(/dup|space|storage|clean|free|copies/i);
  const root = profile.data.targetPlan.destRoots[0] || scan.root;
  const actions = [];
  const questions = [];
  const made = new Set(scan.dirs.map((d) => path.join(scan.root, d)));
  const gone = new Set();
  let n = 0;
  const add = (a) => actions.push({ id: `a${++n}`, dest: '', keep: '', ...a });
  const ensureDir = (dir) => {
    if (made.has(dir)) return;
    if (!made.has(path.dirname(dir)) && path.dirname(dir) !== scan.root) ensureDir(path.dirname(dir));
    made.add(dir);
    add({ op: 'mkdir', path: dir, reason: `New folder for ${path.basename(dir)}` });
  };

  for (const f of findings) {
    add({ op: 'quarantine', path: f.path, reason: f.evidence.join('; ') });
    gone.add(f.path);
  }
  if (dedupe) {
    for (const g of scan.duplicates) {
      const [keep, ...rest] = g.files;
      for (const p of rest) {
        if (gone.has(p) || gone.has(keep)) continue;
        add({ op: 'trash_duplicate', path: p, keep, reason: `Exact copy of ${path.basename(keep)}` });
        gone.add(p);
      }
    }
  }
  // Similar names with different contents are versions: ask instead of guessing.
  const byStem = new Map();
  for (const f of scan.files) {
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
      if (gone.has(f.path) || versionFiles.has(f.path) || f.isBundle) continue;
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

async function makePlan(args) {
  if (args.apiKey) return { mode: 'llm', plan: await llmPlan(args) };
  return { mode: 'demo', plan: demoPlan(args) };
}

module.exports = { makePlan, demoPlan, PLAN_SCHEMA, MODEL };
