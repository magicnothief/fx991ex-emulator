// Narrow bridge between the sandboxed renderer and the main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('host', {
  info: () => ipcRenderer.invoke('app-info'),
  checkForUpdates: () => ipcRenderer.invoke('check-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateState: (fn) => ipcRenderer.on('update-state', (_e, s) => fn(s)),
  onCommand: (fn) => ipcRenderer.on('command', (_e, c) => fn(c)),
});
