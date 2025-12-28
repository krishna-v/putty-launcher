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
  , onExportSessionsReg: (cb) => ipcRenderer.on('menu-export-reg', () => cb())
  , onImportSessionsReg: (cb) => ipcRenderer.on('menu-import-reg', () => cb())
  , onExportSessionsJson: (cb) => ipcRenderer.on('menu-export-json', () => cb())
  , onImportSessionsJson: (cb) => ipcRenderer.on('menu-import-json', () => cb())
  , exportSessionsReg: () => ipcRenderer.invoke('export-sessions-reg')
  , importSessionsReg: () => ipcRenderer.invoke('import-sessions-reg')
  , exportSessionsJson: () => ipcRenderer.invoke('export-sessions-json')
  , importSessionsJson: () => ipcRenderer.invoke('import-sessions-json')
});
