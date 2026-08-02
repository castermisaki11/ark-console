// Wraps an async Express route/middleware handler so a rejected promise
// (a thrown error, a failed `await pool.query(...)`, etc.) is forwarded
// to `next(err)` instead of crashing the process or leaving the request
// hanging forever with no response.
//
// Usage:
//   app.get('/api/thing', asyncHandler(async (req, res) => {
//     const data = await query();
//     res.json(data);
//   }));
//
// Sync handlers don't need this — Express already catches synchronous
// throws on its own. This only matters for `async` handlers, where a
// thrown error becomes an unhandled promise rejection unless something
// explicitly calls `next(err)`.

function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
