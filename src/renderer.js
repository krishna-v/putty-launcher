function $(id) { return document.getElementById(id); }

async function refreshConfig() {
  return await window.electronAPI.getConfig();
}

function renderSessionsTree(tree) {
  const ul = $('sessionsList');
  ul.innerHTML = '';
  // handle empty tree
  if (!tree || (Object.keys(tree.children || {}).length === 0 && (tree.sessions || []).length === 0)) {
    const li = document.createElement('li');
    li.textContent = 'No saved PuTTY sessions found.';
    li.className = 'empty';
    ul.appendChild(li);
    return;
  }

  function renderNode(node, container, isRoot) {
    const nodeLi = document.createElement('li');
    nodeLi.className = 'category';

    if (isRoot) {
      Object.keys(node.children || {}).forEach(k => renderNode(node.children[k], nodeLi, false));
      // Shouldn't be any sessions at root level, but just in case
      (node.sessions || []).forEach(s => {
        const c = document.createElement('li');
        c.textContent = s;
        c.tabIndex = 0;
        c.className = 'session-item';
        attachSessionItemHandlers(c, s, ul);
        nodeLi.appendChild(c);
        console.log('added root session item', s);   });
    } else {
      // Recurse into category
      const header = document.createElement('div');
      header.className = 'category-header';
      header.tabIndex = 0;
      // create arrow and title elements so arrow click only toggles collapse
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      // arrow should not be focusable itself; header handles keyboard
      const folderIcon = document.createElement('span');
      folderIcon.className = 'folder-icon';
      folderIcon.textContent = '📁';
      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = node.name;
      header.appendChild(arrow);
      header.appendChild(folderIcon);
      header.appendChild(title);
      // make header clickable/selectable
      header.addEventListener('click', (ev) => {
        // select this category header
        document.querySelectorAll('.session-item').forEach(x => x.classList.remove('selected'));
        document.querySelectorAll('.category-header').forEach(h => h.classList.remove('selected'));
        header.classList.add('selected');
      });
      const childContainer = document.createElement('div');
      childContainer.className = 'child-container';
      const childUl = document.createElement('ul');
      childUl.className = 'child-list';

      Object.keys(node.children || {}).forEach(k => renderNode(node.children[k], childUl, false));

      (node.sessions || []).forEach(s => {
        const c = document.createElement('li');
        c.textContent = s;
        c.tabIndex = 0;
        c.className = 'session-item';
        attachSessionItemHandlers(c, s, ul);
        childUl.appendChild(c);
        console.log('added session item', s);
      });

      childUl.style.display = 'none';
      arrow.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const isHidden = childUl.style.display === 'none' || !childUl.style.display;
        childUl.style.display = isHidden ? 'block' : 'none';
        header.classList.toggle('expanded', isHidden);
      });
      // keyboard handling is on the header; arrow click still toggles
      // allow toggling expand/collapse with keyboard on the header (Enter or Space)
      header.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          // toggle the child list
          const isHidden = childUl.style.display === 'none' || !childUl.style.display;
          childUl.style.display = isHidden ? 'block' : 'none';
          header.classList.toggle('expanded', isHidden);
          // select this category
          document.querySelectorAll('.session-item').forEach(x => x.classList.remove('selected'));
          document.querySelectorAll('.category-header').forEach(h => h.classList.remove('selected'));
          header.classList.add('selected');
        }
      });

      childContainer.appendChild(childUl);
      nodeLi.appendChild(header);
      nodeLi.appendChild(childContainer);
      console.log('added category', node.name);
    } 

    container.appendChild(nodeLi);
  }

  renderNode(tree, ul, true);

  // adjust height after rendering
  if (typeof adjustTreeHeight === 'function') adjustTreeHeight();

  function setAll(expand) {
    document.querySelectorAll('.child-list').forEach(el => {
      el.style.display = expand ? 'block' : 'none';
    });
    document.querySelectorAll('.category-header').forEach(h => h.classList.toggle('expanded', expand));
  }

  window.__puttyTreeControl = { expandAll: () => setAll(true), collapseAll: () => setAll(false) };
}

  // adjust sessions list height to fit window and show/hide scrollbar as needed
  function adjustTreeHeight() {
    const app = document.getElementById('app');
    const list = document.getElementById('sessionsList');
    if (!app || !list) return;
    const rect = list.getBoundingClientRect();
    const margin = 36; // room for controls/footer
    const available = Math.max(120, Math.floor(window.innerHeight - rect.top - margin));
    list.style.maxHeight = available + 'px';
  }

  // call adjust on load and resize
  window.addEventListener('resize', adjustTreeHeight);
  window.addEventListener('DOMContentLoaded', adjustTreeHeight);

  // context menu
  function createContextMenu() {
    let menu = document.getElementById('sessionContextMenu');
    if (menu) return menu;
    menu = document.createElement('div');
    menu.id = 'sessionContextMenu';
    menu.className = 'context-menu';
    menu.style.display = 'none';

    const launch = document.createElement('div');
    launch.className = 'context-menu-item';
    launch.textContent = 'Launch';
    const editSession = document.createElement('div');
    editSession.className = 'context-menu-item';
    editSession.textContent = 'Edit Session';
    const edit = document.createElement('div');
    edit.className = 'context-menu-item';
    edit.textContent = 'Edit Category';

    menu.appendChild(launch);
    menu.appendChild(editSession);
    menu.appendChild(edit);
    document.body.appendChild(menu);

    // hide on click elsewhere
    document.addEventListener('click', () => { menu.style.display = 'none'; });

    return menu;
  }

  function attachSessionItemHandlers(elem, sessionName, listRoot) {
    elem.addEventListener('click', () => {
      document.querySelectorAll('.session-item').forEach(x => x.classList.remove('selected'));
      document.querySelectorAll('.category-header').forEach(h => h.classList.remove('selected'));
      elem.classList.add('selected');
    });
    elem.addEventListener('dblclick', async () => {
      const res = await window.electronAPI.launchPutty({ session: sessionName });
      if (!res.success) alert('Failed to launch session: ' + (res.error || 'unknown'));
    });
    elem.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') elem.click(); });

    elem.addEventListener('contextmenu', async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const menu = createContextMenu();
      // position
      const x = ev.clientX;
      const y = ev.clientY;
      menu.style.left = x + 'px';
      menu.style.top = y + 'px';
      menu.style.display = 'block';

      const launch = menu.querySelector('.context-menu-item:nth-child(1)');
      const editSession = menu.querySelector('.context-menu-item:nth-child(2)');
      const edit = menu.querySelector('.context-menu-item:nth-child(3)');

      // remove previous listeners by replacing with clones (preserves items)
      const newLaunch = launch.cloneNode(true);
      launch.parentNode.replaceChild(newLaunch, launch);
      const newEditSession = editSession.cloneNode(true);
      editSession.parentNode.replaceChild(newEditSession, editSession);
      const newEdit = edit.cloneNode(true);
      edit.parentNode.replaceChild(newEdit, edit);

      newLaunch.addEventListener('click', async () => {
        menu.style.display = 'none';
        // select the item
        elem.click();
        const res = await window.electronAPI.launchPutty({ session: sessionName });
        if (!res.success) alert('Failed to launch session: ' + (res.error || 'unknown'));
      });
      newEditSession.addEventListener('click', async () => {
        menu.style.display = 'none';
        await showEditSessionDialog(sessionName);
      });

      newEdit.addEventListener('click', async () => {
        menu.style.display = 'none';
        // open modal editor instead of prompt
        await showEditCategoryDialog(sessionName);
      });
    });
  }

  // Keyboard navigation helpers
  function getVisibleSessionItems() {
    return Array.from(document.querySelectorAll('.session-item, .category-header')).filter(el => el.offsetParent !== null);
  }

  function selectSessionElement(el) {
    if (!el) return;
    document.querySelectorAll('.session-item, .category-header').forEach(x => x.classList.remove('selected'));
    el.classList.add('selected');
    try { el.focus(); } catch (e) {}
    el.scrollIntoView({ block: 'nearest' });
  }

  function moveSelection(delta) {
    const items = getVisibleSessionItems();
    if (!items.length) return;
    let idx = items.findIndex(i => i.classList.contains('selected'));
    if (idx === -1) idx = delta > 0 ? 0 : items.length - 1;
    else idx = Math.max(0, Math.min(items.length - 1, idx + delta));
    selectSessionElement(items[idx]);
  }

  // Global key handler when focus is inside the sessions area
  document.addEventListener('keydown', (ev) => {
    const active = document.activeElement;
    const list = document.getElementById('sessionsList');
    if (!list) return;
    // const inside = list.contains(active) || active === list || (active && active.classList && active.classList.contains('session-item'));
    const inside = list.contains(active);
    if (!inside) return;
    // If a category header is focused and expanded, ArrowDown should move into its first visible child
    /*
    if (ev.key === 'ArrowDown' && active && active.classList && active.classList.contains('category-header')) {
      const nodeLi = active.closest('.category');
      if (nodeLi) {
        const childList = nodeLi.querySelector('.child-list');
        if (childList && childList.style.display !== 'none') {
          const firstChild = Array.from(childList.querySelectorAll('.session-item')).find(i => i.offsetParent !== null);
          if (firstChild) {
            ev.preventDefault();
            // deselect category and select the child
            document.querySelectorAll('.category-header').forEach(h => h.classList.remove('selected'));
            selectSessionElement(firstChild);
            return;
          }
        }
      }
      ev.preventDefault(); moveSelection(1);
    }
    */
    if (ev.key === 'ArrowDown') { ev.preventDefault(); moveSelection(1); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); moveSelection(-1); }
    else if (ev.key === 'Enter') {
      ev.preventDefault();
      const sel = document.querySelector('.session-item.selected');
      if (sel) sel.click();
    }
  });

  // modal editor
  function createEditDialog() {
    let modal = document.getElementById('categoryEditModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'categoryEditModal';
    modal.className = 'modal-overlay';
    modal.style.display = 'none';

    const dlg = document.createElement('div');
    dlg.className = 'modal-dialog';

    const title = document.createElement('div');
    title.className = 'modal-title';
    title.textContent = 'Edit Category';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'modal-input';
    input.placeholder = 'Category (use / to create subcategories)';

    const buttons = document.createElement('div');
    buttons.className = 'modal-buttons';
    const ok = document.createElement('button'); ok.textContent = 'OK'; ok.className = 'modal-ok';
    const cancel = document.createElement('button'); cancel.textContent = 'Cancel'; cancel.className = 'modal-cancel';
    buttons.appendChild(ok); buttons.appendChild(cancel);

    dlg.appendChild(title);
    dlg.appendChild(input);
    dlg.appendChild(buttons);
    modal.appendChild(dlg);
    document.body.appendChild(modal);

    // close on overlay click (but not when clicking dialog)
    modal.addEventListener('click', (ev) => { if (ev.target === modal) modal.style.display = 'none'; });

    return modal;
  }

  async function showEditCategoryDialog(sessionName) {
    const modal = createEditDialog();
    const input = modal.querySelector('.modal-input');
    const ok = modal.querySelector('.modal-ok');
    const cancel = modal.querySelector('.modal-cancel');

    // fetch current category
    let current = '';
    try {
      const r = await window.electronAPI.getSessionCategory(sessionName);
      if (r && r.success) current = r.category || '';
    } catch (e) { current = ''; }

    input.value = current === '<None>' ? '' : (current || '');
    modal.style.display = 'flex';
    input.focus();

    return new Promise((resolve) => {
      const cleanup = () => {
        ok.removeEventListener('click', onOk);
        cancel.removeEventListener('click', onCancel);
        modal.style.display = 'none';
      };
      const onOk = async () => {
        const val = input.value.trim();
        const setRes = await window.electronAPI.setSessionCategory(sessionName, val);
        if (!setRes || !setRes.success) {
          alert('Failed to set category: ' + (setRes && setRes.error ? setRes.error : 'unknown'));
        } else {
          await refreshSessions();
        }
        cleanup();
        resolve();
      };
      const onCancel = () => { cleanup(); resolve(); };
      ok.addEventListener('click', onOk);
      cancel.addEventListener('click', onCancel);
    });
  }

// Edit Session modal (full session values editor)
function createEditSessionDialog() {
  let modal = document.getElementById('sessionEditModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'sessionEditModal';
  modal.className = 'modal-overlay';
  modal.style.display = 'none';

  const dlg = document.createElement('div');
  dlg.className = 'modal-dialog large';

  const header = document.createElement('div'); header.className = 'modal-header';
  const title = document.createElement('div'); title.className = 'modal-title'; title.textContent = 'Edit Session';
  const info = document.createElement('div'); info.className = 'modal-info';
  header.appendChild(title); header.appendChild(info);

  const content = document.createElement('div'); content.className = 'modal-content';

  // groups container
  const groupsContainer = document.createElement('div'); groupsContainer.className = 'groups';

  const footer = document.createElement('div'); footer.className = 'modal-footer';
  const addBtn = document.createElement('button'); addBtn.textContent = 'Add Field'; addBtn.className = 'modal-add';
  const buttons = document.createElement('div'); buttons.className = 'modal-buttons';
  const ok = document.createElement('button'); ok.textContent = 'Save'; ok.className = 'modal-ok';
  const cancel = document.createElement('button'); cancel.textContent = 'Cancel'; cancel.className = 'modal-cancel';
  buttons.appendChild(cancel); buttons.appendChild(ok);
  footer.appendChild(addBtn); footer.appendChild(buttons);

  dlg.appendChild(header);
  content.appendChild(groupsContainer);
  dlg.appendChild(content);
  dlg.appendChild(footer);
  modal.appendChild(dlg);
  document.body.appendChild(modal);

  modal.addEventListener('click', (ev) => { if (ev.target === modal) modal.style.display = 'none'; });

  

  return modal;
}

// Helper to create a key/value field row for session editor
function makeFieldRow(key = '', type = 'REG_SZ', value = '') {
  const row = document.createElement('div'); row.className = 'kv-row field-row';
  const nameNode = document.createElement('input'); nameNode.type = 'text'; nameNode.className = 'kv-name field-key'; nameNode.value = key ? key : '';
  if (key) nameNode.readOnly = true;
  const typeNode = document.createElement('select'); typeNode.className = 'kv-type field-type';
  ['REG_SZ','REG_EXPAND_SZ','REG_DWORD','REG_BINARY'].forEach(t => { const o = document.createElement('option'); o.value = t; o.textContent = t; if (t === type) o.selected = true; typeNode.appendChild(o); });
  const valNode = document.createElement('input'); valNode.type = 'text'; valNode.className = 'kv-val field-val'; valNode.value = value;
  const del = document.createElement('button'); del.className = 'kv-del'; del.textContent = 'Remove';
  row.appendChild(nameNode); row.appendChild(typeNode); row.appendChild(valNode); row.appendChild(del);
  return { row, nameNode, typeNode, valNode, del };
}

async function showEditSessionDialog(sessionName) {
  const modal = createEditSessionDialog();
  const headerInfo = modal.querySelector('.modal-header .modal-info');
  const groupsContainer = modal.querySelector('.groups');
  const content = modal.querySelector('.modal-content');
  const ok = modal.querySelector('.modal-ok');
  const cancel = modal.querySelector('.modal-cancel');
  const addBtn = modal.querySelector('.modal-add');

  headerInfo.textContent = `Session: ${sessionName}`;
  groupsContainer.innerHTML = '';

  // define groups and known keys (inspired by PuTTY settings)
  const groups = [
    { id: 'session', title: 'Session', keys: ['HostName','PortNumber','Protocol','UserName'] },
    { id: 'connection', title: 'Connection', keys: ['LocalCommand','TCPNoDelay'] },
    { id: 'ssh', title: 'SSH', keys: ['Compression','PreferredAuthentications'] },
    { id: 'proxy', title: 'Proxy', keys: ['ProxyType','ProxyHost','ProxyPort','ProxyUsername','ProxyPassword'] },
    { id: 'appearance', title: 'Appearance', keys: ['Font','TerminalType','Width','Height'] },
    { id: 'other', title: 'Other', keys: [] }
  ];

  // create group elements
  const groupEls = {};
  for (const g of groups) {
    const ge = document.createElement('div'); ge.className = 'group';
    const gt = document.createElement('div'); gt.className = 'group-title'; gt.textContent = g.title;
    const gb = document.createElement('div'); gb.className = 'group-body';
    ge.appendChild(gt); ge.appendChild(gb);
    groupsContainer.appendChild(ge);
    groupEls[g.id] = gb;
  }

  // load existing values
  let values = {};
  try {
    const r = await window.electronAPI.getSessionValues(sessionName);
    if (r && r.success) values = r.values || {};
  } catch (e) { values = {}; }

  const deletedNames = new Set();

  // helper to add a field to a group's body
  function addFieldToGroup(groupId, key, type, val, existing) {
    const gb = groupEls[groupId] || groupEls['other'];
    const obj = makeFieldRow(key, type, val);
    const row = obj.row; const nameNode = obj.nameNode; const typeNode = obj.typeNode; const valNode = obj.valNode; const del = obj.del;
    if (!key) nameNode.readOnly = false;
    del.addEventListener('click', () => {
      const orig = row.dataset.originalName || nameNode.value;
      if (orig) deletedNames.add(orig);
      row.remove();
    });
    row.dataset.originalName = key || '';
    gb.appendChild(row);
  }

  // populate known keys into groups, remaining into Other
  const placed = new Set();
  for (const g of groups) {
    for (const k of g.keys) {
      if (values.hasOwnProperty(k)) {
        const v = values[k] || {};
        addFieldToGroup(g.id, k, v.type || 'REG_SZ', v.value || '', true);
        placed.add(k);
      }
    }
  }
  // remaining values
  Object.keys(values || {}).forEach(k => {
    if (!placed.has(k)) {
      const v = values[k] || {};
      addFieldToGroup('other', k, v.type || 'REG_SZ', v.value || '', true);
    }
  });

  // add button adds new field to Other
  addBtn.addEventListener('click', () => {
    addFieldToGroup('other', '', 'REG_SZ', '', false);
  });

  modal.style.display = 'flex';

  return new Promise((resolve) => {
    const cleanup = () => { ok.removeEventListener('click', onOk); cancel.removeEventListener('click', onCancel); modal.style.display='none'; };
    const onOk = async () => {
      // collect all rows
      const rows = Array.from(modal.querySelectorAll('.kv-row'));
      const setObj = {};
      for (const r of rows) {
        const nameNode = r.querySelector('.kv-name');
        const typeNode = r.querySelector('.kv-type');
        const valNode = r.querySelector('.kv-val');
        let name = nameNode && nameNode.value ? nameNode.value.trim() : '';
        if (name === '(Default)') name = '';
        const typ = typeNode && typeNode.value ? typeNode.value : 'REG_SZ';
        const val = valNode && valNode.value !== undefined ? valNode.value : '';
        setObj[name] = { type: typ, value: val };
      }
      const delList = Array.from(deletedNames);
      const payload = { set: setObj, delete: delList };
      const res = await window.electronAPI.saveSessionValues(sessionName, payload);
      if (!res || !res.success) alert('Failed to save session: ' + (res && res.error));
      else { await refreshSessions(); }
      cleanup();
      resolve();
    };
    const onCancel = () => { cleanup(); resolve(); };
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
  });
}

async function refreshSessions() {
  const tree = await window.electronAPI.listPuttySessionsTree();
  renderSessionsTree(tree);
  if (typeof adjustTreeHeight === 'function') adjustTreeHeight();
}

// New Session modal
function createNewSessionDialog() {
  let modal = document.getElementById('newSessionModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'newSessionModal';
  modal.className = 'modal-overlay';
  modal.style.display = 'none';

  const dlg = document.createElement('div');
  dlg.className = 'modal-dialog';

  const title = document.createElement('div');
  title.className = 'modal-title';
  title.textContent = 'New Session / Launch PuTTY';

  const hostLabel = document.createElement('label'); hostLabel.textContent = 'Host (leave blank to start PuTTY without args)';
  const hostInput = document.createElement('input'); hostInput.type = 'text'; hostInput.className = 'modal-input'; hostInput.id = 'ns-host';
  const userLabel = document.createElement('label'); userLabel.textContent = 'Username (optional)';
  const userInput = document.createElement('input'); userInput.type = 'text'; userInput.className = 'modal-input'; userInput.id = 'ns-user';
  const portLabel = document.createElement('label'); portLabel.textContent = 'Port (optional)';
  const portInput = document.createElement('input'); portInput.type = 'text'; portInput.className = 'modal-input'; portInput.id = 'ns-port';

  const buttons = document.createElement('div');
  buttons.className = 'modal-buttons';
  const ok = document.createElement('button'); ok.textContent = 'Launch PuTTY'; ok.className = 'modal-ok';
  const cancel = document.createElement('button'); cancel.textContent = 'Cancel'; cancel.className = 'modal-cancel';
  buttons.appendChild(cancel); buttons.appendChild(ok);

  dlg.appendChild(title);
  dlg.appendChild(hostLabel);
  dlg.appendChild(hostInput);
  dlg.appendChild(userLabel);
  dlg.appendChild(userInput);
  dlg.appendChild(portLabel);
  dlg.appendChild(portInput);
  dlg.appendChild(buttons);
  modal.appendChild(dlg);
  document.body.appendChild(modal);

  modal.addEventListener('click', (ev) => { if (ev.target === modal) modal.style.display = 'none'; });
  return modal;
}

async function showNewSessionDialog() {
  const modal = createNewSessionDialog();
  const hostInput = modal.querySelector('#ns-host');
  const userInput = modal.querySelector('#ns-user');
  const portInput = modal.querySelector('#ns-port');
  const ok = modal.querySelector('.modal-ok');
  const cancel = modal.querySelector('.modal-cancel');

  hostInput.value = '';
  userInput.value = '';
  portInput.value = '';
  modal.style.display = 'flex';
  hostInput.focus();

  return new Promise((resolve) => {
    const cleanup = () => {
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      modal.style.display = 'none';
    };
    const onOk = async () => {
      const host = hostInput.value.trim();
      const user = userInput.value.trim();
      const port = portInput.value.trim();
      if (!host) {
        // launch putty with no args
        const res = await window.electronAPI.launchPutty({});
        if (!res.success) alert('Failed to launch PuTTY: ' + (res.error || 'unknown'));
      } else {
        const res = await window.electronAPI.launchPutty({ host: host, username: user || undefined, port: port || undefined });
        if (!res.success) alert('Failed to launch PuTTY: ' + (res.error || 'unknown'));
      }
      cleanup();
      resolve();
    };
    const onCancel = () => { cleanup(); resolve(); };
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
  });
}

// Settings modal
function createSettingsDialog() {
  let modal = document.getElementById('settingsModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'settingsModal';
  modal.className = 'modal-overlay';
  modal.style.display = 'none';

  const dlg = document.createElement('div');
  dlg.className = 'modal-dialog';

  const title = document.createElement('div');
  title.className = 'modal-title';
  title.textContent = 'Settings';

  const label = document.createElement('label'); label.textContent = 'Path to PuTTY executable';
  const input = document.createElement('input'); input.type = 'text'; input.className = 'modal-input'; input.id = 'settings-puttyPath';

  const choose = document.createElement('button'); choose.textContent = 'Choose'; choose.className = 'modal-choose';
  const buttons = document.createElement('div'); buttons.className = 'modal-buttons';
  const ok = document.createElement('button'); ok.textContent = 'Save'; ok.className = 'modal-ok';
  const cancel = document.createElement('button'); cancel.textContent = 'Cancel'; cancel.className = 'modal-cancel';
  buttons.appendChild(cancel); buttons.appendChild(ok);

  dlg.appendChild(title);
  dlg.appendChild(label);
  dlg.appendChild(input);
  dlg.appendChild(choose);
  dlg.appendChild(buttons);
  modal.appendChild(dlg);
  document.body.appendChild(modal);

  modal.addEventListener('click', (ev) => { if (ev.target === modal) modal.style.display = 'none'; });

  choose.addEventListener('click', async () => {
    const p = await window.electronAPI.openExeDialog();
    if (p) {
      const inp = modal.querySelector('#settings-puttyPath');
      inp.value = p;
    }
  });

  ok.addEventListener('click', async () => {
    const inp = modal.querySelector('#settings-puttyPath');
    const p = inp.value.trim();
    if (!p) return alert('Please choose a valid path');
    await window.electronAPI.setPuttyPath(p);
    modal.style.display = 'none';
    alert('Saved PuTTY path');
  });

  // Cancel should hide the settings modal
  cancel.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  return modal;
}

async function showSettingsDialog() {
  const modal = createSettingsDialog();
  const input = modal.querySelector('#settings-puttyPath');
  const cfg = await refreshConfig();
  input.value = (cfg && cfg.puttyPath) ? cfg.puttyPath : '';
  modal.style.display = 'flex';
  input.focus();
}

window.addEventListener('DOMContentLoaded', () => {
  refreshConfig();
  refreshSessions();

  // Settings menu opens the Settings modal
  if (window.electronAPI && typeof window.electronAPI.onOpenSettings === 'function') {
    window.electronAPI.onOpenSettings(() => {
      showSettingsDialog();
    });
  }

  // Listen for File -> New Session menu action
  if (window.electronAPI && typeof window.electronAPI.onOpenNewSession === 'function') {
    window.electronAPI.onOpenNewSession(() => {
      showNewSessionDialog();
    });
  }

  // Listen for Export/Import menu actions
  if (window.electronAPI && typeof window.electronAPI.onExportSessionsReg === 'function') {
    window.electronAPI.onExportSessionsReg(async () => {
      const res = await window.electronAPI.exportSessionsReg();
      if (!res || !res.success) alert('Export failed: ' + (res && res.error));
      else alert('Exported to ' + res.path);
    });
  }
  if (window.electronAPI && typeof window.electronAPI.onImportSessionsReg === 'function') {
    window.electronAPI.onImportSessionsReg(async () => {
      const res = await window.electronAPI.importSessionsReg();
      if (!res || !res.success) alert('Import failed: ' + (res && res.error));
      else { alert('Imported .reg file'); await refreshSessions(); }
    });
  }
  if (window.electronAPI && typeof window.electronAPI.onExportSessionsJson === 'function') {
    window.electronAPI.onExportSessionsJson(async () => {
      const res = await window.electronAPI.exportSessionsJson();
      if (!res || !res.success) alert('Export failed: ' + (res && res.error));
      else alert('Exported to ' + res.path);
    });
  }
  if (window.electronAPI && typeof window.electronAPI.onImportSessionsJson === 'function') {
    window.electronAPI.onImportSessionsJson(async () => {
      const res = await window.electronAPI.importSessionsJson();
      if (!res || !res.success) alert('Import failed: ' + (res && res.error));
      else { alert('Imported JSON'); await refreshSessions(); }
    });
  }

  $('refreshSessions').addEventListener('click', async () => {
    if (window.electronAPI && typeof window.electronAPI.reloadSessions === 'function') {
      const r = await window.electronAPI.reloadSessions();
      if (!r || !r.success) return alert('Failed to reload sessions: ' + (r && r.error));
    }
    await refreshSessions();
  });

  // import/export handlers
  $('exportReg')?.addEventListener('click', async () => {
    const res = await window.electronAPI.exportSessionsReg();
    if (!res || !res.success) alert('Export failed: ' + (res && res.error));
    else alert('Exported to ' + res.path);
  });
  $('importReg')?.addEventListener('click', async () => {
    const res = await window.electronAPI.importSessionsReg();
    if (!res || !res.success) alert('Import failed: ' + (res && res.error));
    else { alert('Imported .reg file'); await refreshSessions(); }
  });
  $('exportJson')?.addEventListener('click', async () => {
    const res = await window.electronAPI.exportSessionsJson();
    if (!res || !res.success) alert('Export failed: ' + (res && res.error));
    else alert('Exported to ' + res.path);
  });
  $('importJson')?.addEventListener('click', async () => {
    const res = await window.electronAPI.importSessionsJson();
    if (!res || !res.success) alert('Import failed: ' + (res && res.error));
    else { alert('Imported JSON'); await refreshSessions(); }
  });

  $('newSession').addEventListener('click', async () => {
    await showNewSessionDialog();
  });
});
