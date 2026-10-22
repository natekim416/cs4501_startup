// Electron entry point: opens the window and connects the UI to the backend engine over IPC.
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Engine } = require('./backend/engine');

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
  return { ...engine.profile.data, home: os.homedir() };
}

function registerIpc() {
  ipcMain.handle('init', () => ({
    mode: engine.mode,
    disk: diskInfo(),
    profile: profileView(),
    demoFolder: arg('demo-folder'),
    screenshot: Boolean(arg('screenshot')),
  }));
  ipcMain.handle('pick-folder', async () => {
    const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'], defaultPath: path.join(os.homedir(), 'Downloads') });
    return res.canceled ? null : res.filePaths[0];
  });
  ipcMain.handle('scan', (_e, folder) => engine.scanFolder(folder));
  ipcMain.handle('plan', (e, request) => engine.plan(request, (attempt) => e.sender.send('attempt', attempt)));
  ipcMain.handle('answer', (e, question, choice) => engine.answer(question, choice, (attempt) => e.sender.send('attempt', attempt)));
  ipcMain.handle('execute', (_e, planId, ids) => ({ ...engine.execute(planId, ids), disk: diskInfo() }));
  ipcMain.handle('undo', () => ({ ...engine.undo(), disk: diskInfo() }));
  ipcMain.handle('set-zone', (_e, zonePath, zone) => {
    engine.profile.setZone(zonePath, zone);
    return profileView();
  });
  ipcMain.handle('set-target', (_e, destRoot) => {
    engine.profile.setTargetPlan({ destRoots: destRoot ? [destRoot] : [] });
    return profileView();
  });
  ipcMain.handle('forget', (_e, pref) => {
    engine.profile.forget(pref);
    return profileView();
  });
  ipcMain.handle('set-api-key', (_e, key) => {
    engine.apiKey = key || process.env.ANTHROPIC_API_KEY || '';
    return engine.mode;
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
  engine = new Engine({ dataDir: arg('data-dir') || app.getPath('userData') });
  // The generated demo folder is safe to change freely.
  if (arg('demo-folder')) engine.profile.setZone(arg('demo-folder'), 'free');
  registerIpc();
  createWindow();
  if (arg('ui-test')) require('./test/ui-smoke')(win, arg('ui-test'));
});

app.on('window-all-closed', () => app.quit());
