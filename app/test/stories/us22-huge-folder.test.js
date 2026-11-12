// US-22 (#23) · One request for a huge folder (Should).
const test = require('node:test');
const assert = require('node:assert');

test('US-22 2,800 files are planned in batches of 400 or fewer and shown as one plan', async () => {
  const { batches } = require('../../backend/planner');
  const files = Array.from({ length: 2800 }, (_, i) => ({ path: `/d/f${i}.pdf` }));
  const b = batches(files, 400);
  assert.strictEqual(b.length, 7);
  assert.ok(b.every((x) => x.length <= 400));
});

test('US-22 a batch that still fails after 3 tries does not hide the other batches', async () => {
  const { mergeBatchPlans } = require('../../backend/planner');
  const merged = mergeBatchPlans([{ ok: true, actions: [{ id: '1' }] }, { ok: false, actions: [], error: 'x' }, { ok: true, actions: [{ id: '2' }] }]);
  assert.strictEqual(merged.actions.length, 2);
  assert.strictEqual(merged.questions.length, 1);
});

test('US-22 with Claude, a 900-file folder is sent in batches of 400 or fewer that together cover every file, and comes back as one plan', async () => {
  const path = require('path');
  const { tmp, write } = require('./helpers');
  const { Engine } = require('../../backend/engine');
  const root = tmp();
  for (let i = 0; i < 900; i++) write(path.join(root, `f${String(i).padStart(3, '0')}.pdf`), `file ${i}`);
  const seen = [];
  const client = { beta: { messages: { create: async (req) => {
    const snapshot = JSON.parse(req.messages[0].content.split('(file names and metadata only):\n')[1].split('\n\n')[0]);
    seen.push(snapshot.files.map((f) => f.path));
    const first = snapshot.files[0].path;
    const plan = { summary: 's', questions: [], actions: [{ id: 'a1', op: 'mkdir', path: path.join(root, `Batch-${path.basename(first, '.pdf')}`), dest: '', keep: '', reason: 'a folder' }] };
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(plan) }] };
  } } } };
  const engine = new Engine({ dataDir: tmp(), apiKey: '', home: tmp(), trashDir: tmp(), llmClient: client });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const plan = await engine.plan('Organize everything');
  assert.strictEqual(seen.length, 3);
  assert.ok(seen.every((b) => b.length <= 400));
  assert.strictEqual(new Set(seen.flat()).size, 900);
  assert.strictEqual(plan.actions.length, 3, 'one plan with each batch\'s action');
  assert.strictEqual(new Set(plan.actions.map((a) => a.id)).size, 3, 'action ids are unique across batches');
});
