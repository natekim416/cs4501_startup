// Works out which projects a request names, like "I'm done with CS 3140 and the hackathon".
// Claude does this on its own in LLM mode. This plain-code version serves two jobs: the offline
// planner uses it to make plans, and the engine uses it to decide which projects the user named,
// since only a named project may skip the rebuild proof's 30-day rule.
const COURSE = /\b([a-z]{2,4})[\s_-]*(\d{4})\b/gi;
const DEPT_CLASS = /\b([a-z]{2,4})\s+(?:class|course)\b/i;
// Words that appear in requests but never identify a project.
const FILLER = new Set([
  'done', 'with', 'free', 'space', 'clean', 'cleanup', 'delete', 'remove', 'please', 'want', 'need',
  'class', 'classes', 'course', 'project', 'projects', 'stuff', 'files', 'folder', 'folders', 'old',
  'the', 'and', 'from', 'that', 'this', 'everything', 'anything', 'keep', 'dont', "don't", 'touch',
  'finished', 'over', 'last', 'semester', 'year', 'some', 'more', 'room', 'disk', 'storage', 'full',
]);

const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function courseCodes(text) {
  return [...text.matchAll(COURSE)].map((m) => `${m[1]}${m[2]}`.toLowerCase());
}

// Words of 4+ letters that aren't filler, cut to a 4-letter stem so "hackathon" finds "hoohacks".
function keywords(text) {
  const withoutCodes = text.replace(COURSE, ' ');
  return [...new Set(withoutCodes.toLowerCase().match(/[a-z']{4,}/g) || [])].filter((w) => !FILLER.has(w)).map((w) => w.slice(0, 4));
}

// Phrases that name projects to KEEP: "but keep the final", "except cs3140", "I still need …",
// "leave X alone". "leave" alone isn't one ("before I leave for break").
const KEEP = /\b(?:keep|except|other than|don'?t (?:touch|delete|remove|clean)|still need|leave\s+[\w-]+(?:\s+[\w-]+)?\s+(?:alone|out))\b/i;
const DONE_WITH = /\b(?:done|finished|over)\s+with\b/i;
const NOT_DONE = /\bnot\s+(?:done|finished)\s+with\b([^.!?]*)/i;

function find(text, names) {
  // A project named exactly ("cs3140-final") means that project, not every project in its course.
  const exact = names.filter((n) => new RegExp(`(^|[^\\w-])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\w-])`, 'i').test(text));
  if (exact.length) return exact;
  const codes = courseCodes(text);
  const stems = keywords(text);
  return names.filter((n) => {
    const s = squash(n);
    return codes.some((c) => s.includes(c)) || stems.some((w) => s.includes(w));
  });
}

// Splits a request into clauses, so "Keep X, I'm done with Y" and "done with Y but keep X" both work.
function clauses(request) {
  return request.split(/(?:[.;!?]|,|\bbut\b|\band\s+(?=keep|leave|don'?t))/i).map((c) => c.trim()).filter(Boolean);
}

function matchProjects(request, names) {
  const kept = new Set();
  let include = '';
  for (const c of clauses(request)) {
    const not = c.match(NOT_DONE);
    if (not) for (const n of find(not[1], names)) kept.add(n);
    else if (KEEP.test(c)) {
      // "done with the hackathon except cs3140": before the keep-word is included, after it is kept.
      const at = c.search(KEEP);
      include += ` ${c.slice(0, at)}`;
      for (const n of find(c.slice(at), names)) kept.add(n);
    }
    else include += ` ${c}`;
  }
  // "the rest of CS 3140" means everything in CS 3140 that wasn't kept.
  const codes = courseCodes(include);
  let matched = find(include, names).filter((n) => !kept.has(n));

  // "the CS class" without a number: ask which one instead of guessing.
  let ambiguous = null;
  const dept = include.match(DEPT_CLASS);
  if (!codes.length && dept) {
    const prefix = dept[1].toLowerCase();
    const options = [...new Set(names.flatMap((n) => courseCodes(n)).filter((c) => c.startsWith(prefix)))]
      .sort()
      .map((c) => `${c.replace(/\d+$/, '').toUpperCase()} ${c.match(/\d+$/)[0]}`);
    if (options.length > 1) ambiguous = { text: `Which class do you mean? I found ${options.length}.`, options };
  }
  // "done with <something I can't match>": list the projects instead of returning an empty plan.
  if (!ambiguous && !matched.length && DONE_WITH.test(include) && names.length) {
    ambiguous = { text: "Which projects do you mean? I couldn't match that to a project name.", options: [...names].sort().slice(0, 8) };
  }
  if (ambiguous) matched = [];
  return { matched, kept: [...kept], ambiguous, codes, isIntent: Boolean(codes.length || matched.length || dept || DONE_WITH.test(include)) };
}

module.exports = { matchProjects, courseCodes };
