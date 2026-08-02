// Final Express error handler. Must be registered with app.use(...)
// AFTER every route and other middleware — Express recognizes it as an
// error handler purely because it takes 4 arguments (err, req, res, next).
//
// Any error passed to next(err) — including ones forwarded automatically
// by utils/asyncHandler.js from a failed `await`, e.g. a lost Postgres
// connection — ends up here instead of hanging the request or crashing
// the process.

function logError(err, req) {
  const timestamp = new Date().toISOString();
  const userId = (req.user && req.user.id) || 'anonymous';

  // Full detail (including stack trace) goes to server-side logs only —
  // never to the client.
  console.error(
    `[ERROR] ${timestamp}\n` +
    `${req.method} ${req.originalUrl}\n` +
    `User: ${userId}\n` +
    `${err.message}\n` +
    `${err.stack}`
  );
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  logError(err, req);

  // If a response has already started streaming, we can't send a fresh
  // one — hand off to Express's default handler as the docs recommend.
  if (res.headersSent) {
    return next(err);
  }

  const status = Number.isInteger(err.status) ? err.status : 500;
  const isApiRequest = req.originalUrl.startsWith('/api/');

  if (isApiRequest || req.get('accept')?.includes('application/json')) {
    return res.status(status).json({ error: 'Internal server error' });
  }

  res.status(status).type('text/plain').send('Internal server error');
}

module.exports = { errorHandler };
