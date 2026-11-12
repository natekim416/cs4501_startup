// UX · What a CS student hit in the usability test (U1–U18), on the offline planner everyone without a key sees.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { tmp, write, age, makeJsProject } = require('./helpers');
const { makeDevDemo } = require('../../scripts/make-dev-demo');
const { Engine } = require('../../backend/engine');

const docker = (cmd, args) => {
  const a = args.join(' ');
  if (a.startsWith('image ls')) return '{"ID":"img2","Repository":"node","Tag":"18","Size":"1.1GB"}';
  return a.startsWith('info') ? '{}' : a.startsWith('builder du') ? 'Total: 0B' : '';
};

function student({ zone = 'free' } = {}) {
  const base = tmp();
  const home = path.join(base, 'home');
  const folder = makeDevDemo(path.join(home, 'code'));
  const hf = path.join(home, '.cache', 'huggingface', 'hub', 'models--org--old-model');
  write(path.join(hf, 'snapshots', 'a', 'w.bin'), 'w'.repeat(64 * 1024));
  age(hf, 60);
  const engine = new Engine({ dataDir: path.join(base, 'data'), apiKey: '', home, trashDir: path.join(base, 'Trash'), dockerRun: docker });
  if (zone) engine.profile.setZone(folder, zone);
  engine.profile.setZone(path.join(home, '.cache'), 'free');
  return { engine, folder, home, hf, info: engine.openFolder(folder) };
}

test('U1 "Free up space" includes Docker and old models, not just node_modules, and a GB target is answered', async () => {
  const { engine, hf } = student();
  const plan = await engine.plan('Free up 20 GB');
  const paths = plan.actions.map((a) => a.path);
  assert.ok(paths.includes('docker-image:img2'), paths.join(', '));
  assert.ok(paths.includes(hf));
  assert.match(plan.summary, /of the 20 GB you asked for/);
});

test('U2 the storage-watch estimate only counts what a plan would actually offer', async () => {
  const { engine } = student();
  const plan = await engine.plan('Free up space');
  const offered = plan.actions.reduce((n, a) => n + (a.bytes || 0), 0);
  const estimate = engine.estimateFreeable();
  assert.ok(estimate <= offered * 1.05 + 1, `estimate ${estimate} vs offered ${offered}`);
});

test('U3 a camera file like IMG_4802.png is never sorted as a class called "IMG 4802"', async () => {
  const root = tmp();
  write(path.join(root, 'IMG_4802.png'), 'x');
  write(path.join(root, 'DSC_1234.jpg'), 'y');
  write(path.join(root, 'CS4501_Lecture3.pdf'), 'z');
  const engine = new Engine({ dataDir: tmp(), apiKey: '', home: tmp(), trashDir: tmp() });
  engine.profile.setZone(root, 'free');
  engine.scanFolder(root);
  const plan = await engine.plan('Organize my downloads by class');
  const dests = plan.actions.filter((a) => a.op === 'move').map((a) => `${path.basename(a.path)} -> ${path.basename(a.dest)}`);
  assert.ok(!dests.some((d) => /IMG4802|DSC1234/.test(d)), dests.join(', '));
  assert.ok(dests.includes('CS4501_Lecture3.pdf -> CS4501'), dests.join(', '));
});

test('U4 a project the student named but that can\'t be cleaned is explained in the reply, not hidden in the try log', async () => {
  const { engine } = student();
  const plan = await engine.plan("I'm done with CS 3140 and the hackathon. Free up space.");
  assert.match(plan.summary, /hoohacks-2026/);
  assert.match(plan.summary, /uncommitted/);
});

test('U6 natural wording works: "delete my old node_modules", and "why is my disk full?" gets the breakdown', async () => {
  const { engine } = student();
  const del = await engine.plan('delete my old node_modules');
  assert.ok(del.actions.some((a) => a.op === 'delete_rebuildable'), del.summary);
  const why = await engine.plan('why is my disk full?');
  assert.ok(why.breakdown, why.summary);
  assert.strictEqual(why.actions.length, 0);
});

test('U6b naming a model works without the word "model"', async () => {
  const { engine, hf } = student();
  const plan = await engine.plan('delete old-model');
  assert.deepStrictEqual(plan.actions.map((a) => a.path), [hf]);
});

test('U5 a developer request stays on dev clutter: no Downloads quarantine or resume questions, and a class folder\'s parent counts', async () => {
  const base = tmp();
  const home = path.join(base, 'home');
  makeJsProject(path.join(home, 'school', 'CS3140'), 'hw3-webapp');
  write(path.join(home, 'Downloads', 'Resume.pdf'), 'a');
  write(path.join(home, 'Downloads', 'Resume_final.pdf'), 'bb');
  write(path.join(home, 'Downloads', 'syllabus.pdf.command'), '#!/bin/sh');
  const engine = new Engine({ dataDir: path.join(base, 'd'), apiKey: '', home, trashDir: path.join(base, 'T') });
  engine.profile.setZone(home, 'free');
  engine.openFolder(home);
  const plan = await engine.plan("I'm done with CS 3140. Free up space.");
  assert.ok(plan.actions.some((a) => a.path.includes('hw3-webapp')), plan.actions.map((a) => a.path).join(', '));
  assert.ok(plan.actions.every((a) => a.op === 'delete_rebuildable'), plan.actions.map((a) => a.op).join(', '));
  assert.ok(!plan.questions.some((q) => /Resume/.test(q.text)), plan.questions.map((q) => q.text).join(' | '));
});

test('U7 an old model is not marked "still active" because its cache folder changed', async () => {
  const { engine, hf } = student();
  const plan = await engine.plan('Delete my old hugging face models');
  const a = plan.actions.find((x) => x.path === hf);
  assert.ok(a && a.checked !== false && !a.note, JSON.stringify(a));
});

test('U8 a folder with no zone says why everything starts unchecked, and each action carries its size', async () => {
  const { engine } = student({ zone: null });
  const plan = await engine.plan('Free up space');
  assert.ok(plan.actions.length && plan.actions.every((a) => plan.needsApproval.includes(a.id) || a.op === 'remove_docker' || a.path.includes('.cache')));
  assert.match(plan.summary, /no zone yet|starts unchecked|FREE/);
  assert.ok(plan.actions.every((a) => Number.isFinite(a.bytes)));
});

test('U14 picking a project from the question never shows the internal "(User picked …)" text', async () => {
  const { engine } = student();
  const first = await engine.plan("I'm done with something. Free up space.");
  const q = first.questions.find((x) => /Which projects/.test(x.text));
  const after = await engine.answer(q.text, 'cs3140-hw1');
  assert.doesNotMatch(after.summary, /User picked|User answered/);
});

test('U16 the breakdown calls them folders, labels Docker as unused, and ends with a next step', async () => {
  const { engine } = student();
  const res = await engine.plan('Where did my space go?');
  assert.match(res.summary, /Largest folders/);
  assert.match(res.summary, /Docker \(unused\)/);
  assert.match(res.summary, /free up space/i);
});

test('U18 with no API key, local mode says it is already offline instead of "slower"', () => {
  const engine = new Engine({ dataDir: tmp(), apiKey: '', home: tmp(), trashDir: tmp() });
  assert.match(engine.setLocalMode(true), /already offline/i);
});

test('U13 "always keep X and free up space" saves the protection and still plans the cleanup', async () => {
  const { engine } = student();
  const res = await engine.plan('Always keep cs3140-final and free up space');
  assert.ok((engine.profile.data.protected || []).includes('cs3140-final'));
  assert.ok(res.actions.length > 0, res.summary);
  assert.ok(!res.actions.some((a) => a.path.includes('cs3140-final')));
});
