const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanupIntent } = require('../backend/cleanup-intent');
const models = [{ model: 'org/model' }, { model: 'org/model.v2' }];

for (const request of ['Sort my Docker notes', "Don't touch Docker. Sort my files", 'Clean my files, no Docker', 'Clean Docker notes but not Docker', 'Don’t delete Docker images']) {
  test(`external scope refuses ${request}`, () => assert.equal(cleanupIntent(request).docker, false));
}
for (const request of ['Sort my model notes', 'Clean files but not models', 'Do not delete models', 'Clean files, without touching models']) {
  test(`model scope refuses ${request}`, () => assert.equal(cleanupIntent(request, models).ml, false));
}
test('a model-specific request cannot silently widen to every old model', () => {
  const result = cleanupIntent('Remove org/model.v2', models);
  assert.equal(result.ml, true);
  assert.equal(result.onlyNamedModels, true);
  assert.deepEqual(result.namedModels, ['org/model.v2']);
});
test('a keep clause leaves other model caches available without overriding recent use', () => {
  const result = cleanupIntent('Clean model caches, but keep org/model', models);
  assert.equal(result.ml, true);
  assert.deepEqual(result.keptModels, ['org/model']);
  assert.deepEqual(result.namedModels, []);
});
test('ordinary inactivity wording remains an authorized cleanup', () => {
  assert.equal(cleanupIntent('Remove models not used for 30 days', models).ml, true);
});
test('a quoted model question in a No answer grants no authority', () => {
  assert.equal(cleanupIntent('Sort my files (User answered "Should I clean models and Docker?" with "No")', models).docker, false);
  assert.equal(cleanupIntent('Sort my files (User answered "Should I clean models and Docker?" with "No")', models).ml, false);
});

test('declining a category question narrows the original cleanup authorization', () => {
  assert.equal(cleanupIntent('Clean unused Docker images (User answered "Remove these Docker images?" with "No, leave them")').docker, false);
  assert.equal(cleanupIntent('Clean model caches (User answered "Remove org/model?" with "No")', models).ml, false);
  assert.equal(cleanupIntent('Clean Docker (User answered "Sort your lecture notes?" with "No")').docker, true);
});
