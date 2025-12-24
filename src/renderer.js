function $(id) { return document.getElementById(id); }

async function refreshConfig() {
  return await window.electronAPI.getConfig();
}

function renderSessionsTree(tree) {
  const ul = $('sessionsList');
  ul.innerHTML = '';
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

    if (!isRoot) {
      const header = document.createElement('div');
      header.className = 'category-header';
      header.tabIndex = 0;
      // create arrow and title elements so arrow click only toggles collapse
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.tabIndex = 0;
      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = node.name;
      header.appendChild(arrow);
      header.appendChild(title);
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
      });

      childUl.style.display = 'none';
      arrow.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const isHidden = childUl.style.display === 'none' || !childUl.style.display;
        childUl.style.display = isHidden ? 'block' : 'none';
        header.classList.toggle('expanded', isHidden);
      });
      arrow.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') arrow.click(); });

      childContainer.appendChild(childUl);
      nodeLi.appendChild(header);
      nodeLi.appendChild(childContainer);
    } else {
      Object.keys(node.children || {}).forEach(k => renderNode(node.children[k], nodeLi, false));
      (node.sessions || []).forEach(s => {
        const c = document.createElement('li');
        c.textContent = s;
        c.tabIndex = 0;
        c.className = 'session-item';
        attachSessionItemHandlers(c, s, ul);
        nodeLi.appendChild(c);
      });
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
    const edit = document.createElement('div');
    edit.className = 'context-menu-item';
    edit.textContent = 'Edit Category';

    menu.appendChild(launch);
    menu.appendChild(edit);
    document.body.appendChild(menu);

    // hide on click elsewhere
    document.addEventListener('click', () => { menu.style.display = 'none'; });

    return menu;
  }

  function attachSessionItemHandlers(elem, sessionName, listRoot) {
    elem.addEventListener('click', () => {
      document.querySelectorAll('.session-item').forEach(x => x.classList.remove('selected'));
      elem.classList.add('selected');
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
      const edit = menu.querySelector('.context-menu-item:nth-child(2)');

      // remove previous listeners by replacing with clones (preserves both items)
      const newLaunch = launch.cloneNode(true);
      launch.parentNode.replaceChild(newLaunch, launch);
      const newEdit = edit.cloneNode(true);
      edit.parentNode.replaceChild(newEdit, edit);

      newLaunch.addEventListener('click', async () => {
        menu.style.display = 'none';
        // select the item
        elem.click();
        const res = await window.electronAPI.launchPutty({ session: sessionName });
        if (!res.success) alert('Failed to launch session: ' + (res.error || 'unknown'));
      });

      newEdit.addEventListener('click', async () => {
        menu.style.display = 'none';
        // open modal editor instead of prompt
        await showEditCategoryDialog(sessionName);
      });
    });
  }

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

  $('refreshSessions').addEventListener('click', refreshSessions);

  $('launchSession').addEventListener('click', async () => {
    const ul = $('sessionsList');
    const sel = ul.querySelector('.selected');
    if (!sel) return alert('Select a session from the list');
    const session = sel.textContent;
    const res = await window.electronAPI.launchPutty({ session });
    if (!res.success) alert('Failed to launch session: ' + (res.error || 'unknown'));
  });
});
