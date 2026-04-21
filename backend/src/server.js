// server.js
//
// Entry point — starts the HTTP server and verifies connections to PostgreSQL and Redis.
//
// Why separate app.js and server.js?
//   app.js exports the Express app (logic).
//   server.js starts listening on a port (side effect).
//   This separation allows tests to import app.js without binding to a port.

const app    = require('./app');
const prisma = require('./config/prisma');
const redis  = require('./config/redis');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Verify DB is reachable before accepting traffic.
    // If this throws, the process exits immediately with a clear error.
    await prisma.$connect();
    console.log('[DB] PostgreSQL connected');

    // Redis connection is established lazily by ioredis — log is handled
    // by the event listener in config/redis.js

    const server = app.listen(PORT, () => {
      console.log(`[Server] Listening on port ${PORT}  (${process.env.NODE_ENV || 'development'})`);
    });

    // ─── Graceful shutdown ────────────────────────────────────────────────────
    // When the process receives SIGTERM (e.g. docker stop) or SIGINT (Ctrl+C):
    //   1. Stop accepting new connections
    //   2. Wait for in-flight requests to finish
    //   3. Close DB and Redis connections cleanly
    // Without this, abrupt shutdown can corrupt in-flight DB transactions.
    const shutdown = async (signal) => {
      console.log(`\n[Server] Received ${signal} — shutting down gracefully...`);
      server.close(async () => {
        await prisma.$disconnect();
        await redis.quit();
        console.log('[Server] Shutdown complete');
        process.exit(0);
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
