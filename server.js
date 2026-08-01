require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { pool, ensureSchema } = require('./db');
const { client: discordClient, startBot } = require('./discord/client');
const { commandEmbed, statusEmbed, sendNotify } = require('./discord/notify');

const app = express();
const PORT = process.env.PORT || 4100;

app.use(express.json());
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
  sendNotify(discordClient, commandEmbed('create', rows[0]));
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
  sendNotify(discordClient, commandEmbed('update', rows[0]));
});

app.delete('/api/commands/:id', async (req, res) => {
  const { rows, rowCount } = await pool.query('DELETE FROM commands WHERE id = $1 RETURNING *', [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'ไม่พบคำสั่งนี้' });
  res.status(204).end();
  sendNotify(discordClient, commandEmbed('delete', rows[0]));
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

// ---------- Discord: แจ้งเตือนเมื่อสถานะฐานข้อมูลเปลี่ยน ----------

const HEALTH_CHECK_INTERVAL_MS = 2 * 60 * 1000; // 2 นาที
let lastKnownOnline = true; // เริ่มต้นถือว่า online เพราะ ensureSchema ผ่านมาแล้วตอน start

async function checkDbHealthAndNotify() {
  let online = true;
  try {
    await pool.query('SELECT 1');
  } catch {
    online = false;
  }
  if (online !== lastKnownOnline) {
    lastKnownOnline = online;
    sendNotify(discordClient, statusEmbed(online));
  }
}

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
    setInterval(checkDbHealthAndNotify, HEALTH_CHECK_INTERVAL_MS);

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
