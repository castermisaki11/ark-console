const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 4100;

const DATA_DIR = path.join(__dirname, 'data');
const COMMANDS_FILE = path.join(DATA_DIR, 'commands.json');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');

function ensureStore(file, fallback) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
}

function readStore(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function writeStore(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const SEED_COMMANDS = [
  {
    id: crypto.randomUUID(),
    category: 'Time & Weather',
    name: 'Set day time',
    command: 'cheat SetTimeOfDay 00:00',
    description: 'ตั้งเวลาในเกมเป็นเที่ยงคืน',
    createdAt: new Date().toISOString()
  },
  {
    id: crypto.randomUUID(),
    category: 'Spawn',
    name: 'Force tame',
    command: 'cheat ForceTame',
    description: 'เชื่องสัตว์ที่มองอยู่ทันที',
    createdAt: new Date().toISOString()
  },
  {
    id: crypto.randomUUID(),
    category: 'Admin',
    name: 'Kick player',
    command: 'KickPlayer <SteamID>',
    description: 'เตะผู้เล่นออกจากเซิร์ฟเวอร์',
    createdAt: new Date().toISOString()
  }
];

ensureStore(COMMANDS_FILE, SEED_COMMANDS);
ensureStore(LOGS_FILE, []);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ---------- Commands ----------

app.get('/api/commands', (req, res) => {
  res.json(readStore(COMMANDS_FILE));
});

app.post('/api/commands', (req, res) => {
  const { category, name, command, description } = req.body;
  if (!name || !command) {
    return res.status(400).json({ error: 'name และ command จำเป็นต้องระบุ' });
  }
  const commands = readStore(COMMANDS_FILE);
  const entry = {
    id: crypto.randomUUID(),
    category: (category || 'Uncategorized').trim(),
    name: name.trim(),
    command: command.trim(),
    description: (description || '').trim(),
    createdAt: new Date().toISOString()
  };
  commands.unshift(entry);
  writeStore(COMMANDS_FILE, commands);
  res.status(201).json(entry);
});

app.put('/api/commands/:id', (req, res) => {
  const commands = readStore(COMMANDS_FILE);
  const idx = commands.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'ไม่พบคำสั่งนี้' });
  const { category, name, command, description } = req.body;
  commands[idx] = {
    ...commands[idx],
    category: category !== undefined ? category.trim() : commands[idx].category,
    name: name !== undefined ? name.trim() : commands[idx].name,
    command: command !== undefined ? command.trim() : commands[idx].command,
    description: description !== undefined ? description.trim() : commands[idx].description,
    updatedAt: new Date().toISOString()
  };
  writeStore(COMMANDS_FILE, commands);
  res.json(commands[idx]);
});

app.delete('/api/commands/:id', (req, res) => {
  const commands = readStore(COMMANDS_FILE);
  const next = commands.filter((c) => c.id !== req.params.id);
  if (next.length === commands.length) return res.status(404).json({ error: 'ไม่พบคำสั่งนี้' });
  writeStore(COMMANDS_FILE, next);
  res.status(204).end();
});

// ---------- Daily log ----------

app.get('/api/logs', (req, res) => {
  res.json(readStore(LOGS_FILE));
});

app.post('/api/logs', (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'ข้อความบันทึกห้ามว่าง' });
  const logs = readStore(LOGS_FILE);
  const entry = {
    id: crypto.randomUUID(),
    text: text.trim(),
    createdAt: new Date().toISOString(),
    updatedAt: null
  };
  logs.unshift(entry);
  writeStore(LOGS_FILE, logs);
  res.status(201).json(entry);
});

app.put('/api/logs/:id', (req, res) => {
  const logs = readStore(LOGS_FILE);
  const idx = logs.findIndex((l) => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'ไม่พบบันทึกนี้' });
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'ข้อความบันทึกห้ามว่าง' });
  logs[idx] = { ...logs[idx], text: text.trim(), updatedAt: new Date().toISOString() };
  writeStore(LOGS_FILE, logs);
  res.json(logs[idx]);
});

app.delete('/api/logs/:id', (req, res) => {
  const logs = readStore(LOGS_FILE);
  const next = logs.filter((l) => l.id !== req.params.id);
  if (next.length === logs.length) return res.status(404).json({ error: 'ไม่พบบันทึกนี้' });
  writeStore(LOGS_FILE, next);
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
