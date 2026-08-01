const express = require('express');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { pool, ensureSchema } = require('./db');

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
  const { rowCount } = await pool.query('DELETE FROM commands WHERE id = $1', [req.params.id]);
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
  const { rowCount } = await pool.query('DELETE FROM logs WHERE id = $1', [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'ไม่พบบันทึกนี้' });
  res.status(204).end();
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
  .then(() => {
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
