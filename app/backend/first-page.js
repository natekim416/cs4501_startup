// US-23 (opt-in): use the course code printed on a PDF's first page when its file name doesn't have one.
// Without opting in, only file names are used, as before. Reading the page is the caller's job.
const { courseCodes } = require('./intent');

function courseFor({ name, firstPage = '' }, { optIn = false } = {}) {
  if (!optIn) return null;
  const fromName = courseCodes(name)[0];
  if (fromName) return { course: fromName.toUpperCase(), reason: `course code in the file name: ${fromName.toUpperCase()}` };
  const m = String(firstPage).match(/\b([A-Za-z]{2,4})[\s_-]*(\d{4})\b/);
  if (!m) return { course: 'Unsorted', reason: 'no course code on page 1, so it goes to Unsorted' };
  const course = `${m[1].toUpperCase()}${m[2]}`;
  return { course, reason: `course code on page 1: ${m[1].toUpperCase()} ${m[2]}` };
}

module.exports = { courseFor };
