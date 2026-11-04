// US-13 (#14) · Removed personal files go to the macOS Trash.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmp, write } = require('./helpers');
const { Executor } = require('../../backend/executor');
const TODO = { todo: 'US-13 (#14): macOS Trash not built yet' };

test('US-13 a removed duplicate appears in the Trash under its original name, and undo brings it back', TODO, () => {
  const trash = tmp();
  const dir = tmp();
  const dup = write(path.join(dir, 'notes (1).pdf'), 'same');
  write(path.join(dir, 'notes.pdf'), 'same');
  const ex = new Executor(tmp(), { trashDir: trash });
  ex.run([{ id: 'a', op: 'trash_duplicate', path: dup, keep: path.join(dir, 'notes.pdf'), reason: 'dup' }]);
  assert.ok(fs.existsSync(path.join(trash, 'notes (1).pdf')));
  ex.undoLast();
  assert.ok(fs.existsSync(dup));
});

test('US-13 a quarantined file still goes to the app quarantine folder, not the Trash', TODO, () => {
  const trash = tmp();
  const data = tmp();
  const bad = write(path.join(tmp(), 'crack.command'), 'x');
  const ex = new Executor(data, { trashDir: trash });
  assert.strictEqual(ex.trashDir, trash, 'the executor must know where the macOS Trash is');
  ex.run([{ id: 'a', op: 'quarantine', path: bad, reason: 'flagged' }]);
  assert.strictEqual(fs.readdirSync(trash).length, 0);
  assert.ok(fs.readdirSync(path.join(data, 'quarantine')).length > 0);
});
