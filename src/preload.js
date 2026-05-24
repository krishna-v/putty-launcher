const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),
  setConfigValue: (key, value) => ipcRenderer.invoke('set-config-value', key, value),
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
  , onRefreshSessions: (cb) => ipcRenderer.on('menu-refresh-sessions', () => cb())
  , onCloneSession: (cb) => ipcRenderer.on('menu-clone-session', () => cb())
  , onLaunchSession: (cb) => ipcRenderer.on('menu-launch-session', () => cb())
  , onRenameSession: (cb) => ipcRenderer.on('menu-rename-session', () => cb())
  , onDeleteSession: (cb) => ipcRenderer.on('menu-delete-session', () => cb())
  , updateSessionMenuState: (hasSelection) => ipcRenderer.invoke('update-session-menu-state', hasSelection)
  , exportSessionsReg: () => ipcRenderer.invoke('export-sessions-reg')
  , importSessionsReg: () => ipcRenderer.invoke('import-sessions-reg')
  , exportSessionsJson: () => ipcRenderer.invoke('export-sessions-json')
  , importSessionsJson: () => ipcRenderer.invoke('import-sessions-json')
  , reloadSessions: () => ipcRenderer.invoke('reload-sessions')
  , getSessionValues: (sessionName) => ipcRenderer.invoke('get-session-values', sessionName)
  , saveSessionValues: (sessionName, values) => ipcRenderer.invoke('save-session-values', sessionName, values)
  , renameSession: (oldName, newName) => ipcRenderer.invoke('rename-session', oldName, newName)
  , deleteSession: (sessionName) => ipcRenderer.invoke('delete-session', sessionName)
  , previewImportReg: () => ipcRenderer.invoke('preview-import-reg')
  , previewImportJson: () => ipcRenderer.invoke('preview-import-json')
  , importSelectedSessions: (data) => ipcRenderer.invoke('import-selected-sessions', data)
  , createTempSessionReg: (sessionName, values) => ipcRenderer.invoke('create-temp-session-reg', sessionName, values)
});
