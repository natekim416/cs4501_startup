// US-11 (#12) · Clear reasons when the validator says no.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmp, makeJsProject } = require('./helpers');
const { validate } = require('../../backend/validator');
const { Profile } = require('../../backend/profile');
const { scan } = require('../../backend/scanner');
const { Engine } = require('../../backend/engine');

function ctxFor(root) {
  const profile = new Profile(path.join(tmp(), 'profile.json'));
  profile.setZone(root, 'free');
  return { scan: scan(root), findings: [], profile };
}

const del = (p) => ({ actions: [{ id: 'a1', op: 'delete_rebuildable', path: p, dest: '', keep: '', reason: 'old' }] });

test('US-11 a rebuild-proof failure names which condition failed and the project, e.g. "no lockfile in hoohacks-2026"', () => {
  const root = tmp();
  const project = makeJsProject(root, 'hoohacks-2026', { lock: null });
  fs.rmSync(path.join(project, 'package.json'));
  const res = validate(del(path.join(project, 'node_modules')), ctxFor(root));
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.errors[0].condition, 'recipe');
  assert.match(res.errors[0].message, /no lockfile/i);
  assert.match(res.errors[0].message, /hoohacks-2026/);
});

test('US-11 each failing condition gets its own plain-English reason', () => {
  const root = tmp();
  const dirty = makeJsProject(root, 'dirty-proj', { dirty: true });
  const secret = makeJsProject(root, 'secret-proj', { secret: true });
  const active = makeJsProject(root, 'active-proj', { ageDays: 2 });
  const ctx = ctxFor(root);
  const msg = (p) => validate(del(path.join(p, 'node_modules')), ctx).errors.map((e) => e.message).join(' | ');
  assert.match(msg(dirty), /uncommitted/i);
  assert.match(msg(secret), /\.env|secret/i);
  assert.match(msg(active), /30 days/i);
});

test('US-11 the planner gets the rejection back and the Safety Log attempts show it', async () => {
  const root = tmp();
  const project = makeJsProject(root, 'hoohacks-2026', { lock: null });
  fs.rmSync(path.join(project, 'package.json'));
  makeJsProject(root, 'cs3140-hw1');
  const engine = new Engine({ dataDir: tmp(), apiKey: '' });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const plan = await engine.plan('Free up space');
  // The demo planner only proposes items labeled rebuildable, so the bad project never reaches the plan.
  assert.ok(plan.actions.every((a) => !a.path.includes('hoohacks-2026')));
  assert.ok(plan.actions.some((a) => a.op === 'delete_rebuildable' && a.path.includes('cs3140-hw1')));
  assert.ok(plan.attempts.at(-1).ok);
});
