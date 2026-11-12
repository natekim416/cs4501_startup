// Electron entry point: opens the window and connects the UI to the backend engine over IPC.
const { app, BrowserWindow, ipcMain, dialog, Notification } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Engine } = require('./backend/engine');
const { makeDemoFolder } = require('./scripts/make-demo-folder');

// Load the API key from the repo's root .env, if there is one. A key already set in the shell wins.
// The key stays in this (main) process; the window never sees it and has no way to set one.
try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch {
  // No .env file: the app runs in demo mode with the offline planner.
}

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

let win;
let engine;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: arg('screenshot') ? 1080 : 900,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#1B1A2E',
    title: 'Cleanasaurus',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  // The window only ever shows our own page: no navigating away, no new windows (red-team F15).
  win.webContents.on('will-navigate', (e, url) => {
    if (url.split('#')[0] !== INDEX_URL) e.preventDefault();
  });
  win.webContents.on('will-frame-navigate', (e) => {
    if (e.url.split('#')[0] !== INDEX_URL) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-attach-webview', (e) => e.preventDefault());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

const INDEX_URL = require('url').pathToFileURL(path.join(__dirname, 'renderer', 'index.html')).href;

// Every request must come from our own page. Anything else gets an error and does nothing (F15).
function handle(channel, fn) {
  ipcMain.handle(channel, (e, ...args) => {
    const from = e.senderFrame && e.senderFrame.url.split('#')[0];
    if (from !== INDEX_URL) throw new Error('Blocked: that request did not come from Cleanasaurus.');
    return fn(e, ...args);
  });
}

function diskInfo() {
  try {
    const s = fs.statfsSync(os.homedir());
    return { total: s.blocks * s.bsize, free: s.bavail * s.bsize };
  } catch {
    return null;
  }
}

function profileView() {
  // FEAT-01: locked zones are marked so the page can say why they can't change. The backend enforces it either way.
  const zones = engine.profile.data.zones.map((z) => ({ ...z, locked: engine.profile.isLocked(z.path) }));
  return { ...engine.profile.data, zones, home: os.homedir() };
}

// A refused zone change comes back as { error } with the reason, and nothing is saved.
function zoneChange(change) {
  try {
    change();
    return profileView();
  } catch (err) {
    return { error: err.message };
  }
}

function registerIpc() {
  handle('init', () => ({
    mode: engine.mode,
    disk: diskInfo(),
    profile: profileView(),
    usage: engine.usage.status(),
    demoFolder: arg('demo-folder'),
    screenshot: Boolean(arg('screenshot')),
    screenshotRequest: arg('screenshot-request'),
  }));
  handle('pick-folder', async () => {
    const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'], defaultPath: path.join(os.homedir(), 'Downloads') });
    return res.canceled ? null : res.filePaths[0];
  });
  handle('scan', (_e, folder) => engine.openFolder(folder));
  // The guided demo always runs on a fresh practice folder outside the user's real files.
  handle('prepare-tour', () => {
    const folder = makeDemoFolder(path.join(os.tmpdir(), 'cleanasaurus-tour', 'Downloads'));
    engine.practiceFolders.add(folder);
    engine.profile.setZone(folder, 'free');
    engine.profile.data.preferences = engine.profile.data.preferences.filter((p) => !p.includes('versions of'));
    engine.profile.save();
    return { folder, profile: profileView() };
  });
  handle('plan', (e, request) => engine.plan(request, (attempt) => e.sender.send('attempt', attempt)));
  handle('answer', (e, question, choice) => engine.answer(question, choice, (attempt) => e.sender.send('attempt', attempt)));
  handle('execute', (_e, planId, ids, opts) => ({ ...engine.execute(planId, ids, opts), disk: diskInfo() }));
  handle('undo', () => ({ ...engine.undo(), disk: diskInfo() }));
  handle('undo-one', (_e, batchId, actionId) => ({ ...engine.undoAction(batchId, actionId), disk: diskInfo() }));
  handle('rebuild', (_e, recipe) => ({ ...engine.rebuild(recipe), disk: diskInfo() }));
  handle('set-zone', (_e, zonePath, zone) => zoneChange(() => engine.profile.setZone(zonePath, zone)));
  handle('change-zone', (_e, zonePath, zone) => zoneChange(() => engine.profile.changeZone(zonePath, zone)));
  handle('set-target', (_e, destRoot) => {
    engine.profile.setTargetPlan({ destRoots: destRoot ? [destRoot] : [] });
    return profileView();
  });
  handle('forget', (_e, pref) => {
    engine.profile.forget(pref);
    return profileView();
  });
  // US-04: names are checked in the backend; a refused one comes back as { error } and nothing is saved.
  handle('protect', (_e, names) => {
    try {
      return { ...engine.protect(names), profile: profileView() };
    } catch (err) {
      return { error: err.message };
    }
  });
  handle('unprotect', (_e, name) => {
    engine.profile.unprotect(name);
    return profileView();
  });
  handle('set-usage', (_e, on) => engine.usage.setEnabled(on));
  handle('go-pro', () => engine.usage.goPro());
  handle('export-usage', async () => {
    const res = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('desktop'), 'cleanasaurus-usage-log.jsonl') });
    if (res.canceled || !res.filePath) return null;
    engine.usage.exportTo(res.filePath);
    return res.filePath;
  });
  // Used by `npm run screenshot` to capture the window for slides.
  handle('capture', async () => {
    const out = arg('screenshot');
    const image = await win.webContents.capturePage();
    fs.writeFileSync(out, image.toPNG());
    app.quit();
  });
}

// US-16: checks the disk every hour. Past 85% full it sends one notification; clicking it opens a plan
// preview in the app. Nothing runs until the user approves, and closing it counts as a dismissal.
function startStorageWatch() {
  const { StorageWatch } = require('./backend/storage-watch');
  const watch = new StorageWatch({
    enabled: engine.profile.data.storageWatch !== false,
    estimate: () => engine.estimateFreeable(),
    stateFile: path.join(engine.dataDir, 'storage-watch.json'),
    notify: (n) => {
      if (!Notification.isSupported()) return;
      const note = new Notification({ title: 'Cleanasaurus', body: n.text });
      note.on('click', () => {
        win.show();
        win.focus();
        win.webContents.send('storage-watch', n);
      });
      note.on('close', () => watch.dismiss());
      note.show();
    },
  });
  const tick = () => {
    const d = diskInfo();
    if (d && d.total) watch.check({ usedFraction: 1 - d.free / d.total });
  };
  tick();
  setInterval(tick, 60 * 60 * 1000);
}

app.whenReady().then(() => {
  // Removed duplicates go to the macOS Trash (US-13); tests pass --trash-dir to keep the real Trash clean.
  // --home points the Xcode check (US-08) and the package caches at a fake home folder; the UI test uses it.
  engine = new Engine({ dataDir: arg('data-dir') || app.getPath('userData'), trashDir: arg('trash-dir') || path.join(os.homedir(), '.Trash'), home: arg('home') || os.homedir() });
  // The generated demo folder is safe to change freely.
  if (arg('demo-folder')) {
    engine.profile.setZone(arg('demo-folder'), 'free');
    engine.practiceFolders.add(arg('demo-folder'));
  }
  registerIpc();
  createWindow();
  engine.usage.onChange = () => win.webContents.send('usage', engine.usage.status());
  if (!arg('ui-test') && !arg('tour-test') && !arg('screenshot')) startStorageWatch();
  if (arg('ui-test')) require('./test/ui-smoke')(win, arg('ui-test'));
  if (arg('tour-test')) require('./test/tour-check')(win, arg('tour-test'));
});

app.on('window-all-closed', () => app.quit());
