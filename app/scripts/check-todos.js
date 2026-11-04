// Fails if any test marked todo passes. A todo test that passes isn't testing its story,
// so it must either be fixed or have its todo removed (and the story counted as built).
const { spawnSync } = require('child_process');

const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'test/stories/*.test.js'], { cwd: `${__dirname}/..`, encoding: 'utf8' });
const passingTodos = run.stdout.split('\n').filter((l) => /^\s*ok \d+ - .*# TODO/.test(l));
const failingTodos = run.stdout.split('\n').filter((l) => /^\s*not ok \d+ - .*# TODO/.test(l));
console.log(`${failingTodos.length} todo tests are red, as expected.`);
if (passingTodos.length) {
  console.error(`${passingTodos.length} todo tests PASS, so they can't be testing their story:\n${passingTodos.join('\n')}`);
  process.exit(1);
}
