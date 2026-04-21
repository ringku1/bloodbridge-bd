// app.js
//
// Creates and configures the Express application.
// Separated from server.js so tests can import `app` without starting the HTTP server.
//
// Middleware order matters in Express:
//   helmet → cors → morgan → body parser → routes → error handler

require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const morgan       = require('morgan');
const authRoutes    = require('./routes/auth');
const donorRoutes   = require('./routes/donors');
const requestRoutes = require('./routes/requests');
const verifyRoutes  = require('./routes/verify');
const errorHandler  = require('./middleware/errorHandler');

const app = express();

// ─── Security middleware ───────────────────────────────────────────────────────
// helmet sets HTTP headers that protect against common attacks:
//   - X-Content-Type-Options: nosniff  (prevent MIME-type sniffing)
//   - X-Frame-Options: DENY            (prevent clickjacking)
//   - Strict-Transport-Security        (force HTTPS)
app.use(helmet());

// cors allows the mobile app (and Postman during dev) to call this API.
// In production, restrict the origin to your app's domain.
app.use(cors());

// morgan logs every HTTP request: "GET /api/auth/send-otp 200 45ms"
// Skipped in test to keep test output clean.
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Parse JSON request bodies (e.g. { "phone": "+8801712345678" })
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check — used by docker-compose healthcheck and deployment platforms
// to verify the server is running before routing traffic to it
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api/auth',     authRoutes);
app.use('/api/donors',   donorRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/verify',   verifyRoutes);

// More routes will be added here as we build each feature:
// app.use('/api/call',     callRoutes);
// app.use('/api/requests', requestRoutes);
// app.use('/api/verify',   verifyRoutes);
// app.use('/api/call',     callRoutes);
// app.use('/api/admin',    adminRoutes);

// ─── Error handler ────────────────────────────────────────────────────────────
// MUST be last — Express only calls this when next(err) is invoked
app.use(errorHandler);

module.exports = app;
