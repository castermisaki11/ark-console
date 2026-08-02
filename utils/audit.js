// Shared audit-log writer.
//
// Both the web dashboard (routes/authRoutes.js, server.js) and the
// Discord bot (discord/interactions.js) call createAuditLog() after a
// tracked action succeeds. This is intentionally the *only* place that
// writes to audit_logs, and it never throws: a logging failure must
// never roll back or block the operation it's describing.

const crypto = require('crypto');
const { pool } = require('../db');

// Fields the caller may not accidentally pass through into `details` —
// audit_logs must never persist credentials or secrets (requirement 8).
const FORBIDDEN_DETAIL_KEYS = new Set([
  'password',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'token',
  'secret',
  'clientSecret',
  'client_secret',
  'sessionSecret'
]);

function sanitizeDetails(details) {
  if (!details || typeof details !== 'object') return details ?? null;
  const clean = {};
  for (const [key, value] of Object.entries(details)) {
    if (FORBIDDEN_DETAIL_KEYS.has(key)) continue;
    clean[key] = value;
  }
  return clean;
}

/**
 * Insert one append-only audit record. Never throws — logging failures
 * are caught and reported to the console so the caller's main
 * operation (e.g. "command deleted") is never affected.
 *
 * @param {object} params
 * @param {string} [params.userId]      Discord user ID of the actor.
 * @param {string} [params.username]    Discord display name of the actor.
 * @param {'web'|'discord'} params.source
 * @param {string} params.action        e.g. 'CREATE_COMMAND', 'LOGIN'.
 * @param {string} [params.targetType]  e.g. 'command', 'log', 'user'.
 * @param {string} [params.targetId]
 * @param {string} [params.targetName]
 * @param {object} [params.details]     Extra JSON context (never secrets).
 */
async function createAuditLog({
  userId,
  username,
  source,
  action,
  targetType,
  targetId,
  targetName,
  details
} = {}) {
  try {
    if (!action || !source) {
      console.error('createAuditLog: ต้องระบุ source และ action อย่างน้อย — ข้ามการบันทึก');
      return;
    }

    const id = crypto.randomUUID();
    const safeDetails = sanitizeDetails(details);

    await pool.query(
      `INSERT INTO audit_logs
         (id, user_id, username, source, action, target_type, target_id, target_name, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        userId ? String(userId) : null,
        username ? String(username) : null,
        String(source),
        String(action),
        targetType ? String(targetType) : null,
        targetId ? String(targetId) : null,
        targetName ? String(targetName) : null,
        safeDetails ? JSON.stringify(safeDetails) : null
      ]
    );
  } catch (err) {
    // Deliberately swallowed — the operation being audited must still
    // succeed even if the audit write itself fails.
    console.error('บันทึก audit log ไม่สำเร็จ:', err.message);
  }
}

module.exports = { createAuditLog };
