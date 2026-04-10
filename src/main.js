const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { spawn, exec } = require('child_process');

const CONFIG_FILE = 'putty-launcher.json';

function getConfigPath() {
  return path.join(app.getPath('userData'), CONFIG_FILE);
}

async function readConfig() {
  try {
    const p = getConfigPath();
    const data = await fs.readFile(p, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return {};
  }
}

async function writeConfig(obj) {
  const p = getConfigPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(obj, null, 2), 'utf8');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 400,
    height: 800,
    icon: path.join(__dirname, 'launcher.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });
  // win.webContents.openDevTools()
  win.loadFile(path.join(__dirname, 'index.html'));

  // Application menu with File -> New Session
  try {
    const template = [
      {
        label: 'File',
        submenu: [
          { label: 'New Session', accelerator: 'CmdOrCtrl+N', click: () => { win.webContents.send('open-new-session'); } },
          { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => { win.webContents.send('open-settings'); } },
          { type: 'separator' },
          { label: 'Export Sessions (.reg)', click: () => { win.webContents.send('menu-export-reg'); } },
          { label: 'Export Sessions (.json)', click: () => { win.webContents.send('menu-export-json'); } },
          { label: 'Import Sessions (.reg)', click: () => { win.webContents.send('menu-import-reg'); } },
          { label: 'Import Sessions (.json)', click: () => { win.webContents.send('menu-import-json'); } },
          { type: 'separator' },
          { role: 'quit' }
        ]
      }
    ];
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  } catch (e) {
    // ignore menu errors on platforms without menu support
  }
}

// In-memory cache of sessions: map of encodedKey -> { session, values }
let sessionsCache = {};

function regQueryRaw(key, flags = '') {
  return new Promise((resolve) => {
    const cmd = `reg query "${key}" ${flags}`.trim();
    exec(cmd, { windowsHide: true }, (err, stdout, stderr) => {
      resolve({ err, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

async function loadSessionsFromRegistry() {
  if (process.platform !== 'win32') {
    sessionsCache = {};
    return sessionsCache;
  }
  const baseKey = 'HKCU\\Software\\SimonTatham\\PuTTY\\Sessions';
  const res = await regQueryRaw(baseKey, '/s');
  const map = {};
  if (!res.stdout) {
    sessionsCache = map;
    return sessionsCache;
  }
  const lines = res.stdout.split(/\r?\n/);
  const prefix = 'HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\';
  let currentKey = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('HKEY_')) {
      currentKey = line;
      if (!currentKey.startsWith(prefix)) {
        currentKey = null;
      } else {
        const suffix = currentKey.slice(prefix.length);
        if (!map[suffix]) {
          const decoded = (() => { try { return decodeURIComponent(suffix); } catch (e) { return suffix; } })();
          map[suffix] = { session: decoded, values: {} };
        }
      }
      continue;
    }
    if (!currentKey) continue;
    const parts = rawLine.split(/\s{2,}|\t+/).filter(Boolean);
    if (parts.length >= 2) {
      let name = parts[0];
      const type = parts[1];
      const value = parts.slice(2).join(' ') || '';
      if (name === '(Default)') name = '';
      const suffix = currentKey.slice(prefix.length);
      if (!map[suffix]) {
        const decoded = (() => { try { return decodeURIComponent(suffix); } catch (e) { return suffix; } })();
        map[suffix] = { session: decoded, values: {} };
      }
      map[suffix].values[name] = { type, value };
    }
  }
  sessionsCache = map;
  return sessionsCache;
}

app.whenReady().then(async () => { await loadSessionsFromRegistry(); createWindow(); });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC handlers
ipcMain.handle('get-config', async () => {
  return await readConfig();
});

ipcMain.handle('set-putty-path', async (event, puttyPath) => {
  const cfg = await readConfig();
  cfg.puttyPath = puttyPath;
  await writeConfig(cfg);
  return cfg;
});

ipcMain.handle('open-exe-dialog', async () => {
  const win = BrowserWindow.getFocusedWindow();
  const res = await dialog.showOpenDialog(win, {
    title: 'Select PuTTY executable',
    properties: ['openFile'],
    filters: [{ name: 'Executables', extensions: ['exe'] }]
  });
  if (res.canceled) return null;
  return res.filePaths[0];
});

ipcMain.handle('list-putty-sessions', async () => {
  if (process.platform !== 'win32') return [];
  // use in-memory cache
  const arr = Object.values(sessionsCache || {}).map(s => s.session || '').filter(Boolean);
  arr.sort((a,b)=> a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return arr;
});

ipcMain.handle('list-putty-sessions-tree', async () => {
  if (process.platform !== 'win32') return { name: '', children: {}, sessions: [] };
  const root = { name: '', children: {}, sessions: [] };
  function addToTree(node, parts, session) {
    if (parts.length === 0) {
      node.sessions.push(session);
      return;
    }
    const [head, ...rest] = parts;
    if (!node.children[head]) node.children[head] = { name: head, children: {}, sessions: [] };
    addToTree(node.children[head], rest, session);
  }

  Object.values(sessionsCache || {}).forEach((entry) => {
    const decoded = entry.session;
    const categoryValue = (entry.values && (entry.values['Category'] && entry.values['Category'].value)) ? entry.values['Category'].value : '';
    let pathParts = ['<None>'];
    if (categoryValue) {
      pathParts = categoryValue.split('/').map(p => p.trim()).filter(Boolean);
      if (pathParts.length === 0) pathParts = ['<None>'];
    }
    addToTree(root, pathParts, decoded);
  });

  function sortNode(node) {
    Object.keys(node.children).forEach(k => sortNode(node.children[k]));
    node.sessions.sort((a,b)=> a.localeCompare(b, undefined, { sensitivity: 'base' }));
    const sortedChildren = {};
    Object.keys(node.children).sort((a,b)=> a.localeCompare(b, undefined, { sensitivity: 'base' })).forEach(k => { sortedChildren[k] = node.children[k]; });
    node.children = sortedChildren;
  }
  sortNode(root);
  return root;
});

ipcMain.handle('launch-putty', async (event, opts) => {
  const cfg = await readConfig();
  const putty = cfg.puttyPath || 'putty.exe';
  const args = [];
  if (opts.session) {
    args.push('-load', opts.session);
  } else {
    if (opts.username && opts.host) {
      args.push('-ssh', `${opts.username}@${opts.host}`);
    } else if (opts.host) {
      args.push('-ssh', opts.host);
    }
    if (opts.port) args.push('-P', String(opts.port));
  }

  try {
    const child = spawn(putty, args, { detached: true, stdio: 'ignore' });
    child.unref();
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
});

// set or update Category value for a session
ipcMain.handle('set-session-category', async (event, sessionName, categoryPath) => {
  if (process.platform !== 'win32') return { success: false, error: 'Not supported on this platform' };
  try {
    const baseKey = 'HKCU\\Software\\SimonTatham\\PuTTY\\Sessions';
    const enc = encodeURIComponent(sessionName);
    const fullKey = `${baseKey}\\${enc}`;
    const safe = String(categoryPath || '');
    await new Promise((resolve, reject) => {
      exec(`reg add "${fullKey}" /v Category /t REG_SZ /d "${safe}" /f`, { windowsHide: true }, (err, stdout, stderr) => {
        if (err) return reject(err);
        resolve();
      });
    });
    // reload cache to keep in-memory state in sync
    await loadSessionsFromRegistry();
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
});

ipcMain.handle('get-session-category', async (event, sessionName) => {
  if (process.platform !== 'win32') return { success: false, error: 'Not supported on this platform', category: '' };
  try {
    const enc = encodeURIComponent(sessionName);
    const entry = sessionsCache[enc];
    const category = (entry && entry.values && entry.values['Category'] && entry.values['Category'].value) ? entry.values['Category'].value : '';
    return { success: true, category };
  } catch (e) {
    return { success: false, error: String(e), category: '' };
  }
});

// return all values for a session from the in-memory cache
ipcMain.handle('get-session-values', async (event, sessionName) => {
  if (process.platform !== 'win32') return { success: false, error: 'Not supported on this platform', values: {} };
  try {
    const enc = encodeURIComponent(sessionName);
    const entry = sessionsCache[enc];
    return { success: true, values: entry ? entry.values : {} };
  } catch (e) {
    return { success: false, error: String(e), values: {} };
  }
});

// save provided values for a session (adds/updates values). Accepts payload { set: {...}, delete: [...] }
ipcMain.handle('save-session-values', async (event, sessionName, payload) => {
  if (process.platform !== 'win32') return { success: false, error: 'Not supported on this platform' };
  try {
    const enc = encodeURIComponent(sessionName);
    const keyPath = `HKCU\\Software\\SimonTatham\\PuTTY\\Sessions\\${enc}`;
    // ensure key exists
    await new Promise((resolve, reject) => {
      exec(`reg add "${keyPath}" /f`, { windowsHide: true }, (err) => { if (err) return reject(err); resolve(); });
    });
    const sets = (payload && payload.set) ? payload.set : payload || {};
    const dels = (payload && Array.isArray(payload.delete)) ? payload.delete : [];

    // set each provided value
    for (const vn of Object.keys(sets || {})) {
      const v = sets[vn] || {};
      const typ = (v.type || 'REG_SZ');
      const dat = (v.value !== undefined && v.value !== null) ? String(v.value) : '';
      await new Promise((resolve, reject) => {
        if (vn === '' || vn === '(Default)' || vn === '@') {
          exec(`reg add "${keyPath}" /ve /t ${typ} /d "${dat}" /f`, { windowsHide: true }, (err) => { if (err) return reject(err); resolve(); });
        } else {
          exec(`reg add "${keyPath}" /v "${vn}" /t ${typ} /d "${dat}" /f`, { windowsHide: true }, (err) => { if (err) return reject(err); resolve(); });
        }
      });
    }

    // delete specified values
    for (const vn of dels) {
      await new Promise((resolve, reject) => {
        if (vn === '' || vn === '(Default)' || vn === '@') {
          exec(`reg delete "${keyPath}" /ve /f`, { windowsHide: true }, (err) => { if (err) return reject(err); resolve(); });
        } else {
          exec(`reg delete "${keyPath}" /v "${vn}" /f`, { windowsHide: true }, (err) => { if (err) return reject(err); resolve(); });
        }
      });
    }

    // reload cache to reflect changes
    await loadSessionsFromRegistry();
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
});

// Export entire Sessions registry subtree to a .reg file
ipcMain.handle('export-sessions-reg', async () => {
  if (process.platform !== 'win32') return { success: false, error: 'Not supported on this platform' };
  const win = BrowserWindow.getFocusedWindow();
  const { canceled, filePath } = await dialog.showSaveDialog(win, { title: 'Export PuTTY Sessions (.reg)', defaultPath: 'putty-sessions.reg', filters: [{ name: 'Registry Files', extensions: ['reg'] }] });
  if (canceled || !filePath) return { success: false, error: 'cancelled' };

  // Build .reg content from in-memory cache
  const header = 'Windows Registry Editor Version 5.00\r\n\r\n';
  const prefix = 'HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\';
  const lines = [header];
  const entries = Object.entries(sessionsCache || {});
  // sort by decoded session name
  entries.sort((a,b)=> {
    const sa = a[1].session || '';
    const sb = b[1].session || '';
    return sa.localeCompare(sb, undefined, { sensitivity: 'base' });
  });
  for (const [suffix, entry] of entries) {
    const keyPath = prefix + suffix;
    lines.push('[' + keyPath + ']');
    const vals = entry.values || {};
    for (const vn of Object.keys(vals)) {
      const v = vals[vn] || {};
      const type = (v.type || '').toUpperCase();
      const raw = v.value !== undefined && v.value !== null ? String(v.value) : '';
      // default value
      const nameLit = (vn === '' ? '@' : `"${vn.replace(/\\/g,'\\\\').replace(/"/g,'\\"')}"`);
      if (type.includes('DWORD')) {
        // convert 0x... or decimal to 8-digit hex
        let num = 0;
        if (/^0x/i.test(raw)) num = parseInt(raw, 16);
        else if (/^\d+$/.test(raw)) num = parseInt(raw, 10);
        const hex = num.toString(16).padStart(8, '0');
        lines.push(`${nameLit}=dword:${hex}`);
      } else if (/^hex/i.test(raw) || type.includes('BINARY')) {
        // if raw already contains hex: prefix, include after normalizing
        let payload = raw;
        if (payload.toLowerCase().startsWith('hex:')) payload = payload.substr(4);
        lines.push(`${nameLit}=hex:${payload}`);
      } else {
        // treat as string
        const esc = raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        lines.push(`${nameLit}="${esc}"`);
      }
    }
    lines.push('\r\n');
  }
  try {
    await fs.writeFile(filePath, lines.join('\r\n'), 'utf8');
    return { success: true, path: filePath };
  } catch (e) {
    return { success: false, error: String(e) };
  }
});

// Import a .reg file into registry
ipcMain.handle('import-sessions-reg', async () => {
  if (process.platform !== 'win32') return { success: false, error: 'Not supported on this platform' };
  const win = BrowserWindow.getFocusedWindow();
  const res = await dialog.showOpenDialog(win, { title: 'Import PuTTY Sessions (.reg)', properties: ['openFile'], filters: [{ name: 'Registry Files', extensions: ['reg'] }] });
  if (res.canceled || !res.filePaths || !res.filePaths[0]) return { success: false, error: 'cancelled' };
  const filePath = res.filePaths[0];
  try {
    await new Promise((resolve, reject) => {
      exec(`reg import "${filePath}"`, { windowsHide: true }, (err, stdout, stderr) => {
        if (err) return reject(err);
        resolve();
      });
    });
    // reload cache
    await loadSessionsFromRegistry();
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
});

// Export sessions metadata (full session registry values) as JSON using `reg query /s`
ipcMain.handle('export-sessions-json', async () => {
  if (process.platform !== 'win32') return { success: false, error: 'Not supported on this platform' };
  const win = BrowserWindow.getFocusedWindow();
  const { canceled, filePath } = await dialog.showSaveDialog(win, { title: 'Export PuTTY Sessions (.json)', defaultPath: 'putty-sessions.json', filters: [{ name: 'JSON Files', extensions: ['json'] }] });
  if (canceled || !filePath) return { success: false, error: 'cancelled' };

  const out = Object.values(sessionsCache || {});
  try {
    await fs.writeFile(filePath, JSON.stringify(out, null, 2), 'utf8');
    return { success: true, path: filePath };
  } catch (e) {
    return { success: false, error: String(e) };
  }
});

// Import sessions metadata from JSON and set Category values
ipcMain.handle('import-sessions-json', async () => {
  if (process.platform !== 'win32') return { success: false, error: 'Not supported on this platform' };
  const win = BrowserWindow.getFocusedWindow();
  const res = await dialog.showOpenDialog(win, { title: 'Import PuTTY Sessions (.json)', properties: ['openFile'], filters: [{ name: 'JSON Files', extensions: ['json'] }] });
  if (res.canceled || !res.filePaths || !res.filePaths[0]) return { success: false, error: 'cancelled' };
  const filePath = res.filePaths[0];
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const arr = JSON.parse(content);
    // expect array of {session, category}
    await Promise.all((arr || []).map(async (it) => {
      const sessionName = it.session;
      const enc = encodeURIComponent(sessionName);
      const keyPath = `HKCU\\Software\\SimonTatham\\PuTTY\\Sessions\\${enc}`;
      const values = it.values || it.v || {};
      // ensure key exists
      await new Promise((resolve) => {
        exec(`reg add "${keyPath}" /f`, { windowsHide: true }, () => resolve());
      });
      // set each value
      await Promise.all(Object.keys(values).map(async (vn) => {
        const v = values[vn];
        const typ = (v && v.type) ? v.type : 'REG_SZ';
        const dat = (v && v.value !== undefined) ? String(v.value) : '';
        await new Promise((resolve) => {
          // handle default value name
          if (vn === '(Default)' || vn === '' || vn === '@') {
            exec(`reg add "${keyPath}" /ve /t ${typ} /d "${dat}" /f`, { windowsHide: true }, () => resolve());
          } else {
            exec(`reg add "${keyPath}" /v "${vn}" /t ${typ} /d "${dat}" /f`, { windowsHide: true }, () => resolve());
          }
        });
      }));
    }));
    // refresh cache
    await loadSessionsFromRegistry();
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
});

// reload sessions from registry on demand
ipcMain.handle('reload-sessions', async () => {
  try {
    await loadSessionsFromRegistry();
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
});
