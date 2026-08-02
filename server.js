require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const helmet = require('helmet');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { pool, ensureSchema } = require('./db');
const { startBot } = require('./discord/client');
const { attachUser, requireAuth } = require('./middleware/auth');
const authRoutes = require('./routes/authRoutes');
const { createAuditLog } = require('./utils/audit');
const { asyncHandler } = require('./utils/asyncHandler');
const { errorHandler } = require('./middleware/errorHandler');

// ---------- Required auth env vars ----------
// Same fail-fast pattern db.js uses for DATABASE_URL: without these the
// dashboard has no way to authenticate anyone, so refuse to boot rather
// than come up silently unprotected.
const REQUIRED_AUTH_ENV = [
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'DISCORD_REDIRECT_URI',
  'SESSION_SECRET',
  'ADMIN_IDS'
];
const missingAuthEnv = REQUIRED_AUTH_ENV.filter((name) => !process.env[name]);
if (missingAuthEnv.length > 0) {
  console.error(`ต้องตั้งค่า env var ต่อไปนี้ก่อนรัน: ${missingAuthEnv.join(', ')}`);
  console.error('ดูวิธีตั้งค่าใน README หัวข้อ "Discord OAuth Login"');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 4100;

// Railway (and most PaaS) sit behind a reverse proxy — needed so
// express-session knows the original request was HTTPS and will set
// `secure` cookies correctly.
app.set('trust proxy', 1);

// CSP is left off: the dashboard relies on an inline theme-bootstrap
// script and Google Fonts, and locking that down is a separate task
// from login. The other helmet protections (frameguard, noSniff, etc.)
// still apply.
app.use(helmet({ contentSecurityPolicy: false }));

// Default (100kb) is too small for a command-library JSON import/export
// payload — bumped to 2mb, still a hard bound (not unlimited) so a
// malicious/broken client can't send an unbounded body.
app.use(express.json({ limit: '2mb' }));

app.use(session({
  name: 'ark_console_sid',
  secret: process.env.SESSION_SECRET,
  store: new pgSession({ pool, createTableIfMissing: true, tableName: 'user_sessions' }),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

app.use(attachUser);

// Public: /login, /auth/discord, /auth/discord/callback, /auth/me, /logout
app.use(authRoutes);

// Everything registered after this point requires a logged-in admin.
app.use(requireAuth);

app.use(express.static(path.join(__dirname, 'public')));

function toCommand(row) {
  return {
    id: row.id,
    category: row.category,
    name: row.name,
    command: row.command,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toLog(row) {
  return {
    id: row.id,
    text: row.text,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

app.get('/api/health', asyncHandler(async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, time: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'db unreachable' });
  }
}));

// ---------- Pagination helper ----------
// Shared by /api/commands and /api/logs: clamps page to >=1 and limit to
// 1..100 (default 50), so a bad/missing query string can't force an
// unbounded SELECT * back out.
function parsePagination(req, { defaultLimit = 50, maxLimit = 100 } = {}) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(req.query.limit, 10) || defaultLimit));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function paginationMeta(page, limit, total) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

// ---------- Commands ----------

app.get('/api/commands', asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req);

  // Optional filters — kept server-side so the dashboard's search box
  // and category picker still work once the client only ever holds one
  // page of rows at a time instead of the full table.
  const conditions = [];
  const params = [];

  if (req.query.category && req.query.category !== '__all') {
    params.push(req.query.category);
    conditions.push(`COALESCE(category, 'Uncategorized') = $${params.length}`);
  }
  if (req.query.q && String(req.query.q).trim()) {
    params.push(`%${String(req.query.q).trim()}%`);
    const idx = params.length;
    conditions.push(`(name ILIKE $${idx} OR command ILIKE $${idx} OR description ILIKE $${idx} OR category ILIKE $${idx})`);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const dataParams = [...params, limit, offset];
  const [{ rows: countRows }, { rows }] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total FROM commands ${whereClause}`, params),
    pool.query(
      `SELECT * FROM commands ${whereClause} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      dataParams
    )
  ]);

  res.json({
    data: rows.map(toCommand),
    pagination: paginationMeta(page, limit, countRows[0].total)
  });
}));

// Distinct categories with per-category counts — used to render the
// sidebar category list/counts without loading every command row
// (which /api/commands above no longer does now that it's paginated).
app.get('/api/commands/categories', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT COALESCE(category, 'Uncategorized') AS category, COUNT(*)::int AS count
     FROM commands
     GROUP BY COALESCE(category, 'Uncategorized')
     ORDER BY category ASC`
  );
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  res.json({ categories: rows, total });
}));

// ---------- Command export / import (backup + restore) ----------
// Registered above /api/commands/:id so nothing here can collide with
// the id-based PUT/DELETE routes further down.

const EXPORT_FORMAT_VERSION = 1;
const IMPORT_MAX_ITEMS = 2000; // guards against one giant request rather than a huge byte size alone
const IMPORT_LIMITS = { name: 100, command: 2000, description: 500, category: 100 };

// Only the fields that make sense to move between servers — no ids,
// timestamps, or anything DB-internal — so an export is safe to hand
// to another deployment or commit to source control.
function toExportRow(row) {
  return {
    name: row.name,
    command: row.command,
    description: row.description || '',
    category: row.category || 'Uncategorized'
  };
}

app.get('/api/commands/export', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM commands ORDER BY created_at ASC');
  const payload = {
    exportedAt: new Date().toISOString(),
    version: EXPORT_FORMAT_VERSION,
    commands: rows.map(toExportRow)
  };

  await createAuditLog({
    userId: req.user?.id,
    username: req.user?.displayName,
    source: 'web',
    action: 'EXPORT_COMMANDS',
    targetType: 'command',
    details: { count: rows.length }
  });

  const filename = `ark-commands-export-${new Date().toISOString().slice(0, 10)}.json`;
  res.set('Content-Disposition', `attachment; filename="${filename}"`);
  res.json(payload);
}));

// Validates one imported command entry against the same shape/limits
// POST /api/commands enforces. Returns an error string, or null if valid.
function validateImportItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return 'ไม่ใช่ object ที่ถูกต้อง';

  const { name, command, description, category } = item;

  if (typeof name !== 'string' || !name.trim()) return 'name จำเป็นต้องระบุ';
  if (name.trim().length > IMPORT_LIMITS.name) return `name ยาวเกิน ${IMPORT_LIMITS.name} ตัวอักษร`;

  if (typeof command !== 'string' || !command.trim()) return 'command จำเป็นต้องระบุ';
  if (command.trim().length > IMPORT_LIMITS.command) return `command ยาวเกิน ${IMPORT_LIMITS.command} ตัวอักษร`;

  if (description !== undefined && description !== null) {
    if (typeof description !== 'string') return 'description ต้องเป็นข้อความ';
    if (description.length > IMPORT_LIMITS.description) return `description ยาวเกิน ${IMPORT_LIMITS.description} ตัวอักษร`;
  }

  if (category !== undefined && category !== null) {
    if (typeof category !== 'string') return 'category ต้องเป็นข้อความ';
    if (category.length > IMPORT_LIMITS.category) return `category ยาวเกิน ${IMPORT_LIMITS.category} ตัวอักษร`;
  }

  return null;
}

app.post('/api/commands/import', asyncHandler(async (req, res) => {
  const { commands } = req.body || {};

  if (!Array.isArray(commands)) {
    return res.status(400).json({ error: 'รูปแบบไม่ถูกต้อง: ต้องมี commands เป็น array' });
  }
  if (commands.length === 0) {
    return res.status(400).json({ error: 'ไม่มีคำสั่งให้นำเข้า' });
  }
  if (commands.length > IMPORT_MAX_ITEMS) {
    return res.status(400).json({ error: `นำเข้าได้สูงสุดครั้งละ ${IMPORT_MAX_ITEMS} คำสั่ง` });
  }

  // Existing (name, command) pairs — case-insensitive — used to skip
  // duplicates. Default behavior never overwrites an existing command;
  // an admin who wants to change one still goes through the normal
  // edit (PUT) flow.
  const { rows: existingRows } = await pool.query('SELECT name, command FROM commands');
  const seen = new Set(
    existingRows.map((r) => `${r.name.trim().toLowerCase()}|${r.command.trim().toLowerCase()}`)
  );

  let imported = 0;
  let skipped = 0;

  // Single connection + transaction for the whole batch: much faster than
  // one pool.query() round-trip per row for a large import, and keeps the
  // batch atomic (a failure partway rolls back cleanly instead of leaving
  // a half-imported library).
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const item of commands) {
      const err = validateImportItem(item);
      if (err) {
        skipped += 1;
        continue;
      }

      const name = item.name.trim();
      const command = item.command.trim();
      const description = (item.description || '').toString().trim();
      const category = (item.category || 'Uncategorized').toString().trim() || 'Uncategorized';
      const key = `${name.toLowerCase()}|${command.toLowerCase()}`;

      if (seen.has(key)) {
        skipped += 1;
        continue;
      }
      seen.add(key); // also de-dupes repeats within the same import payload

      const id = crypto.randomUUID();
      await client.query(
        `INSERT INTO commands (id, category, name, command, description) VALUES ($1, $2, $3, $4, $5)`,
        [id, category, name, command, description]
      );
      imported += 1;
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await createAuditLog({
    userId: req.user?.id,
    username: req.user?.displayName,
    source: 'web',
    action: 'IMPORT_COMMANDS',
    targetType: 'command',
    details: { imported, skipped }
  });

  res.json({ imported, skipped });
}));

app.post('/api/commands', asyncHandler(async (req, res) => {
  const { category, name, command, description } = req.body;
  if (!name || !command) {
    return res.status(400).json({ error: 'name และ command จำเป็นต้องระบุ' });
  }
  const id = crypto.randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO commands (id, category, name, command, description)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [id, (category || 'Uncategorized').trim(), name.trim(), command.trim(), (description || '').trim()]
  );
  const created = toCommand(rows[0]);
  await createAuditLog({
    userId: req.user?.id,
    username: req.user?.displayName,
    source: 'web',
    action: 'CREATE_COMMAND',
    targetType: 'command',
    targetId: created.id,
    targetName: created.name,
    details: { category: created.category, command: created.command }
  });
  res.status(201).json(created);
}));

app.put('/api/commands/:id', asyncHandler(async (req, res) => {
  const { category, name, command, description } = req.body;
  const { rows: beforeRows } = await pool.query('SELECT * FROM commands WHERE id = $1', [req.params.id]);
  if (beforeRows.length === 0) return res.status(404).json({ error: 'ไม่พบคำสั่งนี้' });
  const before = toCommand(beforeRows[0]);

  const { rows } = await pool.query(
    `UPDATE commands SET
       category = COALESCE($2, category),
       name = COALESCE($3, name),
       command = COALESCE($4, command),
       description = COALESCE($5, description),
       updated_at = now()
     WHERE id = $1 RETURNING *`,
    [
      req.params.id,
      category !== undefined ? category.trim() : undefined,
      name !== undefined ? name.trim() : undefined,
      command !== undefined ? command.trim() : undefined,
      description !== undefined ? description.trim() : undefined
    ]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'ไม่พบคำสั่งนี้' });
  const updated = toCommand(rows[0]);
  await createAuditLog({
    userId: req.user?.id,
    username: req.user?.displayName,
    source: 'web',
    action: 'UPDATE_COMMAND',
    targetType: 'command',
    targetId: updated.id,
    targetName: updated.name,
    details: {
      oldValue: { category: before.category, name: before.name, command: before.command, description: before.description },
      newValue: { category: updated.category, name: updated.name, command: updated.command, description: updated.description }
    }
  });
  res.json(updated);
}));

app.delete('/api/commands/:id', asyncHandler(async (req, res) => {
  const { rows, rowCount } = await pool.query('DELETE FROM commands WHERE id = $1 RETURNING *', [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'ไม่พบคำสั่งนี้' });
  const deleted = toCommand(rows[0]);
  await createAuditLog({
    userId: req.user?.id,
    username: req.user?.displayName,
    source: 'web',
    action: 'DELETE_COMMAND',
    targetType: 'command',
    targetId: deleted.id,
    targetName: deleted.name,
    details: { category: deleted.category, command: deleted.command }
  });
  res.status(204).end();
}));

// ---------- Daily log ----------

app.get('/api/logs', asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req);

  const [{ rows: countRows }, { rows }] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS total FROM logs'),
    pool.query('SELECT * FROM logs ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset])
  ]);

  res.json({
    data: rows.map(toLog),
    pagination: paginationMeta(page, limit, countRows[0].total)
  });
}));

app.post('/api/logs', asyncHandler(async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'ข้อความบันทึกห้ามว่าง' });
  const id = crypto.randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO logs (id, text) VALUES ($1, $2) RETURNING *`,
    [id, text.trim()]
  );
  const created = toLog(rows[0]);
  await createAuditLog({
    userId: req.user?.id,
    username: req.user?.displayName,
    source: 'web',
    action: 'CREATE_LOG',
    targetType: 'log',
    targetId: created.id,
    targetName: created.text.slice(0, 80),
    details: {}
  });
  res.status(201).json(created);
}));

app.put('/api/logs/:id', asyncHandler(async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'ข้อความบันทึกห้ามว่าง' });
  const { rows: beforeRows } = await pool.query('SELECT * FROM logs WHERE id = $1', [req.params.id]);
  if (beforeRows.length === 0) return res.status(404).json({ error: 'ไม่พบบันทึกนี้' });
  const before = toLog(beforeRows[0]);

  const { rows } = await pool.query(
    `UPDATE logs SET text = $2, updated_at = now() WHERE id = $1 RETURNING *`,
    [req.params.id, text.trim()]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'ไม่พบบันทึกนี้' });
  const updated = toLog(rows[0]);
  await createAuditLog({
    userId: req.user?.id,
    username: req.user?.displayName,
    source: 'web',
    action: 'UPDATE_LOG',
    targetType: 'log',
    targetId: updated.id,
    targetName: updated.text.slice(0, 80),
    details: { oldValue: before.text.slice(0, 200), newValue: updated.text.slice(0, 200) }
  });
  res.json(updated);
}));

app.delete('/api/logs/:id', asyncHandler(async (req, res) => {
  const { rows, rowCount } = await pool.query('DELETE FROM logs WHERE id = $1 RETURNING *', [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'ไม่พบบันทึกนี้' });
  const deleted = toLog(rows[0]);
  await createAuditLog({
    userId: req.user?.id,
    username: req.user?.displayName,
    source: 'web',
    action: 'DELETE_LOG',
    targetType: 'log',
    targetId: deleted.id,
    targetName: deleted.text.slice(0, 80),
    details: {}
  });
  res.status(204).end();
}));

// ---------- Usage events (analytics) ----------

app.post('/api/events', asyncHandler(async (req, res) => {
  const { type, clientId, meta } = req.body;
  if (!type || !clientId) {
    return res.status(400).json({ error: 'type และ clientId จำเป็นต้องระบุ' });
  }
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO usage_events (id, client_id, type, meta) VALUES ($1, $2, $3, $4)`,
    [id, String(clientId).slice(0, 100), String(type).slice(0, 100), meta ? JSON.stringify(meta).slice(0, 2000) : null]
  );
  res.status(201).json({ ok: true });
}));

// Top 10 most-copied commands, derived from the copy_command events the
// frontend already sends (trackEvent('copy_command', { id, name })).
// No schema change needed: `meta` is JSONB, so we group on the fields
// already stored inside it.
app.get('/api/usage/summary', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT
       meta->>'id' AS command_id,
       COALESCE(meta->>'name', 'Unknown') AS name,
       COUNT(*)::int AS count
     FROM usage_events
     WHERE type = 'copy_command'
     GROUP BY meta->>'id', meta->>'name'
     ORDER BY count DESC
     LIMIT 10`
  );
  res.json({
    mostCopiedCommands: rows.map((r) => ({ name: r.name, count: r.count }))
  });
}));

app.get('/api/events/summary', asyncHandler(async (req, res) => {
  const [{ rows: totals }, { rows: byType }, { rows: uniqueClients }] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS total FROM usage_events'),
    pool.query('SELECT type, COUNT(*)::int AS count FROM usage_events GROUP BY type ORDER BY count DESC'),
    pool.query('SELECT COUNT(DISTINCT client_id)::int AS unique_clients FROM usage_events')
  ]);
  res.json({
    totalEvents: totals[0].total,
    uniqueClients: uniqueClients[0].unique_clients,
    byType
  });
}));

// ---------- Audit log ----------
// Read-only — append-only table, no PUT/DELETE endpoints are exposed
// so admins cannot edit or erase audit history from the API.

function toAuditLog(row) {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    source: row.source,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    targetName: row.target_name,
    details: row.details,
    createdAt: row.created_at
  };
}

app.get('/api/audit-logs', asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const offset = (page - 1) * limit;

  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query(
      'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    ),
    pool.query('SELECT COUNT(*)::int AS total FROM audit_logs')
  ]);

  const total = countRows[0].total;
  res.json({
    logs: rows.map(toAuditLog),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit))
  });
}));

function getLanAddresses() {
  const nets = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) addresses.push(net.address);
    }
  }
  return addresses;
}

// ---------- Global error handler ----------
// Registered last, after every route and other middleware, per Express
// convention. Catches anything forwarded via next(err) — including
// database failures surfaced by asyncHandler-wrapped routes above —
// logs the full detail server-side, and returns a generic message to
// the client so internals are never exposed.
app.use(errorHandler);

ensureSchema()
  .then(async () => {
    await startBot();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`ark-console running on port ${PORT}`);
      console.log(`  local:   http://localhost:${PORT}`);
      const lan = getLanAddresses();
      if (lan.length === 0) {
        console.log('  lan:     ไม่พบ IP วง LAN — ถ้าเปิด hotspot แล้วยังไม่เห็น ลองรันใหม่อีกครั้งหลัง connect');
      } else {
        lan.forEach((ip) => console.log(`  lan:     http://${ip}:${PORT}  (ใช้ address นี้จากอุปกรณ์อื่นบน hotspot เดียวกัน)`));
      }
    });
  })
  .catch((err) => {
    console.error('เชื่อมต่อฐานข้อมูลไม่สำเร็จ:', err.message);
    process.exit(1);
  });
