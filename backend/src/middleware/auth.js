// middleware/auth.js
//
// JWT authentication middleware.
// Attach to any route that requires a logged-in user:
//
//   router.get('/profile', authMiddleware, async (req, res) => {
//     const user = req.user;  // ← set by this middleware
//     ...
//   });
//
// How JWTs work (quick summary for learning):
//   1. On login, server signs a payload (userId, phone) with JWT_SECRET → token string
//   2. Client stores token and sends it in every request: "Authorization: Bearer <token>"
//   3. This middleware verifies the signature — if tampered or expired, it rejects the request
//   4. No database session needed — the token itself proves identity

const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Authorization header. Format: Bearer <token>' });
    }

    const token = authHeader.slice(7); // strip "Bearer " prefix
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch fresh user from DB on each request.
    // This ensures changes (e.g. admin banning a user) take effect immediately
    // without waiting for the token to expire.
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user; // downstream handlers access the user via req.user
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please log in again.' });
    }
    next(err);
  }
}

module.exports = authMiddleware;
