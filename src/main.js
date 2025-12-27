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
    width: 900,
    height: 700,
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

app.whenReady().then(createWindow);

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
  return new Promise((resolve) => {
    const key = 'HKCU\\Software\\SimonTatham\\PuTTY\\Sessions';
    exec(`reg query "${key}"`, { windowsHide: true }, (err, stdout) => {
      if (!stdout) return resolve([]);
      const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const prefix = 'HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\';
      const sessions = lines.map((l) => {
        if (l.startsWith(prefix)) {
          const enc = l.slice(prefix.length);
          try {
            return decodeURIComponent(enc);
          } catch (e) {
            return enc;
          }
        }
        return null;
      }).filter(Boolean);
      resolve([...new Set(sessions)]);
    });
  });
});

ipcMain.handle('list-putty-sessions-tree', async () => {
  if (process.platform !== 'win32') return { name: '', children: {}, sessions: [] };

  const baseKey = 'HKCU\\Software\\SimonTatham\\PuTTY\\Sessions';

  function regQuery(key, valueName) {
    return new Promise((resolve) => {
      const valueArg = valueName ? `/v ${valueName}` : '';
      exec(`reg query "${key}" ${valueArg}`.trim(), { windowsHide: true }, (err, stdout, stderr) => {
        if (!stdout) return resolve({ stdout: '', stderr: stderr || String(err || '') });
        resolve({ stdout, stderr: stderr || '' });
      });
    });
  }

  // get session keys
  const top = await regQuery(baseKey);
  const lines = top.stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const prefix = 'HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\';
  const encodedSessions = lines.map(l => l.startsWith(prefix) ? l.slice(prefix.length) : null).filter(Boolean);

  // tree node structure: { name, children: {name: node}, sessions: [] }
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

  await Promise.all(encodedSessions.map(async (enc) => {
    const decoded = (() => { try { return decodeURIComponent(enc); } catch (e) { return enc; } })();
    const fullKey = `${baseKey}\\${enc}`;
    let categoryValue = '';
    try {
      const r = await regQuery(fullKey, 'Category');
      if (r.stdout) {
        const m = r.stdout.split(/\r?\n/).map(s => s.trim()).find(s => s.startsWith('Category') || s.includes('\tCategory\t'));
        if (m) {
          const parts = m.split(/\s{2,}|\t+/).filter(Boolean);
          if (parts.length >= 3) categoryValue = parts.slice(2).join(' ').trim();
          else if (parts.length === 2) categoryValue = parts[1].trim();
        }
      }
    } catch (e) {
      categoryValue = '';
    }
    let pathParts = ['<None>'];
    if (categoryValue) {
      pathParts = categoryValue.split('/').map(p => p.trim()).filter(Boolean);
      if (pathParts.length === 0) pathParts = ['<None>'];
    }
    addToTree(root, pathParts, decoded);
  }));

  // sort children keys and sessions recursively
  function sortNode(node) {
    Object.keys(node.children).forEach(k => sortNode(node.children[k]));
    node.sessions.sort((a,b)=> a.localeCompare(b, undefined, {sensitivity:'base'}));
    const sortedChildren = {};
    Object.keys(node.children).sort((a,b)=> a.localeCompare(b, undefined, {sensitivity:'base'})).forEach(k => { sortedChildren[k] = node.children[k]; });
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
    // ensure categoryPath is a string (empty -> delete? we will set empty string)
    const safe = String(categoryPath || '');
    // reg add "fullKey" /v Category /t REG_SZ /d "value" /f
    return await new Promise((resolve) => {
      exec(`reg add "${fullKey}" /v Category /t REG_SZ /d "${safe}" /f`, { windowsHide: true }, (err, stdout, stderr) => {
        if (err) return resolve({ success: false, error: String(err) });
        resolve({ success: true });
      });
    });
  } catch (e) {
    return { success: false, error: String(e) };
  }
});

ipcMain.handle('get-session-category', async (event, sessionName) => {
  if (process.platform !== 'win32') return { success: false, error: 'Not supported on this platform', category: '' };
  try {
    const baseKey = 'HKCU\\Software\\SimonTatham\\PuTTY\\Sessions';
    const enc = encodeURIComponent(sessionName);
    const fullKey = `${baseKey}\\${enc}`;
    return await new Promise((resolve) => {
      exec(`reg query "${fullKey}" /v Category`, { windowsHide: true }, (err, stdout, stderr) => {
        let category = '';
        if (stdout) {
          const lines = stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
          const m = lines.find(s => s.startsWith('Category') || s.includes('\tCategory\t'));
          if (m) {
            const parts = m.split(/\s{2,}|\t+/).filter(Boolean);
            if (parts.length >= 3) category = parts.slice(2).join(' ').trim();
            else if (parts.length === 2) category = parts[1].trim();
          }
        }
        resolve({ success: true, category });
      });
    });
  } catch (e) {
    return { success: false, error: String(e), category: '' };
  }
});
