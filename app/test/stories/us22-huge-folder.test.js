// US-22 (#23) · One request for a huge folder (Should).
const test = require('node:test');
const assert = require('node:assert');
const TODO = { todo: 'US-22 (#23): batched planning not built yet (Should)' };

test('US-22 2,800 files are planned in batches of 400 or fewer and shown as one plan', TODO, async () => {
  const { batches } = require('../../backend/planner');
  const files = Array.from({ length: 2800 }, (_, i) => ({ path: `/d/f${i}.pdf` }));
  const b = batches(files, 400);
  assert.strictEqual(b.length, 7);
  assert.ok(b.every((x) => x.length <= 400));
});

test('US-22 a batch that still fails after 3 tries does not hide the other batches', TODO, async () => {
  const { mergeBatchPlans } = require('../../backend/planner');
  const merged = mergeBatchPlans([{ ok: true, actions: [{ id: '1' }] }, { ok: false, actions: [], error: 'x' }, { ok: true, actions: [{ id: '2' }] }]);
  assert.strictEqual(merged.actions.length, 2);
  assert.strictEqual(merged.questions.length, 1);
});
