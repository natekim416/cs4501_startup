// US-21 (#22) · Opt-in usage logs and a "Go Pro" fake door.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmp } = require('./helpers');
const { UsageLog } = require('../../backend/usage-log');
const { Profile } = require('../../backend/profile');

function log() {
  const dir = tmp();
  const profile = new Profile(path.join(dir, 'p.json'));
  const l = new UsageLog(path.join(dir, 'u.jsonl'), profile);
  l.setEnabled(true);
  return l;
}

test('US-21 "Go Pro" shows the not-available message and logs the click', () => {
  const l = log();
  const res = l.goPro();
  assert.match(res.message, /Pro isn't available yet\. Want us to email you when it is\?/);
  assert.match(fs.readFileSync(l.file, 'utf8'), /"event":"go_pro_click"/);
});

test('US-21 rebuilds are logged with counts and categories, never paths', () => {
  const l = log();
  l.record('rebuild', { ok: true, category: 'javascript', ms: 41000, path: '/Users/s/secret-project' });
  const text = fs.readFileSync(l.file, 'utf8');
  assert.match(text, /"category":"javascript"/);
  assert.doesNotMatch(text, /secret-project/);
});

test('US-21 Go Pro respects opt-out and does not create a log', () => {
  const l = log();
  l.setEnabled(false);
  assert.match(l.goPro().message, /Pro isn't available yet/);
  assert.ok(!fs.existsSync(l.file));
});

test('US-21 unknown categories cannot leak project names', () => {
  const l = log();
  l.record('rebuild', { category: 'secret-project', path: '/private/file', command: 'secret command', count: 1 });
  const entry = JSON.parse(fs.readFileSync(l.file, 'utf8').trim().split('\n').at(-1));
  assert.strictEqual(entry.count, 1);
  assert.strictEqual(entry.category, undefined);
  assert.strictEqual(entry.path, undefined);
  assert.strictEqual(entry.command, undefined);
});

for (const fails of [false, true]) {
  test(`US-21 engine records a ${fails ? 'failed' : 'successful'} rebuild from its saved recipe`, () => {
    const { Engine } = require('../../backend/engine');
    const dir = tmp();
    const engine = new Engine({ dataDir: dir, apiKey: '' });
    const recipe = { path: path.join(dir, 'private-project', 'node_modules'), cwd: path.join(dir, 'private-project'), command: 'npm ci' };
    engine.executor.recipes.push(recipe);
    engine.usage.setEnabled(true);
    const result = engine.rebuild(recipe, { run: () => { if (fails) throw new Error('private-error'); } });
    assert.strictEqual(result.ok, !fails);
    const raw = fs.readFileSync(engine.usage.file, 'utf8');
    const entry = JSON.parse(raw.trim().split('\n').at(-1));
    assert.strictEqual(entry.event, fails ? 'rebuild_failed' : 'rebuild');
    assert.strictEqual(entry.category, 'javascript');
    assert.strictEqual(entry.count, 1);
    assert.strictEqual(entry.ok, !fails);
    assert.ok(entry.ms >= 0);
    assert.doesNotMatch(raw, /private-project|private-error|npm ci/);
  });
}

test('US-21 rebuild categories use fixed labels for Python and unknown saved commands', () => {
  const { Engine } = require('../../backend/engine');
  const engine = new Engine({ dataDir: tmp(), apiKey: '' });
  engine.usage.setEnabled(true);
  for (const [command, category] of [['uv sync', 'python'], ['conda env create -f private.yml', 'python'], ['private-command', 'other']]) {
    const recipe = { command, cwd: tmp() };
    engine.executor.recipes.push(recipe);
    assert.ok(engine.rebuild(recipe, { run: () => {} }).ok);
    const entry = JSON.parse(fs.readFileSync(engine.usage.file, 'utf8').trim().split('\n').at(-1));
    assert.strictEqual(entry.category, category);
  }
  assert.doesNotMatch(fs.readFileSync(engine.usage.file, 'utf8'), /private/);
});

test('US-21 opted-out rebuilds and unrecognized recipes do not write events', () => {
  const { Engine } = require('../../backend/engine');
  const engine = new Engine({ dataDir: tmp(), apiKey: '' });
  const recipe = { command: 'npm ci', cwd: tmp() };
  engine.executor.recipes.push(recipe);
  assert.ok(engine.rebuild(recipe, { run: () => {} }).ok);
  assert.ok(!fs.existsSync(engine.usage.file));
  engine.usage.setEnabled(true);
  const before = engine.usage.eventCount();
  assert.strictEqual(engine.rebuild({ command: 'made up', cwd: tmp() }).ok, false);
  assert.strictEqual(engine.usage.eventCount(), before);
});
