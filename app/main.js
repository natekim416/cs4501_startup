// Electron entry point: opens the window and connects the UI to the backend engine over IPC.
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
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
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
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
  ipcMain.handle('init', () => ({
    mode: engine.mode,
    disk: diskInfo(),
    profile: profileView(),
    usage: engine.usage.status(),
    demoFolder: arg('demo-folder'),
    screenshot: Boolean(arg('screenshot')),
    screenshotRequest: arg('screenshot-request'),
  }));
  ipcMain.handle('pick-folder', async () => {
    const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'], defaultPath: path.join(os.homedir(), 'Downloads') });
    return res.canceled ? null : res.filePaths[0];
  });
  ipcMain.handle('scan', (_e, folder) => engine.openFolder(folder));
  // The guided demo always runs on a fresh practice folder outside the user's real files.
  ipcMain.handle('prepare-tour', () => {
    const folder = makeDemoFolder(path.join(os.tmpdir(), 'cleanasaurus-tour', 'Downloads'));
    engine.practiceFolders.add(folder);
    engine.profile.setZone(folder, 'free');
    engine.profile.data.preferences = engine.profile.data.preferences.filter((p) => !p.includes('versions of'));
    engine.profile.save();
    return { folder, profile: profileView() };
  });
  ipcMain.handle('plan', (e, request) => engine.plan(request, (attempt) => e.sender.send('attempt', attempt)));
  ipcMain.handle('answer', (e, question, choice) => engine.answer(question, choice, (attempt) => e.sender.send('attempt', attempt)));
  ipcMain.handle('execute', (_e, planId, ids, opts) => ({ ...engine.execute(planId, ids, opts), disk: diskInfo() }));
  ipcMain.handle('undo', () => ({ ...engine.undo(), disk: diskInfo() }));
  ipcMain.handle('undo-one', (_e, batchId, actionId) => ({ ...engine.undoAction(batchId, actionId), disk: diskInfo() }));
  ipcMain.handle('rebuild', (_e, recipe) => ({ ...engine.rebuild(recipe), disk: diskInfo() }));
  ipcMain.handle('set-zone', (_e, zonePath, zone) => zoneChange(() => engine.profile.setZone(zonePath, zone)));
  ipcMain.handle('change-zone', (_e, zonePath, zone) => zoneChange(() => engine.profile.changeZone(zonePath, zone)));
  ipcMain.handle('set-target', (_e, destRoot) => {
    engine.profile.setTargetPlan({ destRoots: destRoot ? [destRoot] : [] });
    return profileView();
  });
  ipcMain.handle('forget', (_e, pref) => {
    engine.profile.forget(pref);
    return profileView();
  });
  // US-04: names are checked in the backend; a refused one comes back as { error } and nothing is saved.
  ipcMain.handle('protect', (_e, names) => {
    try {
      return { ...engine.protect(names), profile: profileView() };
    } catch (err) {
      return { error: err.message };
    }
  });
  ipcMain.handle('unprotect', (_e, name) => {
    engine.profile.unprotect(name);
    return profileView();
  });
  ipcMain.handle('set-usage', (_e, on) => engine.usage.setEnabled(on));
  ipcMain.handle('export-usage', async () => {
    const res = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('desktop'), 'cleanasaurus-usage-log.jsonl') });
    if (res.canceled || !res.filePath) return null;
    engine.usage.exportTo(res.filePath);
    return res.filePath;
  });
  // Used by `npm run screenshot` to capture the window for slides.
  ipcMain.handle('capture', async () => {
    const out = arg('screenshot');
    const image = await win.webContents.capturePage();
    fs.writeFileSync(out, image.toPNG());
    app.quit();
  });
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
  if (arg('ui-test')) require('./test/ui-smoke')(win, arg('ui-test'));
  if (arg('tour-test')) require('./test/tour-check')(win, arg('tour-test'));
});

app.on('window-all-closed', () => app.quit());
