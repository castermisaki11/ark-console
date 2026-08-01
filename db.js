const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('ต้องตั้งค่า env var DATABASE_URL เป็น connection string ของ Supabase (Database settings > Connection string > URI)');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS commands (
      id TEXT PRIMARY KEY,
      category TEXT,
      name TEXT NOT NULL,
      command TEXT NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ
    );
  `);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM commands');
  if (rows[0].count === 0) {
    const crypto = require('crypto');
    const seed = [
      {
        id: crypto.randomUUID(),
        category: 'Time & Weather',
        name: 'Set day time',
        command: 'cheat SetTimeOfDay 00:00',
        description: 'ตั้งเวลาในเกมเป็นเที่ยงคืน'
      },
      {
        id: crypto.randomUUID(),
        category: 'Spawn',
        name: 'Force tame',
        command: 'cheat ForceTame',
        description: 'เชื่องสัตว์ที่มองอยู่ทันที'
      },
      {
        id: crypto.randomUUID(),
        category: 'Admin',
        name: 'Kick player',
        command: 'KickPlayer <SteamID>',
        description: 'เตะผู้เล่นออกจากเซิร์ฟเวอร์'
      }
    ];
    for (const s of seed) {
      await pool.query(
        `INSERT INTO commands (id, category, name, command, description) VALUES ($1, $2, $3, $4, $5)`,
        [s.id, s.category, s.name, s.command, s.description]
      );
    }
  }
}

module.exports = { pool, ensureSchema };
