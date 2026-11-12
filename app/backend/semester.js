// US-17: after a semester ends, offer one sweep of class projects that were already untouched for 30 days
// before it ended. It's only an offer: accepting it makes an ordinary plan that waits for approval.
const { courseCodes } = require('./intent');

const DAY = 24 * 60 * 60 * 1000;
const QUIET_DAYS = 30;
const time = (d) => new Date(d).getTime();

// The most recent end of a semester on or before now (UVA-style: May 10 and December 15).
function lastSemesterEnd(now = Date.now()) {
  const t = time(now);
  const y = new Date(t).getUTCFullYear();
  const ends = [Date.UTC(y, 4, 10), Date.UTC(y, 11, 15), Date.UTC(y - 1, 11, 15)].filter((e) => e <= t);
  return new Date(Math.max(...ends)).toISOString().slice(0, 10);
}

// projects: [{ name, lastChanged }]. Only class projects (a course code in the name) are swept.
function sweepOffer({ semesterEnd = lastSemesterEnd(), now = Date.now(), projects = [] } = {}) {
  const end = time(semesterEnd);
  if (time(now) < end) return { offered: false, projects: [], runsAutomatically: false };
  const done = projects
    .filter((p) => courseCodes(p.name).length && time(p.lastChanged) <= end - QUIET_DAYS * DAY)
    .map((p) => p.name)
    .sort();
  return {
    offered: done.length > 0,
    projects: done,
    runsAutomatically: false,
    text: done.length ? `The semester's over. ${done.length} class project${done.length === 1 ? '' : 's'} haven't changed in a month (${done.join(', ')}). Want me to plan a cleanup? Nothing runs until you approve it.` : '',
    request: done.length ? `I'm done with ${done.join(', ')}. Free up space.` : '',
  };
}

module.exports = { sweepOffer, lastSemesterEnd };
