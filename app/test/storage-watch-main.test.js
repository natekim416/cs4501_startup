// Exercise the real Electron wiring with fake OS notifications and disk readings.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');
const { StorageWatch } = require('../backend/storage-watch');

async function launch({ saved, supported = true, notificationFails = false, disk = { blocks: 100, bavail: 10, bsize: 1 } } = {}) {
  const handlers = new Map();
  const sent = [];
  const notifications = [];
  const timers = [];
  const calls = { save: 0, execute: 0, plan: 0, focus: 0, show: 0 };
  let engine;
  let window;
  class FakeEngine {
    constructor() {
      engine = this;
      this.folder = null;
      this.mode = 'demo';
      this.profile = { data: { zones: [], storageWatch: saved }, isLocked: () => false, save: () => calls.save++, setZone: () => {}, changeZone: () => {}, unprotect: () => {} };
      this.usage = { status: () => ({}), onChange: () => {} };
      this.practiceFolders = new Set();
    }
    openFolder(folder) { this.folder = folder; return { folder }; }
    storageEstimate() { return 18e9; }
    plan() { calls.plan++; }
    execute() { calls.execute++; }
    protect() { return { saved: ['private-project'] }; }
  }
  class FakeWindow extends EventEmitter {
    constructor() {
      super();
      window = this;
      this.webContents = new EventEmitter();
      this.webContents.isDestroyed = () => false;
      this.webContents.setWindowOpenHandler = () => {};
      this.webContents.send = (channel, value) => sent.push({ channel, value });
    }
    loadFile() { setImmediate(() => this.webContents.emit('did-finish-load')); }
    isDestroyed() { return false; }
    show() { calls.show++; }
    focus() { calls.focus++; }
  }
  class FakeNotification extends EventEmitter {
    static isSupported() { return supported; }
    constructor(options) { super(); this.options = options; notifications.push(this); }
    show() { if (notificationFails) throw new Error('OS notifications disabled'); }
    close() { this.emit('close'); }
  }
  const app = new EventEmitter();
  app.whenReady = () => Promise.resolve();
  app.getPath = () => '/test/data';
  app.quit = () => {};
  const context = {
    require: (name) => {
      if (name === 'electron') return { app, BrowserWindow: FakeWindow, Notification: FakeNotification, ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) }, dialog: {} };
      if (name === './backend/engine') return { Engine: FakeEngine };
      if (name === './backend/storage-watch') return { StorageWatch };
      if (name === './scripts/make-demo-folder') return {};
      if (name === 'fs') return { statfsSync: () => { if (disk instanceof Error) throw disk; return disk; } };
      return require(name);
    },
    process: { argv: ['electron'], env: {}, loadEnvFile: () => {} },
    module: { exports: {} }, __dirname: path.join(__dirname, '..'),
    setInterval: (fn, ms) => { const timer = { fn, ms, unref: () => {} }; timers.push(timer); return timer; },
    clearInterval: (timer) => { timer.cleared = true; },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8'), context);
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  const event = { senderFrame: { url: require('url').pathToFileURL(path.join(__dirname, '..', 'renderer', 'index.html')).href } };
  return { call: (channel, ...args) => handlers.get(channel)(event, ...args), handlers, sent, notifications, timers, calls, engine, window, app };
}

test('US-16 main is off by default, schedules only a cheap minute check, and clears it on quit', async () => {
  const h = await launch();
  assert.equal(h.call('init').storageWatch.enabled, false);
  assert.equal(h.notifications.length, 0);
  assert.equal(h.timers[0].ms, 60_000);
  h.timers[0].fn();
  assert.equal(h.notifications.length, 0);
  h.app.emit('before-quit');
  assert.equal(h.timers[0].cleared, true);
});

test('US-16 native click focuses the app and sends a preview event without planning or executing', async () => {
  const h = await launch();
  h.call('scan', '/test/projects');
  h.call('set-storage-watch', true);
  assert.equal(h.notifications.length, 1);
  assert.match(h.notifications[0].options.body, /18 GB/);
  h.notifications[0].emit('click');
  assert.ok(h.sent.some((e) => e.channel === 'storage-preview'));
  assert.equal(h.calls.focus, 1);
  assert.equal(h.calls.show, 1);
  assert.equal(h.calls.plan, 0);
  assert.equal(h.calls.execute, 0);
  assert.equal(h.engine.profile.data.storageWatch.enabled, true);
});

test('US-16 OS notification failure or unsupported OS still leaves the in-app reminder', async () => {
  for (const options of [{ supported: false }, { notificationFails: true }]) {
    const h = await launch(options);
    h.call('set-storage-watch', true);
    assert.ok(h.sent.some((e) => e.channel === 'storage-alert'));
    assert.match(h.call('init').storageWatch.notice.text, /Choose a folder/);
  }
});

test('US-16 disabling clears the reminder, ignores late native clicks, and survives restart', async () => {
  const h = await launch();
  h.call('set-storage-watch', true);
  h.call('set-storage-watch', false);
  assert.equal(h.call('init').storageWatch.notice, null);
  h.notifications[0].emit('click');
  assert.equal(h.calls.focus, 0);
  h.timers[0].fn();
  assert.equal(h.notifications.length, 1);
  const restarted = await launch({ saved: h.engine.profile.data.storageWatch });
  assert.equal(restarted.call('init').storageWatch.enabled, false);
  assert.equal(restarted.notifications.length, 0);
});

test('US-16 dismissal clears the banner and persists a cooldown across restart', async () => {
  const h = await launch();
  h.call('set-storage-watch', true);
  assert.equal(h.call('dismiss-storage-watch').notice, null);
  const restarted = await launch({ saved: h.engine.profile.data.storageWatch });
  assert.equal(restarted.notifications.length, 0);
  assert.equal(restarted.call('init').storageWatch.enabled, true);
});

test('US-16 unavailable or invalid disk measurements do not send notifications', async () => {
  for (const disk of [new Error('statfs denied'), { blocks: 0, bavail: 0, bsize: 1 }, { blocks: 1, bavail: 2, bsize: 1 }, { blocks: NaN, bavail: 0, bsize: 1 }]) {
    const h = await launch({ saved: { enabled: true }, disk });
    assert.equal(h.notifications.length, 0);
  }
});

test('US-16 preference IPC rejects non-booleans and requests from a foreign page', async () => {
  const h = await launch();
  assert.throws(() => h.call('set-storage-watch', 'yes'), /on or off/);
  assert.throws(() => h.handlers.get('set-storage-watch')({ senderFrame: { url: 'https://evil.example' } }, true), /Blocked/);
  assert.equal(h.call('init').storageWatch.enabled, false);
});

test('US-16 changing zones or project protections invalidates an old estimate and clears its reminder', async () => {
  const h = await launch();
  h.call('set-storage-watch', true);
  assert.ok(h.call('init').storageWatch.notice);
  for (const [channel, ...args] of [['set-zone', '/test/projects', 'never'], ['change-zone', '/test/projects', 'ask'], ['protect', ['private-project']], ['unprotect', 'private-project']]) {
    h.engine.cachedStorageEstimate = 100;
    h.call(channel, ...args);
    assert.equal(h.engine.cachedStorageEstimate, null);
    assert.equal(h.call('init').storageWatch.notice, null);
  }
  assert.ok(h.sent.some((e) => e.channel === 'storage-alert' && e.value === null));
});
