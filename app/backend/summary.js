// US-18: one plain sentence above Approve that says what will change, so nobody has to read 40 lines.
const path = require('path');

// Decimal units, the way macOS reports disk space.
function size(bytes) {
  if (bytes >= 1e9) return `${Math.round(bytes / 1e9)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function summarize(plan, { recentlyOpened = [] } = {}) {
  const by = (op) => plan.actions.filter((a) => a.op === op);
  const parts = [];

  const rebuild = by('delete_rebuildable');
  if (rebuild.length) parts.push(`delete ${plural(rebuild.length, 'rebuildable folder')} (${size(rebuild.reduce((n, a) => n + (a.bytes || 0), 0))})`);
  const permanent = by('delete_from_trash');
  if (permanent.length) parts.push(`permanently delete ${plural(permanent.length, 'item')} from the Trash (${size(permanent.reduce((n, a) => n + (a.bytes || 0), 0))})`);
  const caches = by('clear_cache');
  if (caches.length) parts.push(`clear ${plural(caches.length, 'package cache')}`);
  const moves = [...by('move'), ...by('rename')];
  if (moves.length) parts.push(`move ${plural(moves.length, 'file')} into ${plural(new Set(moves.map((a) => a.dest)).size, 'folder')}`);
  const dups = by('trash_duplicate');
  if (dups.length) parts.push(`put ${plural(dups.length, 'duplicate')} in the Trash`);
  const bad = by('quarantine');
  if (bad.length) parts.push(`quarantine ${plural(bad.length, 'suspicious file')}`);
  if (!parts.length) return 'Nothing will change.';

  const recent = plan.actions.map((a) => a.path).filter((p) => recentlyOpened.includes(p)).map((p) => path.basename(p));
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
  const warn = recent.length ? ` (includes ${recent.join(', ')}, opened today)` : '';
  const where = plan.folder ? ` Nothing outside ${path.basename(plan.folder)} changes.` : '';
  return `${list[0].toUpperCase()}${list.slice(1)}${warn}.${where}`;
}

module.exports = { summarize };
