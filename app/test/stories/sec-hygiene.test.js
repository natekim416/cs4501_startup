// TEST-HYGIENE · The test suite never reads or writes the real home folder. Red-team F14.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');

test('TEST-1 tests run with a throwaway HOME, so caches, Xcode data, and the Trash on this Mac are never scanned', () => {
  const home = fs.realpathSync(os.homedir());
  assert.ok(home.startsWith(fs.realpathSync(os.tmpdir())), `HOME is ${home}`);
  assert.ok(process.env.CLEANASAURUS_REAL_HOME, 'the real home is remembered only so tests can refuse it');
  assert.notStrictEqual(home, fs.realpathSync(process.env.CLEANASAURUS_REAL_HOME));
});
