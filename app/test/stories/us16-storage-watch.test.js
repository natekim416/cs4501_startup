// US-16 (#17) · Storage watch.
const test = require('node:test');
const assert = require('node:assert');
const DAY = 864e5;

function watch(opts = {}) {
  const { StorageWatch } = require('../../backend/storage-watch');
  const sent = [];
  const w = new StorageWatch({ threshold: 0.85, notify: (n) => sent.push(n), estimate: () => 18e9, ...opts });
  return { w, sent };
}

test('US-16 passing 85% full sends one notification that opens the plan preview and runs nothing', () => {
  const { w, sent } = watch();
  w.check({ usedFraction: 0.87, now: 0 });
  w.check({ usedFraction: 0.88, now: DAY });
  assert.strictEqual(sent.length, 1);
  assert.match(sent[0].text, /87% full/);
  assert.match(sent[0].text, /18 GB/);
  assert.strictEqual(sent[0].action, 'open-plan-preview');
});

test('US-16 after a dismissal it stays quiet until 5% more or 7 days pass', () => {
  const { w, sent } = watch();
  w.check({ usedFraction: 0.86, now: 0 });
  w.dismiss({ now: 0 });
  w.check({ usedFraction: 0.89, now: 2 * DAY });
  assert.strictEqual(sent.length, 1);
  w.check({ usedFraction: 0.915, now: 3 * DAY });
  assert.strictEqual(sent.length, 2);
  w.dismiss({ now: 3 * DAY });
  w.check({ usedFraction: 0.915, now: 10.5 * DAY });
  assert.strictEqual(sent.length, 3);
});

test('US-16 when the watch is turned off, no notifications', () => {
  const { w, sent } = watch({ enabled: false });
  w.check({ usedFraction: 0.99, now: 0 });
  assert.strictEqual(sent.length, 0);
});

test('US-16 threshold is inclusive at 85%, not below it', () => {
  const { w, sent } = watch();
  w.check({ usedFraction: 0.84999, now: 0 });
  assert.strictEqual(sent.length, 0);
  w.check({ usedFraction: 0.85, now: 1 });
  assert.strictEqual(sent.length, 1);
});

test('US-16 cooldown is seven days to the millisecond', () => {
  const { w, sent } = watch();
  w.check({ usedFraction: 0.9, now: 0 });
  w.check({ usedFraction: 0.9, now: 7 * DAY - 1 });
  assert.strictEqual(sent.length, 1);
  w.check({ usedFraction: 0.9, now: 7 * DAY });
  assert.strictEqual(sent.length, 2);
});

test('US-16 increase threshold is five percentage points, with no repeated reminder at the same level', () => {
  const { w, sent } = watch();
  w.check({ usedFraction: 0.85, now: 0 });
  w.check({ usedFraction: 0.899999, now: 1 });
  assert.strictEqual(sent.length, 1);
  w.check({ usedFraction: 0.90, now: 2 });
  w.check({ usedFraction: 0.90, now: 3 });
  assert.strictEqual(sent.length, 2);
});

test('US-16 dismissing later starts the cooldown from dismissal and latest disk usage', () => {
  const { w, sent } = watch();
  w.check({ usedFraction: 0.86, now: 0 });
  w.check({ usedFraction: 0.89, now: DAY });
  w.dismiss({ now: DAY });
  w.check({ usedFraction: 0.92, now: 2 * DAY });
  w.check({ usedFraction: 0.92, now: 8 * DAY - 1 });
  assert.strictEqual(sent.length, 1);
  w.check({ usedFraction: 0.92, now: 8 * DAY });
  assert.strictEqual(sent.length, 2);
});

test('US-16 invalid readings never notify or trigger an estimate', () => {
  let estimates = 0;
  const { w, sent } = watch({ estimate: () => { estimates++; return 1; } });
  for (const usedFraction of [NaN, Infinity, -0.1, 1.1, '0.9', undefined, null]) w.check({ usedFraction, now: 0 });
  for (const now of [NaN, Infinity, -1, 'today']) w.check({ usedFraction: 0.9, now });
  w.check();
  assert.strictEqual(sent.length, 0);
  assert.strictEqual(estimates, 0);
});

test('US-16 polling below the threshold and during cooldown never performs another scan or estimate', () => {
  let estimates = 0;
  const { w } = watch({ estimate: () => { estimates++; return 100; } });
  w.check({ usedFraction: 0.5, now: 0 });
  assert.strictEqual(estimates, 0);
  w.check({ usedFraction: 0.9, now: 1 });
  for (let i = 0; i < 100; i++) w.check({ usedFraction: 0.9, now: 2 + i });
  assert.strictEqual(estimates, 1);
});

test('US-16 enabled setting and cooldown survive a restart', () => {
  let saved;
  const { w } = watch({ save: (s) => { saved = s; } });
  w.check({ usedFraction: 0.9, now: 0 });
  const resumed = watch({ state: saved });
  resumed.w.check({ usedFraction: 0.91, now: DAY });
  assert.strictEqual(resumed.sent.length, 0);
  resumed.w.setEnabled(false);
  const disabled = watch({ state: resumed.w.status() });
  disabled.w.check({ usedFraction: 1, now: 20 * DAY });
  assert.strictEqual(disabled.sent.length, 0);
});

test('US-16 opting out suppresses estimates and notifications until explicitly enabled', () => {
  let estimates = 0;
  const { w, sent } = watch({ enabled: false, estimate: () => { estimates++; return 1e9; } });
  w.check({ usedFraction: 1, now: 0 });
  assert.strictEqual(estimates, 0);
  w.setEnabled(true);
  w.check({ usedFraction: 1, now: 1 });
  assert.strictEqual(sent.length, 1);
  w.setEnabled(false);
  w.check({ usedFraction: 1, now: 10 * DAY });
  assert.strictEqual(sent.length, 1);
  assert.throws(() => w.setEnabled('true'), /on or off/);
});

test('US-16 missing or failed estimates do not invent reclaimed space', () => {
  for (const estimate of [() => -1, () => NaN, () => Infinity, () => '18000000000', () => { throw new Error('scan unavailable'); }]) {
    const { w, sent } = watch({ estimate });
    w.check({ usedFraction: 0.9, now: 0 });
    assert.strictEqual(sent[0].estimatedBytes, 0);
    assert.doesNotMatch(sent[0].text, /GB|MB|KB/);
    assert.match(sent[0].text, /Choose a folder/);
  }
});

test('US-16 small estimates have clear units and are labeled as estimates from the last scan', () => {
  for (const [bytes, expected] of [[1500, '2 KB'], [2.5e6, '2.5 MB'], [18e9, '18 GB']]) {
    const { w, sent } = watch({ estimate: () => bytes });
    w.check({ usedFraction: 0.9, now: 0 });
    assert.ok(sent[0].text.includes(expected));
    assert.match(sent[0].text, /latest scan.*about/);
  }
});

test('US-16 a failed delivery can be retried; preference-write failure does not crash', () => {
  let tries = 0;
  const { w } = watch({ notify: () => { if (++tries === 1) throw new Error('unavailable'); }, save: () => { throw new Error('disk full'); } });
  assert.strictEqual(w.check({ usedFraction: 0.9, now: 0 }), null);
  assert.ok(w.check({ usedFraction: 0.9, now: 1 }));
  assert.doesNotThrow(() => w.setEnabled(false));
});

test('US-16 corrupted saved readings are discarded and clock rollback cannot spam reminders', () => {
  const { w, sent } = watch({ state: { lastNotifiedAt: -1, lastUsedFraction: 10 } });
  w.check({ usedFraction: 0.9, now: DAY });
  w.check({ usedFraction: 1, now: 0 });
  w.dismiss({ now: 0 });
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(w.status().lastNotifiedAt, DAY);
  const status = w.status();
  status.enabled = false;
  assert.strictEqual(w.status().enabled, true, 'status is a copy');
});

test('US-16 invalid thresholds are refused and dismissing before any notice is harmless', () => {
  for (const threshold of [-0.1, 1.1, NaN, Infinity, '0.85']) assert.throws(() => watch({ threshold }), /threshold/);
  const { w } = watch();
  assert.doesNotThrow(() => w.dismiss({ now: 0 }));
  assert.strictEqual(w.status().lastNotifiedAt, undefined);
});
