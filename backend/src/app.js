// app.js
//
// Creates and configures the Express application.
// Separated from server.js so tests can import `app` without starting the HTTP server.
//
// Middleware order matters in Express:
//   helmet → cors → rate-limit → morgan → body parser → routes → error handler

require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const morgan       = require('morgan');
const rateLimit    = require('express-rate-limit');
const authRoutes       = require('./routes/auth');
const donorRoutes      = require('./routes/donors');
const requestRoutes    = require('./routes/requests');
const verifyRoutes     = require('./routes/verify');
const callRoutes       = require('./routes/call');
const chatRoutes       = require('./routes/chat');
const caregiverRoutes  = require('./routes/caregivers');
const adminRoutes      = require('./routes/admin');
const cronRoutes       = require('./routes/cron');
const errorHandler  = require('./middleware/errorHandler');
const prisma        = require('./config/prisma');
const redis         = require('./config/redis');

const app = express();

// ─── Security headers ─────────────────────────────────────────────────────────
// helmet sets HTTP headers that protect against common web attacks.
app.use(helmet({
  hsts: {
    maxAge:            31536000, // 1 year
    includeSubDomains: true,
    preload:           true,
  },
  referrerPolicy: { policy: 'no-referrer' },
}));

// ─── CORS ─────────────────────────────────────────────────────────────────────
// In production, ALLOWED_ORIGINS in .env restricts which clients can call this API.
// In development, all origins are allowed so Postman / Expo work out of the box.
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : [];

app.use(cors({
  origin: allowedOrigins.length > 0
    ? (origin, cb) => {
        // Allow requests with no Origin header (mobile apps, curl, Postman)
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error(`Origin ${origin} not allowed by CORS`));
      }
    : true, // dev: allow everything
  methods:      ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-secret', 'x-cron-secret'],
  optionsSuccessStatus: 200,
}));

// ─── Rate limiting ────────────────────────────────────────────────────────────
// General limiter: 100 requests per 15 minutes per IP.
// Protects every endpoint from simple DDoS and scraping.
const apiLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             100,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: 'Too many requests — please try again in 15 minutes.' },
});

// Tight limiter for OTP endpoints: 5 requests per minute per IP.
// Even with rate limiting here, we also lock by phone in Redis (see routes/auth.js).
const otpLimiter = rateLimit({
  windowMs:               60 * 1000,
  max:                    5,
  standardHeaders:        true,
  legacyHeaders:          false,
  skipSuccessfulRequests: true,
  message:                { error: 'Too many OTP attempts — wait 1 minute.' },
});

// Tight limiter for admin endpoints: 20 requests per 15 minutes per IP.
// Slows brute-force attempts against the ADMIN_SECRET header.
const adminLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             20,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: 'Too many admin requests — please try again in 15 minutes.' },
});

// Tight limiter for Twilio Proxy call routes: 10 session creates per 15 minutes per IP.
// Twilio Proxy sessions cost money and are high-value abuse targets.
const callLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: 'Too many call requests — please try again in 15 minutes.' },
});

// Chat limiter: 60 messages per minute per IP.
const chatLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             60,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: 'Sending too fast — slow down.' },
});

app.use('/api/', apiLimiter);
app.use('/api/auth/send-otp',   otpLimiter);
app.use('/api/auth/verify-otp', otpLimiter);
app.use('/api/admin',           adminLimiter);
app.use('/api/verify/admin',    adminLimiter);
app.use('/api/call',            callLimiter);
app.use('/api/chat',            chatLimiter);

// ─── Request logging ──────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ─── Body parsing ─────────────────────────────────────────────────────────────
// Explicit size limits prevent memory-exhaustion attacks via large payloads.
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ─── Health endpoints ─────────────────────────────────────────────────────────
// /health    → liveness:  is the process responding? (Kubernetes liveness probe)
// /health/ready → readiness: can we handle traffic? (checks DB + Redis)
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.get('/health/ready', async (_req, res) => {
  try {
    await Promise.all([
      prisma.$queryRaw`SELECT 1`,
      redis.ping(),
    ]);
    res.json({ status: 'ready', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'not_ready', error: err.message });
  }
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/donors',     donorRoutes);
app.use('/api/requests',   requestRoutes);
app.use('/api/verify',     verifyRoutes);
app.use('/api/call',       callRoutes);
app.use('/api/chat',       chatRoutes);
app.use('/api/caregivers', caregiverRoutes);
app.use('/api/admin',      adminRoutes);
app.use('/api/cron',       cronRoutes);

// ─── Error handler ────────────────────────────────────────────────────────────
// MUST be last — Express only calls this when next(err) is invoked
app.use(errorHandler);

module.exports = app;
