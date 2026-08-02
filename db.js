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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      type TEXT NOT NULL,
      meta JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_usage_events_type ON usage_events (type);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_usage_events_client ON usage_events (client_id);`);

  // Pagination on /api/commands and /api/logs orders by created_at DESC —
  // index it so LIMIT/OFFSET queries don't degrade to a full table scan
  // as either table grows.
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_commands_created_at ON commands (created_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs (created_at DESC);`);

  await ensureAuditLogTable();

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

// Audit log table — created automatically on startup, no manual SQL
// required. Uses CREATE TABLE IF NOT EXISTS so it's safe to run on
// every boot: never touches existing rows or other tables. Checks
// existence first (via information_schema) purely so startup logs
// tell the operator which branch happened.
async function ensureAuditLogTable() {
  const { rows } = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'audit_logs'
     ) AS exists;`
  );
  const alreadyExisted = rows[0].exists;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      username TEXT,
      source TEXT,
      action TEXT,
      target_type TEXT,
      target_id TEXT,
      target_name TEXT,
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id);`);

  console.log(alreadyExisted ? 'Audit log table already exists' : 'Audit log table initialized');
}

module.exports = { pool, ensureSchema };
