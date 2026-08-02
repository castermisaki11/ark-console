// All the *public* auth endpoints: the login page, the two legs of the
// Discord OAuth2 flow, the "who am I" check the dashboard header uses,
// and logout. Nothing in this file requires a session — that's the point,
// it's what lets a logged-out visitor reach /login in the first place.

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  getAuthorizeUrl,
  exchangeCodeForToken,
  fetchDiscordUser,
  isAdmin,
  avatarUrl
} = require('../auth/discordOAuth');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const router = express.Router();

// Auth endpoints are the most worth rate-limiting: they're the ones an
// attacker would hammer to brute-force state values or just cause noise.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณาลองใหม่ภายหลัง' }
});

// ---------- Login page ----------
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
});

// ---------- Step 1: send the browser to Discord ----------
router.get('/auth/discord', authLimiter, (req, res, next) => {
  try {
    const state = crypto.randomBytes(16).toString('hex');
    req.session.oauthState = state;
    res.redirect(getAuthorizeUrl(state));
  } catch (err) {
    next(err);
  }
});

// ---------- Step 2: Discord redirects back here with a code ----------
router.get('/auth/discord/callback', authLimiter, async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect('/login?error=denied');
  }
  if (!code || !state || state !== req.session.oauthState) {
    return res.redirect('/login?error=state');
  }
  delete req.session.oauthState;

  try {
    const token = await exchangeCodeForToken(code);
    const discordUser = await fetchDiscordUser(token.access_token);

    if (!isAdmin(discordUser.id)) {
      // Known Discord account, but not on the allowlist — no session for you.
      return req.session.destroy(() => {
        res.status(403).sendFile(path.join(PUBLIC_DIR, 'access-denied.html'));
      });
    }

    const user = {
      id: discordUser.id,
      username: discordUser.username,
      displayName: discordUser.global_name || discordUser.username,
      avatarUrl: avatarUrl(discordUser)
    };

    // Regenerate the session id on login (session fixation prevention),
    // then attach the user to the fresh session.
    req.session.regenerate((err) => {
      if (err) {
        console.error('regenerate session ไม่สำเร็จ:', err);
        return res.redirect('/login?error=session');
      }
      req.session.user = user;
      res.redirect('/');
    });
  } catch (err) {
    console.error('Discord OAuth callback ผิดพลาด:', err);
    res.redirect('/login?error=oauth');
  }
});

// ---------- Current user (dashboard header reads this) ----------
router.get('/auth/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'unauthenticated' });
  res.json(req.session.user);
});

// ---------- Logout ----------
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    // Must match the `name` option passed to express-session in server.js.
    res.clearCookie('ark_console_sid');
    res.redirect('/login');
  });
});

module.exports = router;
