// US-14 (#15) · Undo one action.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmp, write } = require('./helpers');
const { Executor } = require('../../backend/executor');
const TODO = { todo: 'US-14 (#15): per-action undo not built yet' };

function twoMoves() {
  const dir = tmp();
  const a = write(path.join(dir, 'a.pdf'));
  const b = write(path.join(dir, 'b.pdf'));
  const dest = path.join(dir, 'School');
  fs.mkdirSync(dest);
  const ex = new Executor(tmp());
  const run = ex.run([
    { id: 'm1', op: 'move', path: a, dest, reason: 'sort' },
    { id: 'm2', op: 'move', path: b, dest, reason: 'sort' },
  ]);
  return { ex, run, a, b, dest };
}

test('US-14 undoing one action leaves every other action done', TODO, () => {
  const { ex, run, a, b, dest } = twoMoves();
  ex.undoAction(run.batchId, 'm1');
  assert.ok(fs.existsSync(a));
  assert.ok(fs.existsSync(path.join(dest, path.basename(b))));
});

test('US-14 "Undo all" still reverses the whole run (guard: already works, must keep working)', () => {
  const { ex, a, b } = twoMoves();
  ex.undoLast();
  assert.ok(fs.existsSync(a) && fs.existsSync(b));
});

test('US-14 undoing a move whose original folder was deleted recreates the folder', TODO, () => {
  const dir = tmp();
  const sub = path.join(dir, 'Old');
  const f = write(path.join(sub, 'x.pdf'));
  const dest = path.join(dir, 'New');
  fs.mkdirSync(dest);
  const ex = new Executor(tmp());
  const run = ex.run([{ id: 'm1', op: 'move', path: f, dest, reason: 'sort' }]);
  fs.rmdirSync(sub);
  ex.undoAction(run.batchId, 'm1');
  assert.ok(fs.existsSync(f));
});
