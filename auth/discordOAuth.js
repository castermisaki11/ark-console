// Minimal wrapper around Discord's OAuth2 Authorization Code flow.
// Docs: https://discord.com/developers/docs/topics/oauth2
//
// This module only handles talking to Discord's OAuth endpoints and
// checking the ADMIN_IDS allowlist — it has no knowledge of sessions
// or Express, so it stays easy to test/reuse on its own.

const AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
const TOKEN_URL = 'https://discord.com/api/oauth2/token';
const USER_URL = 'https://discord.com/api/users/@me';

function requiredEnv(name) {
  const val = process.env[name];
  if (!val) throw new Error(`ต้องตั้งค่า env var ${name} ก่อนใช้งาน Discord login`);
  return val;
}

// Builds the URL the user's browser should be sent to for the Discord
// consent screen. `state` is an opaque per-login value the caller
// generates and must verify on the callback (CSRF protection).
function getAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: requiredEnv('DISCORD_CLIENT_ID'),
    redirect_uri: requiredEnv('DISCORD_REDIRECT_URI'),
    response_type: 'code',
    scope: 'identify',
    state,
    prompt: 'consent'
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

// Exchanges the authorization code Discord redirected back with for an
// access token. We only ever use this token once (to fetch the profile
// below) — it is never stored or sent to the browser.
async function exchangeCodeForToken(code) {
  const body = new URLSearchParams({
    client_id: requiredEnv('DISCORD_CLIENT_ID'),
    client_secret: requiredEnv('DISCORD_CLIENT_SECRET'),
    grant_type: 'authorization_code',
    code,
    redirect_uri: requiredEnv('DISCORD_REDIRECT_URI')
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`แลก authorization code เป็น token ไม่สำเร็จ (${res.status}): ${text}`);
  }
  return res.json(); // { access_token, token_type, expires_in, refresh_token, scope }
}

// Fetches the Discord profile the access token belongs to.
async function fetchDiscordUser(accessToken) {
  const res = await fetch(USER_URL, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ดึงข้อมูลผู้ใช้ Discord ไม่สำเร็จ (${res.status}): ${text}`);
  }
  return res.json(); // { id, username, global_name, avatar, discriminator, ... }
}

// Parses ADMIN_IDS ("id1,id2,id3") into a Set for quick lookup.
function getAdminIds() {
  return new Set(
    (process.env.ADMIN_IDS || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

function isAdmin(discordId) {
  return getAdminIds().has(String(discordId));
}

// Builds a CDN URL for the user's avatar, falling back to Discord's
// default avatar when the account has none set.
function avatarUrl(user) {
  if (!user.avatar) {
    const index = user.discriminator && user.discriminator !== '0'
      ? Number(user.discriminator) % 5
      : Number(BigInt(user.id) >> 22n) % 6;
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  }
  const ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=64`;
}

module.exports = {
  getAuthorizeUrl,
  exchangeCodeForToken,
  fetchDiscordUser,
  isAdmin,
  avatarUrl
};
