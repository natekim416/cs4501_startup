// The only bridge between the UI and the backend. The UI cannot touch files directly.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  init: () => ipcRenderer.invoke('init'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  scan: (folder) => ipcRenderer.invoke('scan', folder),
  plan: (request) => ipcRenderer.invoke('plan', request),
  answer: (question, choice) => ipcRenderer.invoke('answer', question, choice),
  execute: (planId, ids) => ipcRenderer.invoke('execute', planId, ids),
  undo: () => ipcRenderer.invoke('undo'),
  setZone: (zonePath, zone) => ipcRenderer.invoke('set-zone', zonePath, zone),
  setTarget: (destRoot) => ipcRenderer.invoke('set-target', destRoot),
  forget: (pref) => ipcRenderer.invoke('forget', pref),
  setApiKey: (key) => ipcRenderer.invoke('set-api-key', key),
  capture: () => ipcRenderer.invoke('capture'),
  onAttempt: (fn) => ipcRenderer.on('attempt', (_e, attempt) => fn(attempt)),
});
