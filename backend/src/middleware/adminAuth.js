// middleware/adminAuth.js
//
// Simple admin authentication via a shared secret header.
//
// Usage: attach to admin-only routes:
//   router.put('/verify/:userId', adminAuth, handler)
//
// The client (you, via Postman or a future admin panel) sends:
//   x-admin-secret: <value from ADMIN_SECRET in .env>
//
// This is intentionally simple for v1 — no separate admin user table,
// no admin JWT. A shared secret is sufficient since NID review is done
// manually by a trusted person, not exposed to the public.

function adminAuth(req, res, next) {
  const secret = req.headers['x-admin-secret'];

  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden: invalid admin secret' });
  }

  next();
}

module.exports = adminAuth;
