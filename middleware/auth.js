// Session-based auth guards.
//
// attachUser  — runs on every request, copies the session's user (if any)
//               onto req.user so downstream handlers don't touch req.session directly.
// requireAuth — blocks any request from a non-logged-in visitor.
//               API calls get a 401 JSON body; page/asset requests get
//               redirected to /login. Mount this AFTER the public auth
//               routes (/login, /auth/discord, /auth/discord/callback,
//               /auth/me, /logout) so those stay reachable.

const { isAdmin } = require('../auth/discordOAuth');

function attachUser(req, res, next) {
  req.user = (req.session && req.session.user) || null;
  next();
}

// Runs on every protected request (mounted after attachUser). Two checks:
//   1. Is there a logged-in user at all?
//   2. Is that user's Discord ID STILL in the current ADMIN_IDS allowlist?
//
// (2) is what closes the gap where removing someone from ADMIN_IDS used
// to leave their existing session (cookie in their browser, row in
// user_sessions) fully authorized until it expired on its own. isAdmin()
// only re-reads the ADMIN_IDS env var (no extra DB round-trip, no new
// permission system), so this re-check is cheap enough to run on every
// request rather than only at login.
function requireAuth(req, res, next) {
  if (!req.user) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'ต้องเข้าสู่ระบบก่อน (unauthenticated)' });
    }
    return res.redirect('/login');
  }

  if (!isAdmin(req.user.id)) {
    // Session was valid, but this user is no longer on the ADMIN_IDS
    // allowlist — revoke immediately instead of letting the stale
    // session ride out its remaining cookie/store lifetime.
    return req.session.destroy(() => {
      // Must match the `name` option passed to express-session in server.js.
      res.clearCookie('ark_console_sid');
      if (req.path.startsWith('/api/')) {
        return res.status(403).json({ error: 'สิทธิ์การเข้าถึงถูกเพิกถอน กรุณาเข้าสู่ระบบใหม่ (access revoked)' });
      }
      return res.redirect('/login');
    });
  }

  return next();
}

module.exports = { attachUser, requireAuth };
