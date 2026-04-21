// middleware/errorHandler.js
//
// Central error handler — catches any error passed via next(err) from route handlers.
//
// IMPORTANT: This must be registered LAST in app.js, after all routes.
// Express identifies error handlers by the 4-parameter signature (err, req, res, next).
//
// Why centralize errors?
//   Without this, each route would need its own try/catch + res.status(...).json(...).
//   With this, routes just call next(err) and this handler formats the response.

function errorHandler(err, req, res, next) {
  // Show full stack trace in development, just the message in production
  if (process.env.NODE_ENV !== 'production') {
    console.error('[Error]', err.stack);
  } else {
    console.error('[Error]', err.message);
  }

  // ─── Prisma error codes ────────────────────────────────────────────────────
  // P2025: record not found (e.g. update/delete on non-existent row)
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Record not found' });
  }
  // P2002: unique constraint violation (e.g. duplicate phone number)
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'Duplicate record — this value already exists' });
  }

  // ─── Generic fallback ──────────────────────────────────────────────────────
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
  });
}

module.exports = errorHandler;
