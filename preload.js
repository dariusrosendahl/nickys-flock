const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flockHost', {
  init: () => ipcRenderer.invoke('flock:init'),
  ready: () => ipcRenderer.send('flock:ready'),
  save: (data) => ipcRenderer.send('flock:save', data),
  stats: (stats) => ipcRenderer.send('flock:stats', stats),
  setCapture: (on) => ipcRenderer.send('flock:capture', !!on),
  onCursor: (fn) => ipcRenderer.on('flock:cursor', (_e, p) => fn(p)),
  onSettings: (fn) => ipcRenderer.on('flock:settings', (_e, s) => fn(s)),
  onCommand: (fn) => ipcRenderer.on('flock:command', (_e, c) => fn(c)),
});
