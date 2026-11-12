// STATE · Undo and quarantine never lose a file, even when the folder changed in between. Red-team F6, F7, F8.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmp, write } = require('./helpers');
const { Executor } = require('../../backend/executor');

const move = (id, from, destDir) => ({ id, op: 'move', path: from, dest: destDir, keep: '', reason: 'test' });

test('STATE-1 undo never overwrites a newer file saved at the old spot; the old one comes back under a free name (F6)', () => {
  const root = tmp();
  const essay = write(path.join(root, 'essay.docx'), 'old draft');
  fs.mkdirSync(path.join(root, 'School'));
  const ex = new Executor(tmp(), { trashDir: tmp() });
  ex.run([move('a1', essay, path.join(root, 'School'))]);
  write(essay, 'NEW WORK saved after the cleanup');
  const res = ex.undoLast();
  assert.strictEqual(fs.readFileSync(essay, 'utf8'), 'NEW WORK saved after the cleanup');
  assert.strictEqual(fs.readFileSync(path.join(root, 'essay 2.docx'), 'utf8'), 'old draft');
  assert.deepStrictEqual(res.restoredAs, [{ path: essay, as: path.join(root, 'essay 2.docx') }]);
});

test('STATE-2 a step undo cannot reverse stays in the log and is reported, instead of being dropped (F7)', () => {
  const root = tmp();
  const a = write(path.join(root, 'a.pdf'), 'a');
  const b = write(path.join(root, 'b.pdf'), 'b');
  fs.mkdirSync(path.join(root, 'Sorted'));
  const ex = new Executor(tmp(), { trashDir: tmp() });
  ex.run([move('a1', a, path.join(root, 'Sorted')), move('a2', b, path.join(root, 'Sorted'))]);
  fs.rmSync(path.join(root, 'Sorted', 'b.pdf')); // the user deleted it by hand in between
  const res = ex.undoLast();
  assert.ok(fs.existsSync(a), 'a.pdf came back');
  assert.strictEqual(res.failed.length, 1);
  assert.strictEqual(res.failed[0].path, b);
  assert.strictEqual(ex.history.length, 1, 'the batch with the failed step is kept');
  assert.deepStrictEqual(ex.history[0].steps.filter((s) => !s.undone).map((s) => s.actionId), ['a2']);
});

test('STATE-3 two flagged files with the same name are both quarantined and both come back on undo (F8)', () => {
  const root = tmp();
  const one = write(path.join(root, 'one', 'photoshop-crack.dmg'), 'first');
  const two = write(path.join(root, 'two', 'photoshop-crack.dmg'), 'second');
  const ex = new Executor(tmp());
  const q = (id, p) => ({ id, op: 'quarantine', path: p, dest: '', keep: '', reason: 'flagged' });
  for (let i = 0; i < 5; i++) {
    const run = ex.run([q('a1', one), q('a2', two)]);
    assert.ok(run.results.every((r) => r.ok));
    const held = ex.history.at(-1).steps.map((s) => s.to);
    assert.strictEqual(new Set(held).size, 2, 'two different quarantine names');
    assert.deepStrictEqual(held.map((p) => fs.readFileSync(p, 'utf8')).sort(), ['first', 'second']);
    ex.undoLast();
    assert.strictEqual(fs.readFileSync(one, 'utf8'), 'first');
    assert.strictEqual(fs.readFileSync(two, 'utf8'), 'second');
  }
});
