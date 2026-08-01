const state = {
  commands: [],
  logs: [],
  activeCat: '__all',
  search: '',
  editingId: null
};

const el = {
  tabs: document.querySelectorAll('.tab'),
  views: {
    commands: document.getElementById('view-commands'),
    log: document.getElementById('view-log')
  },
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),

  search: document.getElementById('search'),
  catList: document.getElementById('catList'),
  countAll: document.getElementById('countAll'),
  openAddForm: document.getElementById('openAddForm'),
  addForm: document.getElementById('addForm'),
  addFormTitle: document.getElementById('addFormTitle'),
  submitAdd: document.getElementById('submitAdd'),
  cancelAdd: document.getElementById('cancelAdd'),
  catOptions: document.getElementById('catOptions'),
  cmdList: document.getElementById('cmdList'),
  cmdEmpty: document.getElementById('cmdEmpty'),

  logText: document.getElementById('logText'),
  logSubmit: document.getElementById('logSubmit'),
  ledger: document.getElementById('ledger'),
  logEmpty: document.getElementById('logEmpty'),

  toast: document.getElementById('toast')
};

// ---------- tabs ----------

el.tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    el.tabs.forEach((t) => { t.classList.remove('is-active'); t.setAttribute('aria-selected', 'false'); });
    tab.classList.add('is-active');
    tab.setAttribute('aria-selected', 'true');
    Object.values(el.views).forEach((v) => v.classList.remove('is-active'));
    el.views[tab.dataset.tab].classList.add('is-active');
  });
});

// ---------- toast ----------

let toastTimer = null;
function showToast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), 1800);
}

// ---------- status ----------

async function checkStatus() {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) throw new Error();
    el.statusDot.className = 'status-dot is-live';
    el.statusText.textContent = 'online';
  } catch {
    el.statusDot.className = 'status-dot is-down';
    el.statusText.textContent = 'offline';
  }
}

// ---------- commands ----------

async function loadCommands() {
  const res = await fetch('/api/commands');
  state.commands = await res.json();
  renderCategories();
  renderCommands();
}

function renderCategories() {
  const cats = [...new Set(state.commands.map((c) => c.category || 'Uncategorized'))].sort();
  el.countAll.textContent = state.commands.length;
  el.catList.querySelectorAll('.cat-item[data-cat]:not([data-cat="__all"])').forEach((n) => n.parentElement.remove());
  cats.forEach((cat) => {
    const li = document.createElement('li');
    const count = state.commands.filter((c) => (c.category || 'Uncategorized') === cat).length;
    li.innerHTML = `<button class="cat-item" data-cat="${escapeAttr(cat)}">${escapeHtml(cat)}<span class="cat-count">${count}</span></button>`;
    el.catList.appendChild(li);
  });
  el.catOptions.innerHTML = cats.map((c) => `<option value="${escapeAttr(c)}"></option>`).join('');
  el.catList.querySelectorAll('.cat-item').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.cat === state.activeCat);
    btn.addEventListener('click', () => {
      state.activeCat = btn.dataset.cat;
      el.catList.querySelectorAll('.cat-item').forEach((b) => b.classList.toggle('is-active', b === btn));
      renderCommands();
    });
  });
}

function renderCommands() {
  const q = state.search.trim().toLowerCase();
  const filtered = state.commands.filter((c) => {
    const inCat = state.activeCat === '__all' || (c.category || 'Uncategorized') === state.activeCat;
    if (!inCat) return false;
    if (!q) return true;
    return [c.name, c.command, c.description, c.category].join(' ').toLowerCase().includes(q);
  });

  el.cmdList.innerHTML = '';
  el.cmdEmpty.hidden = filtered.length !== 0;

  filtered.forEach((c) => {
    const row = document.createElement('div');
    row.className = 'cmd-row';
    row.innerHTML = `
      <div class="cmd-tick"></div>
      <div class="cmd-main">
        <div class="cmd-head">
          <span class="cmd-name">${escapeHtml(c.name)}</span>
          <span class="cmd-cat">${escapeHtml(c.category || 'Uncategorized')}</span>
        </div>
        <code class="cmd-string">${escapeHtml(c.command)}</code>
        ${c.description ? `<p class="cmd-desc">${escapeHtml(c.description)}</p>` : ''}
      </div>
      <div class="cmd-actions">
        <button class="icon-btn is-copy" data-action="copy" data-id="${c.id}">Copy</button>
        <button class="icon-btn" data-action="edit" data-id="${c.id}">Edit</button>
        <button class="icon-btn is-danger" data-action="delete" data-id="${c.id}">Delete</button>
      </div>
    `;
    el.cmdList.appendChild(row);
  });
}

el.cmdList.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  const entry = state.commands.find((c) => c.id === id);
  if (!entry) return;

  if (btn.dataset.action === 'copy') {
    try {
      await navigator.clipboard.writeText(entry.command);
      btn.textContent = 'Copied';
      btn.classList.add('is-copied');
      showToast('คัดลอกคำสั่งแล้ว');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('is-copied'); }, 1400);
    } catch {
      showToast('คัดลอกไม่สำเร็จ ลองใหม่อีกครั้ง');
    }
  }

  if (btn.dataset.action === 'edit') {
    openEditForm(entry);
  }

  if (btn.dataset.action === 'delete') {
    if (!confirm(`ลบคำสั่ง "${entry.name}" ?`)) return;
    const res = await fetch(`/api/commands/${id}`, { method: 'DELETE' });
    if (res.ok) {
      state.commands = state.commands.filter((c) => c.id !== id);
      if (state.editingId === id) resetAddForm();
      renderCategories();
      renderCommands();
      showToast('ลบคำสั่งแล้ว');
    }
  }
});

function openEditForm(entry) {
  state.editingId = entry.id;
  document.getElementById('f-category').value = entry.category || '';
  document.getElementById('f-name').value = entry.name || '';
  document.getElementById('f-command').value = entry.command || '';
  document.getElementById('f-description').value = entry.description || '';
  el.addFormTitle.textContent = 'Edit command';
  el.submitAdd.textContent = 'Update command';
  el.addForm.hidden = false;
  document.getElementById('f-name').focus();
  el.addForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function resetAddForm() {
  state.editingId = null;
  el.addForm.reset();
  el.addForm.hidden = true;
  el.addFormTitle.textContent = 'Add command';
  el.submitAdd.textContent = 'Save command';
}

el.search.addEventListener('input', (e) => {
  state.search = e.target.value;
  renderCommands();
});

el.openAddForm.addEventListener('click', () => {
  if (state.editingId) {
    resetAddForm();
    return;
  }
  el.addForm.hidden = !el.addForm.hidden;
  if (!el.addForm.hidden) document.getElementById('f-name').focus();
});

el.cancelAdd.addEventListener('click', () => {
  resetAddForm();
});

el.addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    category: document.getElementById('f-category').value,
    name: document.getElementById('f-name').value,
    command: document.getElementById('f-command').value,
    description: document.getElementById('f-description').value
  };

  const isEditing = Boolean(state.editingId);
  const url = isEditing ? `/api/commands/${state.editingId}` : '/api/commands';
  const method = isEditing ? 'PUT' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (res.ok) {
    resetAddForm();
    await loadCommands();
    showToast(isEditing ? 'แก้ไขคำสั่งแล้ว' : 'บันทึกคำสั่งใหม่แล้ว');
  } else {
    const err = await res.json().catch(() => ({}));
    showToast(err.error || 'บันทึกไม่สำเร็จ');
  }
});

// ---------- log ----------

async function loadLogs() {
  const res = await fetch('/api/logs');
  state.logs = await res.json();
  renderLogs();
}

function renderLogs() {
  el.ledger.innerHTML = '';
  el.logEmpty.hidden = state.logs.length !== 0;

  state.logs.forEach((log) => {
    const created = new Date(log.createdAt);
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `
      <div class="log-time">
        <span class="log-date">${formatDate(created)}</span>
        ${formatTime(created)}
      </div>
      <div class="log-body">${escapeHtml(log.text)}</div>
      <div class="log-actions">
        <button class="icon-btn is-danger" data-action="delete-log" data-id="${log.id}">Delete</button>
      </div>
    `;
    el.ledger.appendChild(entry);
  });
}

el.ledger.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action="delete-log"]');
  if (!btn) return;
  if (!confirm('ลบบันทึกนี้ ?')) return;
  const res = await fetch(`/api/logs/${btn.dataset.id}`, { method: 'DELETE' });
  if (res.ok) {
    state.logs = state.logs.filter((l) => l.id !== btn.dataset.id);
    renderLogs();
    showToast('ลบบันทึกแล้ว');
  }
});

async function submitLog() {
  const text = el.logText.value;
  if (!text.trim()) return;
  const res = await fetch('/api/logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  if (res.ok) {
    el.logText.value = '';
    await loadLogs();
    showToast('บันทึกรายการแล้ว');
  } else {
    showToast('บันทึกไม่สำเร็จ');
  }
}

el.logSubmit.addEventListener('click', submitLog);
el.logText.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitLog();
  }
});

// ---------- helpers ----------

function formatDate(d) {
  return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short' });
}

function formatTime(d) {
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/`/g, '&#96;');
}

// ---------- init ----------

checkStatus();
setInterval(checkStatus, 15000);
loadCommands();
loadLogs();
