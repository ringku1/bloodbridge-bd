// server.js
//
// Entry point — validates environment, starts the HTTP server, and connects to
// PostgreSQL and Redis.
//
// Why separate app.js and server.js?
//   app.js exports the Express app (pure logic, no side effects).
//   server.js starts listening on a port (side effect).
//   Tests import app.js without binding to a port.

const app    = require('./app');
const prisma = require('./config/prisma');
const redis  = require('./config/redis');
const { ensureBucketExists } = require('./services/s3Service');

const PORT = process.env.PORT || 3000;

// ─── Fail-fast secret validation ─────────────────────────────────────────────
// If critical secrets are missing or still set to placeholder values, refuse to
// start rather than running silently broken. Catches misconfigured deployments
// before they serve real traffic.
function validateEnvironment() {
  const required = ['JWT_SECRET', 'DATABASE_URL', 'REDIS_URL', 'CRON_SECRET'];
  const placeholders = ['change_this', 'your_', 'changeme', 'secret_here'];

  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (process.env.NODE_ENV === 'production') {
    const insecure = required.filter((k) => {
      const val = (process.env[k] || '').toLowerCase();
      return placeholders.some((p) => val.includes(p));
    });
    if (insecure.length) {
      throw new Error(
        `Refusing to start: ${insecure.join(', ')} still contain placeholder values in production.`
      );
    }

    if (!process.env.ADMIN_SECRET || process.env.ADMIN_SECRET.length < 32) {
      throw new Error('ADMIN_SECRET must be at least 32 characters in production.');
    }
  }
}

async function startServer() {
  try {
    validateEnvironment();

    await prisma.$connect();
    console.log('[DB] PostgreSQL connected');

    await ensureBucketExists();

    const server = app.listen(PORT, () => {
      console.log(`[Server] Listening on port ${PORT}  (${process.env.NODE_ENV || 'development'})`);
    });

    // ─── Graceful shutdown ────────────────────────────────────────────────────
    // On SIGTERM / SIGINT:
    //   1. Stop accepting new HTTP connections
    //   2. Disconnect DB and Redis cleanly
    // A 30-second hard-kill ensures Docker doesn't wait forever.
    const shutdown = async (signal) => {
      console.log(`\n[Server] Received ${signal} — shutting down gracefully...`);

      const forceExit = setTimeout(() => {
        console.error('[Server] Forced exit after 30s timeout');
        process.exit(1);
      }, 30_000);
      forceExit.unref();

      server.close(async () => {
        try {
          await prisma.$disconnect();
          await redis.quit();
          console.log('[Server] Shutdown complete');
          process.exit(0);
        } catch (err) {
          console.error('[Server] Error during shutdown:', err.message);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

  } catch (err) {
    console.error('[Server] Failed to start:', err.message);
    process.exit(1);
  }
}

startServer();
