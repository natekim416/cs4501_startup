// US-21 (#22) · Opt-in usage logs and a "Go Pro" fake door.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmp } = require('./helpers');
const { UsageLog } = require('../../backend/usage-log');
const { Profile } = require('../../backend/profile');
const TODO = { todo: 'US-21 (#22): rebuild logging and Go Pro fake door not built yet' };

function log() {
  const dir = tmp();
  const profile = new Profile(path.join(dir, 'p.json'));
  const l = new UsageLog(path.join(dir, 'u.jsonl'), profile);
  l.setEnabled(true);
  return l;
}

test('US-21 "Go Pro" shows the not-available message and logs the click', TODO, () => {
  const l = log();
  const res = l.goPro();
  assert.match(res.message, /Pro isn't available yet\. Want us to email you when it is\?/);
  assert.match(fs.readFileSync(l.file, 'utf8'), /"event":"go_pro_click"/);
});

test('US-21 rebuilds are logged with counts and categories, never paths', TODO, () => {
  const l = log();
  l.record('rebuild', { ok: true, category: 'javascript', ms: 41000, path: '/Users/s/secret-project' });
  const text = fs.readFileSync(l.file, 'utf8');
  assert.match(text, /"category":"javascript"/);
  assert.doesNotMatch(text, /secret-project/);
});
