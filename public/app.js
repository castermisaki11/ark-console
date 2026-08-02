const state = {
  commands: [],
  categories: [], // [{ category, count }] — fetched separately since /api/commands is now paginated
  logs: [],
  activeCat: '__all',
  search: '',
  editingId: null,
  audit: {
    entries: [],
    page: 1,
    totalPages: 1
  },
  cmd: {
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1
  },
  log: {
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1
  },
  usageLoaded: false
};

let searchDebounceTimer = null;

const el = {
  tabs: document.querySelectorAll('.tab'),
  views: {
    commands: document.getElementById('view-commands'),
    log: document.getElementById('view-log'),
    tools: document.getElementById('view-tools'),
    audit: document.getElementById('view-audit')
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
  cmdPagination: document.getElementById('cmdPagination'),
  cmdPageInfo: document.getElementById('cmdPageInfo'),
  cmdPrev: document.getElementById('cmdPrev'),
  cmdNext: document.getElementById('cmdNext'),

  usageList: document.getElementById('usageList'),
  usageEmpty: document.getElementById('usageEmpty'),

  exportBtn: document.getElementById('exportBtn'),
  importFile: document.getElementById('importFile'),
  importBtn: document.getElementById('importBtn'),
  importResult: document.getElementById('importResult'),

  logText: document.getElementById('logText'),
  logSubmit: document.getElementById('logSubmit'),
  ledger: document.getElementById('ledger'),
  logEmpty: document.getElementById('logEmpty'),
  logPagination: document.getElementById('logPagination'),
  logPageInfo: document.getElementById('logPageInfo'),
  logPrev: document.getElementById('logPrev'),
  logNext: document.getElementById('logNext'),

  auditBody: document.getElementById('auditBody'),
  auditEmpty: document.getElementById('auditEmpty'),
  auditPagination: document.getElementById('auditPagination'),
  auditPageInfo: document.getElementById('auditPageInfo'),
  auditPrev: document.getElementById('auditPrev'),
  auditNext: document.getElementById('auditNext'),

  toast: document.getElementById('toast'),

  userBadge: document.getElementById('userBadge'),
  userAvatar: document.getElementById('userAvatar'),
  userDisplayName: document.getElementById('userDisplayName'),
  logoutBtn: document.getElementById('logoutBtn')
};

// ---------- theme ----------

const THEME_KEY = 'ark-console-theme';
const themeButtons = document.querySelectorAll('.theme-btn');

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeButtons.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.themeChoice === theme);
  });
}

themeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const theme = btn.dataset.themeChoice;
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
    applyTheme(theme);
  });
});

applyTheme(document.documentElement.getAttribute('data-theme') || 'brown');

// ---------- tabs ----------

el.tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    el.tabs.forEach((t) => { t.classList.remove('is-active'); t.setAttribute('aria-selected', 'false'); });
    tab.classList.add('is-active');
    tab.setAttribute('aria-selected', 'true');
    Object.values(el.views).forEach((v) => v.classList.remove('is-active'));
    el.views[tab.dataset.tab].classList.add('is-active');
    if (tab.dataset.tab === 'audit') loadAuditLogs(state.audit.page);
    if (tab.dataset.tab === 'commands' && !state.usageLoaded) loadUsageSummary();
  });
});

// ---------- usage tracking ----------

function getClientId() {
  let id = localStorage.getItem('ark-console-client-id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('ark-console-client-id', id);
  }
  return id;
}

function trackEvent(type, meta) {
  fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, clientId: getClientId(), meta })
  }).catch(() => {
    // เก็บสถิติไม่สำเร็จ ไม่ต้องรบกวนผู้ใช้ ปล่อยผ่านเงียบๆ
  });
}

// ---------- toast ----------

let toastTimer = null;
function showToast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), 1800);
}

async function copyToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const original = btn.textContent;
    btn.textContent = 'Copied';
    btn.classList.add('is-copied');
    showToast('คัดลอกคำสั่งแล้ว');
    setTimeout(() => { btn.textContent = original; btn.classList.remove('is-copied'); }, 1400);
  } catch {
    showToast('คัดลอกไม่สำเร็จ ลองใหม่อีกครั้ง');
  }
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

// ---------- current user ----------

async function loadUser() {
  try {
    const res = await fetch('/auth/me');
    if (!res.ok) throw new Error();
    const user = await res.json();
    el.userAvatar.src = user.avatarUrl;
    el.userAvatar.alt = user.displayName;
    el.userDisplayName.textContent = user.displayName;
    el.userBadge.hidden = false;
  } catch {
    // ถ้าดึงข้อมูลผู้ใช้ไม่สำเร็จ (เช่น session หมดอายุ) ปล่อยผ่าน —
    // request อื่นที่ตามมาจะโดน redirect ไป /login เองอยู่แล้ว
  }
}

el.logoutBtn.addEventListener('click', async () => {
  await fetch('/logout', { method: 'POST' }).catch(() => {});
  window.location.href = '/login';
});

// ---------- commands ----------

async function loadCommands(page = state.cmd.page) {
  const params = new URLSearchParams({ page: String(page), limit: String(state.cmd.limit) });
  if (state.activeCat !== '__all') params.set('category', state.activeCat);
  if (state.search.trim()) params.set('q', state.search.trim());

  const res = await fetch(`/api/commands?${params.toString()}`);
  const body = await res.json();
  state.commands = body.data;
  state.cmd.page = body.pagination.page;
  state.cmd.total = body.pagination.total;
  state.cmd.totalPages = body.pagination.totalPages;
  renderCommands();
  renderCommandsPagination();
}

async function loadCategories() {
  const res = await fetch('/api/commands/categories');
  const body = await res.json();
  state.categories = body.categories || [];
  renderCategories(body.total || 0);
}

function renderCategories(totalCount) {
  el.countAll.textContent = totalCount;
  el.catList.querySelectorAll('.cat-item[data-cat]:not([data-cat="__all"])').forEach((n) => n.parentElement.remove());
  state.categories.forEach(({ category, count }) => {
    const li = document.createElement('li');
    li.innerHTML = `<button class="cat-item" data-cat="${escapeAttr(category)}">${escapeHtml(category)}<span class="cat-count">${count}</span></button>`;
    el.catList.appendChild(li);
  });
  el.catOptions.innerHTML = state.categories.map(({ category }) => `<option value="${escapeAttr(category)}"></option>`).join('');
  el.catList.querySelectorAll('.cat-item').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.cat === state.activeCat);
    btn.addEventListener('click', () => {
      state.activeCat = btn.dataset.cat;
      el.catList.querySelectorAll('.cat-item').forEach((b) => b.classList.toggle('is-active', b === btn));
      loadCommands(1);
    });
  });
}

function renderCommandsPagination() {
  const { page, totalPages, total } = state.cmd;
  el.cmdPagination.hidden = total === 0;
  el.cmdPageInfo.textContent = `Page ${page} / ${totalPages} (${total})`;
  el.cmdPrev.disabled = page <= 1;
  el.cmdNext.disabled = page >= totalPages;
}

function renderCommands() {
  el.cmdList.innerHTML = '';
  el.cmdEmpty.hidden = state.commands.length !== 0;

  state.commands.forEach((c) => {
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
      trackEvent('copy_command', { id: entry.id, name: entry.name });
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
      if (state.editingId === id) resetAddForm();
      // Deleting the only row on a page (e.g. the last page) would
      // otherwise leave that page blank — step back one page instead.
      const nextPage = (state.commands.length === 1 && state.cmd.page > 1)
        ? state.cmd.page - 1
        : state.cmd.page;
      await Promise.all([loadCommands(nextPage), loadCategories()]);
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
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => loadCommands(1), 300);
});

el.cmdPrev.addEventListener('click', () => {
  if (state.cmd.page > 1) loadCommands(state.cmd.page - 1);
});
el.cmdNext.addEventListener('click', () => {
  if (state.cmd.page < state.cmd.totalPages) loadCommands(state.cmd.page + 1);
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
    // A brand-new command should be visible, so jump to page 1 when
    // creating; an edit doesn't change row count/order-relevant fields
    // enough to justify moving the admin off the page they're on.
    await Promise.all([loadCommands(isEditing ? state.cmd.page : 1), loadCategories()]);
    showToast(isEditing ? 'แก้ไขคำสั่งแล้ว' : 'บันทึกคำสั่งใหม่แล้ว');
  } else {
    const err = await res.json().catch(() => ({}));
    showToast(err.error || 'บันทึกไม่สำเร็จ');
  }
});

// ---------- command backup (export / import) ----------

const IMPORT_MAX_FILE_BYTES = 2 * 1024 * 1024; // matches the server's express.json() limit
let importFileSelected = null;

el.exportBtn.addEventListener('click', async () => {
  try {
    const res = await fetch('/api/commands/export');
    if (!res.ok) throw new Error();
    const blob = await res.blob();

    // Filename comes from the server's Content-Disposition header; fall
    // back to a sensible default if that's ever missing.
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?([^"]+)"?/);
    const filename = match ? match[1] : 'ark-commands-export.json';

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('ส่งออกคำสั่งแล้ว');
  } catch {
    showToast('ส่งออกไม่สำเร็จ');
  }
});

el.importFile.addEventListener('change', () => {
  importFileSelected = el.importFile.files[0] || null;
  el.importBtn.disabled = !importFileSelected;
  el.importResult.hidden = true;
});

el.importBtn.addEventListener('click', async () => {
  if (!importFileSelected) return;

  if (importFileSelected.size > IMPORT_MAX_FILE_BYTES) {
    showToast('ไฟล์ใหญ่เกินไป (จำกัด 2MB)');
    return;
  }

  let parsed;
  try {
    const text = await importFileSelected.text();
    parsed = JSON.parse(text);
  } catch {
    showToast('ไฟล์ไม่ใช่ JSON ที่ถูกต้อง');
    return;
  }

  // Accept either the full export shape ({ commands: [...] }) or a bare
  // array of command objects.
  const commands = Array.isArray(parsed) ? parsed : parsed.commands;
  if (!Array.isArray(commands)) {
    showToast('รูปแบบไฟล์ไม่ถูกต้อง — ต้องมี "commands" เป็น array');
    return;
  }

  el.importBtn.disabled = true;
  el.importBtn.textContent = 'Importing…';

  try {
    const res = await fetch('/api/commands/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands })
    });
    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      showToast(body.error || 'นำเข้าไม่สำเร็จ');
      return;
    }

    el.importResult.hidden = false;
    el.importResult.innerHTML =
      `Import complete<br>Imported: <strong>${escapeHtml(String(body.imported))}</strong> · ` +
      `Skipped: <strong>${escapeHtml(String(body.skipped))}</strong>`;
    showToast(`นำเข้าสำเร็จ (${body.imported} รายการ)`);

    el.importFile.value = '';
    importFileSelected = null;
    await Promise.all([loadCommands(1), loadCategories()]);
  } catch {
    showToast('นำเข้าไม่สำเร็จ');
  } finally {
    el.importBtn.disabled = !importFileSelected;
    el.importBtn.textContent = 'Import commands';
  }
});

// ---------- log ----------

async function loadLogs(page = state.log.page) {
  const params = new URLSearchParams({ page: String(page), limit: String(state.log.limit) });
  const res = await fetch(`/api/logs?${params.toString()}`);
  const body = await res.json();
  state.logs = body.data;
  state.log.page = body.pagination.page;
  state.log.total = body.pagination.total;
  state.log.totalPages = body.pagination.totalPages;
  renderLogs();
  renderLogsPagination();
}

function renderLogsPagination() {
  const { page, totalPages, total } = state.log;
  el.logPagination.hidden = total === 0;
  el.logPageInfo.textContent = `Page ${page} / ${totalPages} (${total})`;
  el.logPrev.disabled = page <= 1;
  el.logNext.disabled = page >= totalPages;
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
    const nextPage = (state.logs.length === 1 && state.log.page > 1)
      ? state.log.page - 1
      : state.log.page;
    await loadLogs(nextPage);
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
    // New entries sort newest-first, so a fresh entry always lands on page 1.
    await loadLogs(1);
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

el.logPrev.addEventListener('click', () => {
  if (state.log.page > 1) loadLogs(state.log.page - 1);
});
el.logNext.addEventListener('click', () => {
  if (state.log.page < state.log.totalPages) loadLogs(state.log.page + 1);
});

// ---------- usage analytics ----------

async function loadUsageSummary() {
  try {
    const res = await fetch('/api/usage/summary');
    if (!res.ok) throw new Error();
    const body = await res.json();
    state.usageLoaded = true;
    renderUsageSummary(body.mostCopiedCommands || []);
  } catch {
    // Silent — this is a supplementary panel, not core functionality.
  }
}

function renderUsageSummary(items) {
  el.usageList.innerHTML = '';
  el.usageEmpty.hidden = items.length !== 0;

  items.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'usage-item';
    li.innerHTML = `
      <span class="usage-name">${escapeHtml(item.name)}</span>
      <span class="usage-count">${escapeHtml(String(item.count))}×</span>
    `;
    el.usageList.appendChild(li);
  });
}

// ---------- audit log ----------

async function loadAuditLogs(page) {
  try {
    const res = await fetch(`/api/audit-logs?page=${page}&limit=50`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    state.audit.entries = data.logs;
    state.audit.page = data.page;
    state.audit.totalPages = data.totalPages;
    renderAuditLogs();
  } catch {
    showToast('โหลด audit log ไม่สำเร็จ');
  }
}

function formatAuditDetails(details) {
  if (!details || typeof details !== 'object' || Object.keys(details).length === 0) return '';
  try {
    return JSON.stringify(details);
  } catch {
    return '';
  }
}

function renderAuditLogs() {
  const { entries, page, totalPages } = state.audit;
  el.auditBody.innerHTML = '';
  el.auditEmpty.hidden = entries.length !== 0;
  el.auditPagination.hidden = entries.length === 0;

  entries.forEach((entry) => {
    const created = new Date(entry.createdAt);
    const row = document.createElement('div');
    row.className = 'audit-row';
    const targetLabel = [entry.targetType, entry.targetName].filter(Boolean).join(': ');
    row.innerHTML = `
      <span class="audit-time">${formatDate(created)} ${formatTime(created)}</span>
      <span class="audit-user">${escapeHtml(entry.username || entry.userId || 'unknown')}</span>
      <span class="audit-source is-${escapeAttr(entry.source || '')}">${escapeHtml(entry.source || '')}</span>
      <span class="audit-action">${escapeHtml(entry.action || '')}</span>
      <span class="audit-target">${escapeHtml(targetLabel)}</span>
      <span class="audit-details">${escapeHtml(formatAuditDetails(entry.details))}</span>
    `;
    el.auditBody.appendChild(row);
  });

  el.auditPageInfo.textContent = `Page ${page} / ${totalPages}`;
  el.auditPrev.disabled = page <= 1;
  el.auditNext.disabled = page >= totalPages;
}

el.auditPrev.addEventListener('click', () => {
  if (state.audit.page > 1) loadAuditLogs(state.audit.page - 1);
});
el.auditNext.addEventListener('click', () => {
  if (state.audit.page < state.audit.totalPages) loadAuditLogs(state.audit.page + 1);
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

// ---------- tools: set stat ----------

const STATS = [
  'Health',
  'Stamina',
  'Torpidity',
  'Oxygen',
  'Food',
  'Water',
  'Temperature',
  'Weight',
  'MeleeDamageMultiplier',
  'SpeedMultiplier',
  'TemperatureFortitude',
  'CraftingSpeedMultiplier'
];

const statSelect = document.getElementById('statSelect');
const statValue = document.getElementById('statValue');
const statOutput = document.getElementById('statOutput');
const statCopy = document.getElementById('statCopy');

statSelect.innerHTML = STATS.map((name) => `<option value="${name}">${name}</option>`).join('');

function updateStatOutput() {
  const name = statSelect.value;
  const val = statValue.value.trim() || '0';
  statOutput.textContent = `cheat SetStatOnTarget ${name} ${val}`;
}

statSelect.addEventListener('change', updateStatOutput);
statValue.addEventListener('input', updateStatOutput);
statCopy.addEventListener('click', () => {
  copyToClipboard(statOutput.textContent, statCopy);
  trackEvent('copy_stat', { stat: statSelect.value });
});

// ---------- tools: tp coords ----------

const tpLat = document.getElementById('tpLat');
const tpLong = document.getElementById('tpLong');
const tpOutput = document.getElementById('tpOutput');
const tpCopy = document.getElementById('tpCopy');

function updateTpOutput() {
  const lat = tpLat.value.trim() || '0';
  const long = tpLong.value.trim() || '0';
  tpOutput.textContent = `cheat TPCoords ${lat} ${long}`;
}

tpLat.addEventListener('input', updateTpOutput);
tpLong.addEventListener('input', updateTpOutput);
tpCopy.addEventListener('click', () => {
  copyToClipboard(tpOutput.textContent, tpCopy);
  trackEvent('copy_tp', {});
});

// ---------- init ----------

trackEvent('page_view', {});
loadUser();
checkStatus();
setInterval(checkStatus, 15000);
loadCommands();
loadCategories();
loadLogs();
loadUsageSummary();
updateStatOutput();
updateTpOutput();
