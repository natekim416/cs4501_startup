// Live tests against the real Claude API. The other Claude-path tests (llm-planner.test.js) use a
// fake client, so they prove our prompt, schema, retry loop, and validator, but not that the real
// model understands requests. These do. They cost API calls, so they stay out of `npm test` and
// skip when there's no key. Run: npm run test:live (key in the repo's root .env).
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { tmp } = require('../stories/helpers');
const { makeDevDemo } = require('../../scripts/make-dev-demo');
const { Engine } = require('../../backend/engine');
const { MODEL } = require('../../backend/planner');

try {
  process.loadEnvFile(path.join(__dirname, '..', '..', '..', '.env'));
} catch {
  // No .env file: rely on the shell, or skip.
}
const KEY = process.env.ANTHROPIC_API_KEY || '';
const skip = KEY ? false : 'no ANTHROPIC_API_KEY (put it in the repo root .env to run the live tests)';
const opts = { skip, timeout: 5 * 60 * 1000 };

// The same 8-project folder the class demo uses. Plans are never executed, so one copy serves every test.
let root;
function demoFolder() {
  if (!root) root = makeDevDemo(path.join(tmp('cleanasaurus-live-'), 'code'));
  return root;
}

async function ask(request) {
  const folder = demoFolder();
  // A temp home keeps the real npm/yarn caches on this laptop out of the snapshot sent to Claude.
  const engine = new Engine({ dataDir: tmp(), apiKey: KEY, home: tmp() });
  engine.profile.setZone(folder, 'free');
  engine.scanFolder(folder);
  const started = Date.now();
  const plan = await engine.plan(request);
  const projects = [...new Set((plan.actions || []).map((a) => path.basename(path.dirname(a.path))))].sort();
  // Printed so the saved run (tdd/06-live-claude-run.txt) shows what Claude actually did.
  console.log(JSON.stringify({
    request,
    model: MODEL,
    seconds: Math.round((Date.now() - started) / 1000),
    tries: plan.attempts.map((a) => (a.ok ? 'pass' : `fail: ${a.errors.join('; ')}`)),
    projects,
    questions: (plan.questions || []).map((q) => q.text),
  }, null, 1));
  return { plan, projects };
}

test('LIVE-1 "done with CS 3140 and the hackathon" deletes only CS 3140 build folders, never hoohacks', opts, async () => {
  const { plan, projects } = await ask("I'm done with CS 3140 and the hackathon. Free up space.");
  assert.strictEqual(plan.mode, 'llm');
  assert.deepStrictEqual(projects, ['cs3140-final', 'cs3140-hw1'], 'hoohacks-2026 has uncommitted work and must not survive validation');
  assert.ok(plan.attempts.at(-1).ok, 'the final plan passed the validator');
});

test('LIVE-2 "my machine learning class" maps to cs4774-ml, which the offline planner cannot match', opts, async () => {
  const { projects } = await ask("I'm done with my machine learning class. Free up space.");
  assert.deepStrictEqual(projects, ['cs4774-ml']);
});

test('LIVE-3 "I\'m NOT done with CS 3140" deletes nothing from CS 3140', opts, async () => {
  const { projects } = await ask("I'm not done with CS 3140 yet. Free up space.");
  assert.ok(!projects.some((p) => p.startsWith('cs3140')), `planned: ${projects.join(', ')}`);
});

test('LIVE-4 "done with CS 3140 but keep the final project" deletes hw1 only', opts, async () => {
  const { projects } = await ask("I'm done with CS 3140, but keep the final project.");
  assert.deepStrictEqual(projects, ['cs3140-hw1']);
});

test('LIVE-5 "the CS class" is ambiguous, so Claude asks which one instead of deleting', opts, async () => {
  const { plan, projects } = await ask("I'm done with the CS class. Free up space.");
  assert.deepStrictEqual(projects, [], 'nothing deleted before the user picks a class');
  assert.ok((plan.questions || []).length > 0, 'a question was asked');
});
