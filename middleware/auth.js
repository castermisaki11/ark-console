// Session-based auth guards.
//
// attachUser  — runs on every request, copies the session's user (if any)
//               onto req.user so downstream handlers don't touch req.session directly.
// requireAuth — blocks any request from a non-logged-in visitor.
//               API calls get a 401 JSON body; page/asset requests get
//               redirected to /login. Mount this AFTER the public auth
//               routes (/login, /auth/discord, /auth/discord/callback,
//               /auth/me, /logout) so those stay reachable.

function attachUser(req, res, next) {
  req.user = (req.session && req.session.user) || null;
  next();
}

function requireAuth(req, res, next) {
  if (req.user) return next();

  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'ต้องเข้าสู่ระบบก่อน (unauthenticated)' });
  }
  return res.redirect('/login');
}

module.exports = { attachUser, requireAuth };
