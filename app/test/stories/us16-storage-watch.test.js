// US-16 (#17) · Storage watch.
const test = require('node:test');
const assert = require('node:assert');
const TODO = { todo: 'US-16 (#17): storage watch not built yet' };
const DAY = 864e5;

function watch(opts = {}) {
  const { StorageWatch } = require('../../backend/storage-watch');
  const sent = [];
  const w = new StorageWatch({ threshold: 0.85, notify: (n) => sent.push(n), estimate: () => 18e9, ...opts });
  return { w, sent };
}

test('US-16 passing 85% full sends one notification that opens the plan preview and runs nothing', TODO, () => {
  const { w, sent } = watch();
  w.check({ usedFraction: 0.87, now: 0 });
  w.check({ usedFraction: 0.88, now: DAY });
  assert.strictEqual(sent.length, 1);
  assert.match(sent[0].text, /87% full/);
  assert.match(sent[0].text, /18 GB/);
  assert.strictEqual(sent[0].action, 'open-plan-preview');
});

test('US-16 after a dismissal it stays quiet until 5% more or 7 days pass', TODO, () => {
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

test('US-16 when the watch is turned off, no notifications', TODO, () => {
  const { w, sent } = watch({ enabled: false });
  w.check({ usedFraction: 0.99, now: 0 });
  assert.strictEqual(sent.length, 0);
});
