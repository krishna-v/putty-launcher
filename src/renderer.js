categoryMap = {
    "Session": ["HostName", "Protocol", "PortNumber", "UserName", "RemoteCommand"],
    "Authentication": ["NoAuth", "NoTrivialAuth", "Banner", "TISAuth", "KIAuth", "GSSAPIAuth", "GSSAPIKEX", "GSSLibs", "GSSCustom", "PublicKeyFile", "DetachedCertificate", "AuthPlugin", "HostKey", "Cipher", "KEX", "RekeyTime", "RekeyBytes", "GssapiRekey"],
    "Terminal": ["TerminalType", "TerminalSpeed", "TerminalModes", "PassiveTelnet", "BackspaceIsDelete", "RXVTHomeEnd", "LinuxFunctionKeys", "ShiftedArrowKeys", "NoApplicationKeys", "NoApplicationCursors", "NoMouseReporting", "NoRemoteResize", "NoAltScreen", "NoRemoteWinTitle", "NoRemoteClearScroll", "RemoteQTitleAction", "NoDBackspace", "NoRemoteCharset", "ApplicationCursorKeys", "ApplicationKeypad", "NetHackKeypad", "AltF4", "AltSpace", "AltOnly", "ComposeKey", "CtrlAltKeys", "TelnetKey", "TelnetRet"],
    "Proxy": ["ProxyExcludeList", "ProxyDNS", "ProxyLocalhost", "ProxyMethod", "ProxyHost", "ProxyPort", "ProxyUsername", "ProxyPassword", "ProxyTelnetCommand", "ProxyLogToTerm"],
    "Logging": ["LogFileName", "LogType", "LogFileClash", "LogFlush", "LogHeader", "SSHLogOmitPasswords", "SSHLogOmitData"]
}

function $(id) { return document.getElementById(id); }
let currentSelectedSession = null;

async function refreshConfig() {
  return await window.electronAPI.getConfig();
}

function applyTheme(theme) {
  if (theme !== 'dark') theme = 'light';
  document.documentElement.dataset.theme = theme;
  window.electronAPI.setTheme(theme);
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
    showDefaultDetails();
    return;
  }

  function renderNode(node, container, isRoot, path = '') {
    const nodeLi = document.createElement('li');
    nodeLi.className = 'category';

    const nodePath = isRoot ? '' : (path ? `${path}/${node.name}` : node.name);

    if (isRoot) {
      Object.keys(node.children || {}).forEach(k => renderNode(node.children[k], nodeLi, false, nodePath));
      // Shouldn't be any sessions at root level, but just in case
      (node.sessions || []).forEach(s => {
        const c = document.createElement('li');
        c.textContent = s;
        c.tabIndex = 0;
        c.className = 'session-item';
        c.dataset.sessionName = s;
        attachSessionItemHandlers(c, s, ul);
        nodeLi.appendChild(c);
        console.log('added root session item', s);
      });
    } else {
      // Recurse into category
      const header = document.createElement('div');
      header.className = 'category-header';
      header.tabIndex = 0;
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      const folderIcon = document.createElement('span');
      folderIcon.className = 'folder-icon';
      folderIcon.textContent = '📁';
      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = node.name;
      header.appendChild(arrow);
      header.appendChild(folderIcon);
      header.appendChild(title);
      // make header clickable/selectable and show details
      header.addEventListener('click', (ev) => {
        selectSessionElement(header);
        showCategoryDetails(nodePath, node);
      });
      const childContainer = document.createElement('div');
      childContainer.className = 'child-container';
      const childUl = document.createElement('ul');
      childUl.className = 'child-list';

      Object.keys(node.children || {}).forEach(k => renderNode(node.children[k], childUl, false, nodePath));

      (node.sessions || []).forEach(s => {
        const c = document.createElement('li');
        c.textContent = s;
        c.tabIndex = 0;
        c.className = 'session-item';
        c.dataset.sessionName = s;
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
      header.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          const isHidden = childUl.style.display === 'none' || !childUl.style.display;
          childUl.style.display = isHidden ? 'block' : 'none';
          header.classList.toggle('expanded', isHidden);
          selectSessionElement(header);
          showCategoryDetails(nodePath, node);
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
  showDefaultDetails();

  if (typeof adjustTreeHeight === 'function') adjustTreeHeight();

  function setAll(expand) {
    document.querySelectorAll('.child-list').forEach(el => {
      el.style.display = expand ? 'block' : 'none';
    });
    document.querySelectorAll('.category-header').forEach(h => h.classList.toggle('expanded', expand));
  }

  window.__puttyTreeControl = { expandAll: () => setAll(true), collapseAll: () => setAll(false) };
}

function getDetailsContent() {
  return $('detailsContent');
}

function showStatus(message, timeout = 5000) {
  let el = $('statusBar');
  if (!el) {
    // create transient status element if missing
    el = document.createElement('div');
    el.id = 'statusBar';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('visible');
  if (el._statusTimer) clearTimeout(el._statusTimer);
  el._statusTimer = setTimeout(() => { el.classList.remove('visible'); el._statusTimer = null; }, timeout);
  // allow click to dismiss
  el.onclick = () => { el.classList.remove('visible'); if (el._statusTimer) { clearTimeout(el._statusTimer); el._statusTimer = null; } };
}

function createRenameSessionDialog() {
  let modal = document.getElementById('renameSessionModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'renameSessionModal';
  modal.className = 'modal-overlay';
  modal.style.display = 'none';

  const dlg = document.createElement('div');
  dlg.className = 'modal-dialog';

  const title = document.createElement('div');
  title.className = 'modal-title';
  title.textContent = 'Rename Session';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'modal-input';
  input.placeholder = 'New session name';

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

  modal.addEventListener('click', (ev) => { if (ev.target === modal) modal.style.display = 'none'; });

  return modal;
}

async function renameSelectedSession(sessionName) {
  if (!sessionName) return;
  const modal = createRenameSessionDialog();
  const input = modal.querySelector('.modal-input');
  const ok = modal.querySelector('.modal-ok');
  const cancel = modal.querySelector('.modal-cancel');

  input.value = sessionName;
  modal.style.display = 'flex';
  input.focus();
  input.select();

  return new Promise((resolve) => {
    const cleanup = () => {
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKeyDown);
      modal.style.display = 'none';
    };
    const onOk = async () => {
      const newName = input.value.trim();
      if (!newName || newName === sessionName) {
        cleanup();
        resolve();
        return;
      }
      const res = await window.electronAPI.renameSession(sessionName, newName);
      if (!res || !res.success) {
        showStatus('Rename failed: ' + (res && res.error ? res.error : 'unknown'));
      } else {
        currentSelectedSession = null;
        showStatus(`Renamed session to ${newName}`);
        await refreshSessions();
        showDefaultDetails();
      }
      cleanup();
      resolve();
    };
    const onCancel = () => { cleanup(); resolve(); };
    const onKeyDown = (ev) => { if (ev.key === 'Enter') onOk(); else if (ev.key === 'Escape') onCancel(); };
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKeyDown);
  });
}

async function deleteSelectedSession(sessionName) {
  if (!sessionName) return;
  const confirmed = confirm(`Delete session "${sessionName}"? This cannot be undone.`);
  if (!confirmed) return;
  const res = await window.electronAPI.deleteSession(sessionName);
  if (!res || !res.success) {
    showStatus('Delete failed: ' + (res && res.error ? res.error : 'unknown'));
    return;
  }
  currentSelectedSession = null;
  showStatus(`Deleted session ${sessionName}`);
  await refreshSessions();
  showDefaultDetails();
}

function showDefaultDetails() {
  const content = getDetailsContent();
  content.innerHTML = '<p class="detail-empty">Select a category or session to view subitems and properties.</p>';
  // Disable Clone/Launch when nothing is selected
  if (window.electronAPI && typeof window.electronAPI.updateSessionMenuState === 'function') {
    window.electronAPI.updateSessionMenuState(false);
  }
}

function showCategoryDetails(categoryPath, node) {
  const content = getDetailsContent();
  content.innerHTML = '';

  // Disable Clone/Launch for categories (only sessions)
  if (window.electronAPI && typeof window.electronAPI.updateSessionMenuState === 'function') {
    window.electronAPI.updateSessionMenuState(false);
  }

  const sectionHeader = document.createElement('div');
  sectionHeader.className = 'details-section';
  sectionHeader.innerHTML = `<div class="details-section-title">Category</div><div><strong>${categoryPath || 'Root'}</strong></div>`;
  content.appendChild(sectionHeader);

  const childSection = document.createElement('div');
  childSection.className = 'details-section';
  childSection.innerHTML = '<div class="details-section-title">Subcategories</div>';
  const childList = document.createElement('ul');
  childList.className = 'details-list';
  const childNames = Object.keys(node.children || {});
  if (childNames.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'detail-empty';
    empty.textContent = 'No subcategories.';
    childSection.appendChild(empty);
  } else {
    childNames.forEach(name => {
      const item = document.createElement('li');
      item.textContent = name;
      childList.appendChild(item);
    });
    childSection.appendChild(childList);
  }
  content.appendChild(childSection);

  const sessionSection = document.createElement('div');
  sessionSection.className = 'details-section';
  sessionSection.innerHTML = '<div class="details-section-title">Sessions</div>';
  const sessionNames = node.sessions || [];
  if (sessionNames.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'detail-empty';
    empty.textContent = 'No sessions in this category.';
    sessionSection.appendChild(empty);
  } else {
    const sessionList = document.createElement('ul');
    sessionList.className = 'details-list';
    sessionNames.forEach(name => {
      const item = document.createElement('li');
      item.innerHTML = `<span>${name}</span>`;
      sessionList.appendChild(item);
    });
    sessionSection.appendChild(sessionList);
  }
  content.appendChild(sessionSection);
}

async function showSessionDetails(sessionName) {
  const content = getDetailsContent();
  content.innerHTML = '';
  // header with action buttons on the right
  const header = document.createElement('div');
  header.className = 'details-section details-header';
  const titleWrap = document.createElement('div');
  titleWrap.innerHTML = `<div class="details-section-title">Session</div><div><strong>${sessionName}</strong></div>`;
  header.appendChild(titleWrap);

  const actions = document.createElement('div');
  actions.style.marginLeft = 'auto';
  actions.style.display = 'flex';
  actions.style.gap = '8px';

  const saveBtn = document.createElement('button'); saveBtn.textContent = 'Save'; saveBtn.className = 'modal-ok'; saveBtn.disabled = true;
  const cancelBtn = document.createElement('button'); cancelBtn.textContent = 'Cancel'; cancelBtn.className = 'modal-cancel'; cancelBtn.disabled = true;
  const launchBtn = document.createElement('button'); launchBtn.textContent = 'Launch'; launchBtn.className = 'modal-add';

  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  actions.appendChild(launchBtn);
  header.appendChild(actions);
  content.appendChild(header);

  const loading = document.createElement('p');
  loading.className = 'detail-empty';
  loading.textContent = 'Loading session properties…';
  content.appendChild(loading);

  let values = {};
  try {
    const res = await window.electronAPI.getSessionValues(sessionName);
    if (res && res.success) {
      values = res.values || {};
    }
  } catch (err) {
    console.error('Failed to load session details', err);
  }

  content.removeChild(loading);

  if (!Object.keys(values).length) {
    const empty = document.createElement('p');
    empty.className = 'detail-empty';
    empty.textContent = 'No stored properties found for this session.';
    content.appendChild(empty);
    return;
  }

  const originalValues = JSON.parse(JSON.stringify(values));
  const edited = {};

  function markDirty() {
    const hasEdits = Object.keys(edited).length > 0;
    saveBtn.disabled = !hasEdits;
    cancelBtn.disabled = !hasEdits;
  }

  const groups = {};
  const categoryOrder = Object.keys(categoryMap || {});
  categoryOrder.forEach(cat => { groups[cat] = []; });
  groups.Misc = [];

  Object.keys(values).forEach(key => {
    const category = categoryOrder.find(cat => (categoryMap[cat] || []).includes(key));
    if (category) groups[category].push(key);
    else groups.Misc.push(key);
  });

  Object.keys(groups).forEach(groupName => {
    const keys = groups[groupName];
    if (!keys.length) return;

    const detailGroup = document.createElement('details');
    detailGroup.className = 'session-group';
    if (groupName !== 'Misc') detailGroup.open = true;

    const summary = document.createElement('summary');
    summary.className = 'group-title';
    summary.textContent = `${groupName} (${keys.length})`;
    detailGroup.appendChild(summary);

    const groupTable = document.createElement('table');
    groupTable.className = 'details-table';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Key</th><th>Value</th></tr>';
    groupTable.appendChild(thead);
    const tbody = document.createElement('tbody');

    keys.forEach(key => {
      const item = values[key] || {};
      const tr = document.createElement('tr');
      const keyTd = document.createElement('td');
      keyTd.textContent = key;
      keyTd.className = 'key-cell';
      keyTd.title = item.type || 'REG_SZ';
      const valTd = document.createElement('td');

      let displayValue = item.value || '';
      let rawValue = item.value || '';
      if ((item.type || '').toUpperCase() === 'REG_DWORD' && displayValue !== '') {
        const parsed = Number(displayValue);
        if (!Number.isNaN(parsed)) displayValue = String(parsed);
        else if (/^0x[\da-fA-F]+$/.test(displayValue)) displayValue = String(parseInt(displayValue, 16));
      }

      const span = document.createElement('span');
      span.textContent = displayValue;
      if ((item.type || '').toUpperCase() === 'REG_DWORD' && rawValue !== '') span.title = `Raw: ${rawValue}`;
      valTd.appendChild(span);

      valTd.style.cursor = 'text';
      valTd.addEventListener('dblclick', (e) => {
        if (valTd.querySelector('textarea')) return;
        const textarea = document.createElement('textarea');
        textarea.value = rawValue;
        textarea.rows = 4;
        textarea.style.width = '100%';
        textarea.style.minHeight = '5rem';
        textarea.style.resize = 'vertical';
        textarea.style.boxSizing = 'border-box';
        textarea.style.whiteSpace = 'pre-wrap';
        textarea.style.overflowWrap = 'anywhere';
        textarea.style.lineHeight = '1.4';
        valTd.innerHTML = '';
        valTd.appendChild(textarea);
        textarea.focus();

        function commit() {
          const newVal = textarea.value;
          rawValue = newVal;
          let out = newVal;
          if ((item.type || '').toUpperCase() === 'REG_DWORD' && newVal !== '') {
            const p = Number(newVal);
            if (!Number.isNaN(p)) out = String(p);
            else if (/^0x[\da-fA-F]+$/.test(newVal)) out = String(parseInt(newVal, 16));
          }
          span.textContent = out;
          span.title = ((item.type || '').toUpperCase() === 'REG_DWORD') ? `Raw: ${rawValue}` : '';
          valTd.innerHTML = '';
          valTd.appendChild(span);
          if (rawValue !== (originalValues[key] && originalValues[key].value ? originalValues[key].value : '')) {
            edited[key] = { type: item.type || 'REG_SZ', value: rawValue };
          } else {
            delete edited[key];
          }
          markDirty();
        }

        textarea.addEventListener('blur', commit);
        textarea.addEventListener('keydown', (ev) => {
          if (ev.key === 'Escape') {
            ev.preventDefault();
            valTd.innerHTML = '';
            valTd.appendChild(span);
          }
        });
      });

      tr.appendChild(keyTd);
      tr.appendChild(valTd);
      tbody.appendChild(tr);
    });

    groupTable.appendChild(tbody);
    detailGroup.appendChild(groupTable);
    content.appendChild(detailGroup);
  });

  // Save handler
  saveBtn.addEventListener('click', async () => {
    const payload = { set: {}, delete: [] };
    Object.keys(values).forEach(k => {
      const orig = originalValues[k] || {};
      const cur = edited[k] || { type: orig.type || 'REG_SZ', value: orig.value || '' };
      payload.set[k] = { type: cur.type || 'REG_SZ', value: cur.value };
    });
    const res = await window.electronAPI.saveSessionValues(sessionName, payload);
    if (!res || !res.success) return alert('Failed to save session: ' + (res && res.error));
    await refreshSessions();
    await showSessionDetails(sessionName);
  });

  // Cancel handler
  cancelBtn.addEventListener('click', async () => {
    await showSessionDetails(sessionName);
  });

  // Launch handler - if there are edits, save to a temporary session then launch.
  // If there are no edits, launch the original session directly.
  launchBtn.addEventListener('click', async () => {
    const hasEdits = Object.keys(edited).length > 0;
    if (!hasEdits) {
      const lres = await window.electronAPI.launchPutty({ session: sessionName });
      if (!lres || !lres.success) return alert('Failed to launch session: ' + (lres && lres.error));
      return;
    }

    const tmpName = `putty-launcher-tmp-${Date.now()}`;
    const payload = { set: {}, delete: [] };
    Object.keys(values).forEach(k => {
      const orig = originalValues[k] || {};
      const cur = edited[k] || { type: orig.type || 'REG_SZ', value: orig.value || '' };
      payload.set[k] = { type: cur.type || 'REG_SZ', value: cur.value };
    });
    showStatus('Preparing temporary session…');
    const sres = await window.electronAPI.createTempSessionReg(tmpName, payload.set);
    if (!sres || !sres.success) return showStatus('Failed to prepare temporary session: ' + (sres && sres.error));
    const lres = await window.electronAPI.launchPutty({ session: tmpName });
    if (!lres || !lres.success) showStatus('Failed to launch temporary session: ' + (lres && lres.error));
    else showStatus('Launched temporary session: ' + tmpName);
  });
}


  // adjust sessions list height to fit window and show/hide scrollbar as needed
  function adjustTreeHeight() {
    const list = document.getElementById('sessionsList');
    if (!list) return;
    const rect = list.getBoundingClientRect();
    const margin = 36; // room for controls/footer
    const available = Math.max(120, Math.floor(window.innerHeight - rect.top - margin));
    list.style.maxHeight = available + 'px';
  }

  function setupSplitter() {
    const leftPanel = document.getElementById('treePanel');
    const splitter = document.getElementById('splitter');
    if (!leftPanel || !splitter) return;

    let isDragging = false;
    const minLeft = 220;
    const maxLeftRatio = 0.65;

    const startDrag = (ev) => {
      isDragging = true;
      document.body.style.cursor = 'col-resize';
      ev.preventDefault();
    };

    const stopDrag = () => {
      if (!isDragging) return;
      isDragging = false;
      document.body.style.cursor = '';
    };

    const onDrag = (ev) => {
      if (!isDragging) return;
      const layout = document.querySelector('.explorer-layout');
      if (!layout) return;
      const rect = layout.getBoundingClientRect();
      let newWidth = ev.clientX - rect.left;
      newWidth = Math.max(minLeft, Math.min(newWidth, rect.width * maxLeftRatio));
      leftPanel.style.flex = `0 0 ${newWidth}px`;
      leftPanel.style.width = `${newWidth}px`;
    };

    splitter.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('mouseleave', stopDrag);
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
    const cloneSession = document.createElement('div');
    cloneSession.className = 'context-menu-item';
    cloneSession.textContent = 'Clone Session';
    const renameSession = document.createElement('div');
    renameSession.className = 'context-menu-item';
    renameSession.textContent = 'Rename Session';
    const deleteSession = document.createElement('div');
    deleteSession.className = 'context-menu-item';
    deleteSession.textContent = 'Delete Session';
    const edit = document.createElement('div');
    edit.className = 'context-menu-item';
    edit.textContent = 'Edit Category';

    menu.appendChild(launch);
    menu.appendChild(editSession);
    menu.appendChild(cloneSession);
    menu.appendChild(renameSession);
    menu.appendChild(deleteSession);
    menu.appendChild(edit);
    document.body.appendChild(menu);

    // hide on click elsewhere
    document.addEventListener('click', () => { menu.style.display = 'none'; });

    return menu;
  }

  function attachSessionItemHandlers(elem, sessionName, listRoot) {
    elem.addEventListener('click', async () => {
      // use selectSessionElement to centralize selection logic and menu updates
      selectSessionElement(elem);
      await showSessionDetails(sessionName);
    });
    elem.addEventListener('dblclick', async () => {
      const res = await window.electronAPI.launchPutty({ session: sessionName });
      if (!res.success) alert('Failed to launch session: ' + (res.error || 'unknown'));
    });
    elem.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') elem.click(); });

    elem.addEventListener('contextmenu', async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      selectSessionElement(elem);
      const menu = createContextMenu();
      // position
      const x = ev.clientX;
      const y = ev.clientY;
      menu.style.left = x + 'px';
      menu.style.top = y + 'px';
      menu.style.display = 'block';

      const launch = menu.querySelector('.context-menu-item:nth-child(1)');
      const editSession = menu.querySelector('.context-menu-item:nth-child(2)');
      const cloneSession = menu.querySelector('.context-menu-item:nth-child(3)');
      const renameSessionItem = menu.querySelector('.context-menu-item:nth-child(4)');
      const deleteSessionItem = menu.querySelector('.context-menu-item:nth-child(5)');
      const edit = menu.querySelector('.context-menu-item:nth-child(6)');

      // remove previous listeners by replacing with clones (preserves items)
      const newLaunch = launch.cloneNode(true);
      launch.parentNode.replaceChild(newLaunch, launch);
      const newEditSession = editSession.cloneNode(true);
      editSession.parentNode.replaceChild(newEditSession, editSession);
      const newCloneSession = cloneSession.cloneNode(true);
      cloneSession.parentNode.replaceChild(newCloneSession, cloneSession);
      const newRenameSession = renameSessionItem.cloneNode(true);
      renameSessionItem.parentNode.replaceChild(newRenameSession, renameSessionItem);
      const newDeleteSession = deleteSessionItem.cloneNode(true);
      deleteSessionItem.parentNode.replaceChild(newDeleteSession, deleteSessionItem);
      const newEdit = edit.cloneNode(true);
      edit.parentNode.replaceChild(newEdit, edit);

      newLaunch.addEventListener('click', async () => {
        menu.style.display = 'none';
        elem.click();
        const res = await window.electronAPI.launchPutty({ session: sessionName });
        if (!res.success) alert('Failed to launch session: ' + (res.error || 'unknown'));
      });
      newEditSession.addEventListener('click', async () => {
        menu.style.display = 'none';
        await showEditSessionDialog(sessionName);
      });
      newCloneSession.addEventListener('click', async () => {
        menu.style.display = 'none';
        elem.click();
        await showCloneSessionDialog(sessionName);
      });
      newRenameSession.addEventListener('click', async () => {
        menu.style.display = 'none';
        elem.click();
        await renameSelectedSession(sessionName);
      });
      newDeleteSession.addEventListener('click', async () => {
        menu.style.display = 'none';
        elem.click();
        await deleteSelectedSession(sessionName);
      });
      newEdit.addEventListener('click', async () => {
        menu.style.display = 'none';
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
    if (el.classList.contains('session-item')) {
      currentSelectedSession = el.dataset.sessionName || el.textContent;
      if (window.electronAPI && typeof window.electronAPI.updateSessionMenuState === 'function') {
        window.electronAPI.updateSessionMenuState(true);
      }
    } else {
      currentSelectedSession = null;
      if (window.electronAPI && typeof window.electronAPI.updateSessionMenuState === 'function') {
        window.electronAPI.updateSessionMenuState(false);
      }
    }
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

  const sessionRow = document.createElement('div'); sessionRow.className = 'modal-field';
  const sessionLabel = document.createElement('label'); sessionLabel.className = 'modal-label'; sessionLabel.textContent = 'Session Name';
  const sessionInput = document.createElement('input'); sessionInput.type = 'text'; sessionInput.className = 'modal-input session-name-input';
  sessionRow.appendChild(sessionLabel);
  sessionRow.appendChild(sessionInput);
  content.appendChild(sessionRow);

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
  const sessionInput = modal.querySelector('.session-name-input');
  const ok = modal.querySelector('.modal-ok');
  const cancel = modal.querySelector('.modal-cancel');
  const addBtn = modal.querySelector('.modal-add');

  headerInfo.textContent = `Session: ${sessionName}`;
  sessionInput.value = sessionName;
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
      const newSessionName = sessionInput.value.trim();
      if (!newSessionName) {
        alert('Session name cannot be empty.');
        return;
      }
      if (newSessionName !== sessionName) {
        const renameRes = await window.electronAPI.renameSession(sessionName, newSessionName);
        if (!renameRes || !renameRes.success) {
          alert('Failed to rename session: ' + (renameRes && renameRes.error));
          return;
        }
      }
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
      const res = await window.electronAPI.saveSessionValues(newSessionName, payload);
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

function createCloneSessionDialog() {
  let modal = document.getElementById('cloneSessionModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'cloneSessionModal';
  modal.className = 'modal-overlay';
  modal.style.display = 'none';

  const dlg = document.createElement('div');
  dlg.className = 'modal-dialog';

  const title = document.createElement('div');
  title.className = 'modal-title';
  title.textContent = 'Clone Session';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'modal-input';
  input.placeholder = 'New session name';

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

  modal.addEventListener('click', (ev) => { if (ev.target === modal) modal.style.display = 'none'; });

  return modal;
}

async function showCloneSessionDialog(sessionName) {
  sessionName = sessionName || currentSelectedSession;
  if (!sessionName) {
    showStatus('No session selected to clone.');
    return;
  }
  
  // Get the source session's values
  let sourceValues = {};
  try {
    const res = await window.electronAPI.getSessionValues(sessionName);
    if (res && res.success) {
      sourceValues = res.values || {};
    } else {
      showStatus('Failed to load source session');
      return;
    }
  } catch (err) {
    showStatus('Failed to load source session: ' + err);
    return;
  }

  const modal = createCloneSessionDialog();
  const input = modal.querySelector('.modal-input');
  const ok = modal.querySelector('.modal-ok');
  const cancel = modal.querySelector('.modal-cancel');

  input.value = sessionName + ' (copy)';
  modal.style.display = 'flex';
  input.focus();
  input.select();

  return new Promise((resolve) => {
    const cleanup = () => {
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKeyDown);
      modal.style.display = 'none';
    };
    const onOk = async () => {
      const newName = input.value.trim();
      if (!newName) {
        cleanup();
        resolve();
        return;
      }
      try {
        const payload = { set: sourceValues, delete: [] };
        const res = await window.electronAPI.saveSessionValues(newName, payload);
        if (!res || !res.success) {
          showStatus('Failed to clone session: ' + (res && res.error ? res.error : 'unknown'));
        } else {
          showStatus(`Session cloned to "${newName}"`);
          await refreshSessions();
        }
      } catch (err) {
        showStatus('Error cloning session: ' + err);
      }
      cleanup();
      resolve();
    };
    const onCancel = () => { cleanup(); resolve(); };
    const onKeyDown = (ev) => { if (ev.key === 'Enter') onOk(); else if (ev.key === 'Escape') onCancel(); };
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKeyDown);
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
  const pathRow = document.createElement('div'); pathRow.className = 'modal-field-row';
  const input = document.createElement('input'); input.type = 'text'; input.className = 'modal-input'; input.id = 'settings-puttyPath';
  const choose = document.createElement('button'); choose.className = 'modal-choose modal-file-button'; choose.type = 'button'; choose.innerHTML = '📁'; choose.title = 'Choose PuTTY executable';
  pathRow.appendChild(input);
  pathRow.appendChild(choose);

  const themeLabel = document.createElement('label'); themeLabel.textContent = 'Theme';
  const themeSelect = document.createElement('select'); themeSelect.className = 'modal-input'; themeSelect.id = 'settings-theme';
  themeSelect.innerHTML = '<option value="light">Light</option><option value="dark">Dark</option>';

  const buttons = document.createElement('div'); buttons.className = 'modal-buttons';
  const ok = document.createElement('button'); ok.textContent = 'Save'; ok.className = 'modal-ok';
  const cancel = document.createElement('button'); cancel.textContent = 'Cancel'; cancel.className = 'modal-cancel';
  buttons.appendChild(cancel); buttons.appendChild(ok);

  dlg.appendChild(title);
  dlg.appendChild(label);
  dlg.appendChild(pathRow);
  dlg.appendChild(themeLabel);
  dlg.appendChild(themeSelect);
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
    const themeSelectEl = modal.querySelector('#settings-theme');
    const p = inp.value.trim();
    const theme = themeSelectEl.value || 'light';
    await window.electronAPI.setConfigValue('theme', theme);
    if (p) {
      await window.electronAPI.setPuttyPath(p);
      alert('Saved PuTTY path and theme');
    } else {
      alert('Saved theme');
    }
    applyTheme(theme);
    modal.style.display = 'none';
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
  const themeSelectEl = modal.querySelector('#settings-theme');
  const cfg = await refreshConfig();
  input.value = (cfg && cfg.puttyPath) ? cfg.puttyPath : '';
  themeSelectEl.value = (cfg && cfg.theme) ? cfg.theme : 'light';
  modal.style.display = 'flex';
  input.focus();
}

// Create Import Preview Modal
function createImportPreviewModal() {
  let modal = document.getElementById('importPreviewModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'importPreviewModal';
  modal.className = 'modal-overlay';
  modal.style.display = 'none';

  const dlg = document.createElement('div');
  dlg.className = 'modal-dialog large';

  const header = document.createElement('div'); header.className = 'modal-header';
  const title = document.createElement('div'); title.className = 'modal-title'; title.textContent = 'Import Sessions';
  const info = document.createElement('div'); info.className = 'modal-info';
  header.appendChild(title); header.appendChild(info);

  const content = document.createElement('div'); content.className = 'modal-content';
  const list = document.createElement('div'); list.className = 'session-list';
  content.appendChild(list);

  const footer = document.createElement('div'); footer.className = 'modal-footer';
  const selectAll = document.createElement('button'); selectAll.textContent = 'Select All'; selectAll.className = 'modal-select-all';
  const deselectAll = document.createElement('button'); deselectAll.textContent = 'Deselect All'; deselectAll.className = 'modal-deselect-all';
  const buttons = document.createElement('div'); buttons.className = 'modal-buttons';
  const ok = document.createElement('button'); ok.textContent = 'Import Selected'; ok.className = 'modal-ok';
  const cancel = document.createElement('button'); cancel.textContent = 'Cancel'; cancel.className = 'modal-cancel';
  buttons.appendChild(cancel); buttons.appendChild(ok);
  footer.appendChild(selectAll); footer.appendChild(deselectAll); footer.appendChild(buttons);

  dlg.appendChild(header);
  dlg.appendChild(content);
  dlg.appendChild(footer);
  modal.appendChild(dlg);
  document.body.appendChild(modal);

  modal.addEventListener('click', (ev) => { if (ev.target === modal) modal.style.display = 'none'; });

  selectAll.addEventListener('click', () => {
    list.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
  });
  deselectAll.addEventListener('click', () => {
    list.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
  });

  return modal;
}

async function showImportPreviewModal(previewData) {
  const modal = createImportPreviewModal();
  const info = modal.querySelector('.modal-info');
  const list = modal.querySelector('.session-list');
  const ok = modal.querySelector('.modal-ok');
  const cancel = modal.querySelector('.modal-cancel');

  info.textContent = `File: ${previewData.filePath} (${previewData.type.toUpperCase()})`;
  list.innerHTML = '';
  previewData.sessions.forEach(session => {
    const item = document.createElement('div'); item.className = 'import-item';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = true;
    const label = document.createElement('label'); label.textContent = session;
    item.appendChild(cb); item.appendChild(label);
    list.appendChild(item);
  });

  modal.style.display = 'flex';

  return new Promise((resolve) => {
    const cleanup = () => { ok.removeEventListener('click', onOk); cancel.removeEventListener('click', onCancel); modal.style.display = 'none'; };
    const onOk = async () => {
      const selected = [];
      list.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
        const label = cb.nextElementSibling;
        if (label) selected.push(label.textContent);
      });
      if (selected.length === 0) {
        alert('No sessions selected.');
        return;
      }
      const res = await window.electronAPI.importSelectedSessions({ filePath: previewData.filePath, type: previewData.type, selectedSessions: selected });
      if (!res || !res.success) alert('Import failed: ' + (res && res.error));
      else { alert(`Imported ${selected.length} session(s)`); await refreshSessions(); }
      cleanup();
      resolve();
    };
    const onCancel = () => { cleanup(); resolve(); };
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  const cfg = await refreshConfig();
  applyTheme(cfg && cfg.theme ? cfg.theme : 'light');
  refreshSessions();
  setupSplitter();

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
      const res = await window.electronAPI.previewImportReg();
      if (!res || !res.success) alert('Preview failed: ' + (res && res.error));
      else await showImportPreviewModal(res);
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
      const res = await window.electronAPI.previewImportJson();
      if (!res || !res.success) alert('Preview failed: ' + (res && res.error));
      else await showImportPreviewModal(res);
    });
  }

  if (window.electronAPI && typeof window.electronAPI.onRefreshSessions === 'function') {
    window.electronAPI.onRefreshSessions(async () => {
      if (window.electronAPI && typeof window.electronAPI.reloadSessions === 'function') {
        const r = await window.electronAPI.reloadSessions();
        if (!r || !r.success) return alert('Failed to reload sessions: ' + (r && r.error));
      }
      await refreshSessions();
    });
  }

  if (window.electronAPI && typeof window.electronAPI.onCloneSession === 'function') {
    window.electronAPI.onCloneSession(async () => {
      const sessionName = currentSelectedSession || (document.querySelector('.session-item.selected') && document.querySelector('.session-item.selected').dataset.sessionName);
      if (sessionName) {
        await showCloneSessionDialog(sessionName);
      } else {
        showStatus('Please select a session to clone.');
      }
    });
  }

  if (window.electronAPI && typeof window.electronAPI.onLaunchSession === 'function') {
    window.electronAPI.onLaunchSession(async () => {
      const sessionName = currentSelectedSession || (document.querySelector('.session-item.selected') && document.querySelector('.session-item.selected').dataset.sessionName);
      if (sessionName) {
        const res = await window.electronAPI.launchPutty({ session: sessionName });
        if (!res.success) alert('Failed to launch session: ' + (res.error || 'unknown'));
      }
    });
  }

  if (window.electronAPI && typeof window.electronAPI.onRenameSession === 'function') {
    window.electronAPI.onRenameSession(async () => {
      const sessionName = currentSelectedSession || (document.querySelector('.session-item.selected') && document.querySelector('.session-item.selected').dataset.sessionName);
      if (sessionName) await renameSelectedSession(sessionName);
      else showStatus('Please select a session to rename.');
    });
  }

  if (window.electronAPI && typeof window.electronAPI.onDeleteSession === 'function') {
    window.electronAPI.onDeleteSession(async () => {
      const sessionName = currentSelectedSession || (document.querySelector('.session-item.selected') && document.querySelector('.session-item.selected').dataset.sessionName);
      if (sessionName) await deleteSelectedSession(sessionName);
      else showStatus('Please select a session to delete.');
    });
  }

  // import/export handlers
  $('exportReg')?.addEventListener('click', async () => {
    const res = await window.electronAPI.exportSessionsReg();
    if (!res || !res.success) alert('Export failed: ' + (res && res.error));
    else alert('Exported to ' + res.path);
  });
  $('importReg')?.addEventListener('click', async () => {
    const res = await window.electronAPI.previewImportReg();
    if (!res || !res.success) alert('Preview failed: ' + (res && res.error));
    else await showImportPreviewModal(res);
  });
  $('exportJson')?.addEventListener('click', async () => {
    const res = await window.electronAPI.exportSessionsJson();
    if (!res || !res.success) alert('Export failed: ' + (res && res.error));
    else alert('Exported to ' + res.path);
  });
  $('importJson')?.addEventListener('click', async () => {
    const res = await window.electronAPI.previewImportJson();
    if (!res || !res.success) alert('Preview failed: ' + (res && res.error));
    else await showImportPreviewModal(res);
  });
});
