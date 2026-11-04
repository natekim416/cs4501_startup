// US-18 (#19) · One-sentence summary above Approve.
const test = require('node:test');
const assert = require('node:assert');

const plan = {
  folder: '/Users/s/Downloads',
  actions: [
    ...Array.from({ length: 6 }, (_, i) => ({ op: 'delete_rebuildable', path: `/Users/s/code/p${i}/node_modules`, bytes: 2e9 })),
    ...Array.from({ length: 30 }, (_, i) => ({ op: 'move', path: `/Users/s/Downloads/f${i}.pdf`, dest: `/Users/s/Downloads/School/C${i % 4}` })),
  ],
};

test('US-18 one sentence says what changes', () => {
  const { summarize } = require('../../backend/summary');
  const s = summarize(plan, { recentlyOpened: [] });
  assert.match(s, /Delete 6 rebuildable folders \(12 GB\)/);
  assert.match(s, /move 30 files into 4 folders/);
  assert.strictEqual(s.split(/(?<=\.)\s/).length <= 2, true);
});

test('US-18 a file opened in the last 24 hours is named in the summary', () => {
  const { summarize } = require('../../backend/summary');
  const s = summarize(plan, { recentlyOpened: ['/Users/s/Downloads/f3.pdf'] });
  assert.match(s, /f3\.pdf.*opened today/);
});

test('US-18 the summary uses plain words ("Trash", not "Dino Bin")', () => {
  const { summarize } = require('../../backend/summary');
  const s = summarize({ folder: '/x', actions: [{ op: 'trash_duplicate', path: '/x/a (1).pdf' }] }, { recentlyOpened: [] });
  assert.doesNotMatch(s, /Dino Bin/);
  assert.match(s, /Trash/);
});
