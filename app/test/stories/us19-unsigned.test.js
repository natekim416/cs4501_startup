// US-19 (#20) · Unsigned isn't malware.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { tmp, write } = require('./helpers');
const { checkFile } = require('../../backend/malware');
const TODO = { todo: 'US-19 (#20): unsigned-is-unknown not built yet' };

test('US-19 an unsigned app with no other evidence is "Unknown", with no quarantine', () => {
  const app = path.dirname(write(path.join(tmp(), 'MyOwnApp.app', 'Contents', 'Info.plist')));
  const f = checkFile(app, false);
  assert.ok(f, 'still reported, so the user knows');
  assert.strictEqual(f.severity, 'unknown');
  assert.match(f.label, /Unknown: not signed by a verified developer/);
  assert.strictEqual(f.quarantine, false);
});

test('US-19 unsigned plus a pirated-software name still proposes quarantine, in plain words', () => {
  const app = path.dirname(write(path.join(tmp(), 'Photoshop_crack.app', 'Contents', 'Info.plist')));
  const f = checkFile(app, false);
  assert.strictEqual(f.quarantine, true);
  assert.match(f.recommendation, /Likely unwanted software\. Quarantine it\./);
});
