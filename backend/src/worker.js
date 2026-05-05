// worker.js
//
// Standalone worker process — runs on RunSite (or any persistent host).
// Does NOT start an HTTP server. Only runs:
//   - Bull escalation queue worker (15 min + 30 min escalation jobs)
//   - node-cron eligibility reset (daily 6 AM + 15-min expiry check)
//
// Why separate from server.js?
//   When deploying the API on Vercel (serverless), workers cannot run there
//   because Vercel functions are stateless and short-lived. This process runs
//   on a separate persistent service (RunSite free tier) that shares the same
//   PostgreSQL (Neon) and Redis (RunSite) as the Vercel API.
//
// Run: node src/worker.js   or   npm run start:worker

require('dotenv').config();

const prisma = require('./config/prisma');
const redis  = require('./config/redis');
const { startEligibilityWorker }              = require('./workers/eligibilityWorker');
const { startEscalationWorker, escalationQueue } = require('./workers/escalationWorker');

const required = ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET'];
const missing  = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[Worker] Missing env vars: ${missing.join(', ')}`);
  process.exit(1);
}

async function startWorker() {
  try {
    await prisma.$connect();
    console.log('[Worker] PostgreSQL connected');

    startEligibilityWorker();
    startEscalationWorker();

    console.log('[Worker] Ready — eligibility cron + escalation queue running');

    const shutdown = async (signal) => {
      console.log(`[Worker] ${signal} received — shutting down...`);
      if (escalationQueue) await escalationQueue.pause(true);
      await prisma.$disconnect();
      await redis.quit();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

  } catch (err) {
    console.error('[Worker] Failed to start:', err.message);
    process.exit(1);
  }
}

startWorker();
