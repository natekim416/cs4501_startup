// An offer only: accepting it uses the ordinary planner and approval flow.
const DAY = 864e5;

function semesterDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function sweepOffer({ semesterEnd, now = Date.now(), projects = [] }) {
  const end = semesterDate(semesterEnd);
  if (!end) return null;
  end.setDate(end.getDate() + 1);
  const today = new Date(now).getTime();
  if (!Number.isFinite(today) || today < end.getTime()) return null;
  const names = [...new Set(projects.filter((p) => {
    const changed = new Date(p.lastChanged).getTime();
    return typeof p.name === 'string' && /^[a-z]{2,4}[-_ ]?\d{4}(?:\b|[-_])/i.test(p.name)
      && !p.protected && Number.isFinite(changed) && today - changed >= 30 * DAY;
  }).map((p) => p.name))];
  return { projects: names, runsAutomatically: false };
}

module.exports = { sweepOffer, semesterDate };
