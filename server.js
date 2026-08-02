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

app.use(express.json());

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

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, time: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'db unreachable' });
  }
});

// ---------- Commands ----------

app.get('/api/commands', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM commands ORDER BY created_at DESC');
  res.json(rows.map(toCommand));
});

app.post('/api/commands', async (req, res) => {
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
  res.status(201).json(toCommand(rows[0]));
});

app.put('/api/commands/:id', async (req, res) => {
  const { category, name, command, description } = req.body;
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
  res.json(toCommand(rows[0]));
});

app.delete('/api/commands/:id', async (req, res) => {
  const { rows, rowCount } = await pool.query('DELETE FROM commands WHERE id = $1 RETURNING *', [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'ไม่พบคำสั่งนี้' });
  res.status(204).end();
});

// ---------- Daily log ----------

app.get('/api/logs', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM logs ORDER BY created_at DESC');
  res.json(rows.map(toLog));
});

app.post('/api/logs', async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'ข้อความบันทึกห้ามว่าง' });
  const id = crypto.randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO logs (id, text) VALUES ($1, $2) RETURNING *`,
    [id, text.trim()]
  );
  res.status(201).json(toLog(rows[0]));
});

app.put('/api/logs/:id', async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'ข้อความบันทึกห้ามว่าง' });
  const { rows } = await pool.query(
    `UPDATE logs SET text = $2, updated_at = now() WHERE id = $1 RETURNING *`,
    [req.params.id, text.trim()]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'ไม่พบบันทึกนี้' });
  res.json(toLog(rows[0]));
});

app.delete('/api/logs/:id', async (req, res) => {
  const { rows, rowCount } = await pool.query('DELETE FROM logs WHERE id = $1 RETURNING *', [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'ไม่พบบันทึกนี้' });
  res.status(204).end();
});

// ---------- Usage events (analytics) ----------

app.post('/api/events', async (req, res) => {
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
});

app.get('/api/events/summary', async (req, res) => {
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
});

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
