// config/redis.js
//
// Exports a single shared Redis client (ioredis).
//
// Redis is used for OTP storage — temporary keys with TTL (e.g. otp:+8801234567890 → "123456")
// and for OTP attempt rate-limiting (otp_attempts:+8801234567890 → count).
//
// ioredis automatically reconnects on connection loss using exponential backoff.

const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  // Exponential backoff: 50ms → 100ms → 200ms → ... capped at 2s
  retryStrategy(times) {
    return Math.min(times * 50, 2000);
  },
});

redis.on('connect', () => console.log('[Redis] Connected'));
redis.on('error', (err) => console.error('[Redis] Error:', err.message));

module.exports = redis;
