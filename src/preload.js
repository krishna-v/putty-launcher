const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  setPuttyPath: (p) => ipcRenderer.invoke('set-putty-path', p),
  openExeDialog: () => ipcRenderer.invoke('open-exe-dialog'),
  launchPutty: (opts) => ipcRenderer.invoke('launch-putty', opts),
  listPuttySessions: () => ipcRenderer.invoke('list-putty-sessions'),
  listPuttySessionsTree: () => ipcRenderer.invoke('list-putty-sessions-tree')
  , setSessionCategory: (sessionName, categoryPath) => ipcRenderer.invoke('set-session-category', sessionName, categoryPath)
  , getSessionCategory: (sessionName) => ipcRenderer.invoke('get-session-category', sessionName)
  , onOpenNewSession: (cb) => ipcRenderer.on('open-new-session', () => cb())
  , onOpenSettings: (cb) => ipcRenderer.on('open-settings', () => cb())
});
