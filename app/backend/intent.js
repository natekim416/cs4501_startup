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

function matchProjects(request, names) {
  const codes = courseCodes(request);
  const stems = keywords(request);
  const matched = names.filter((n) => {
    const s = squash(n);
    return codes.some((c) => s.includes(c)) || stems.some((w) => s.includes(w));
  });

  // "the CS class" without a number: ask which one instead of guessing.
  let ambiguous = null;
  const dept = request.match(DEPT_CLASS);
  if (!codes.length && dept) {
    const prefix = dept[1].toLowerCase();
    const options = [...new Set(names.flatMap((n) => courseCodes(n)).filter((c) => c.startsWith(prefix)))]
      .sort()
      .map((c) => `${c.replace(/\d+$/, '').toUpperCase()} ${c.match(/\d+$/)[0]}`);
    if (options.length > 1) ambiguous = { text: `Which class do you mean? I found ${options.length}.`, options };
  }
  return { matched: ambiguous ? [] : matched, ambiguous, codes, isIntent: Boolean(codes.length || stems.length || dept) };
}

module.exports = { matchProjects, courseCodes };
