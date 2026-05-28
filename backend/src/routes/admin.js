// routes/admin.js
//
// Admin-only endpoints for the web dashboard.
// All routes protected by x-admin-secret header (adminAuth middleware).
//
// GET /api/admin/stats          — dashboard counters
// GET /api/admin/users          — paginated user list
// GET /api/admin/requests       — paginated blood request list

const express   = require('express');
const prisma    = require('../config/prisma');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();
router.use(adminAuth);

// ─── GET /api/admin/stats ─────────────────────────────────────────────────────
router.get('/stats', async (req, res, next) => {
  try {
    const [
      totalUsers,
      pendingVerifications,
      activeRequests,
      totalDonations,
      totalRequests,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { verifiedStatus: 'PENDING' } }),
      prisma.bloodRequest.count({ where: { status: { in: ['OPEN', 'MATCHED'] } } }),
      prisma.donorResponse.count({ where: { status: 'DONATED' } }),
      prisma.bloodRequest.count(),
    ]);

    res.json({ totalUsers, pendingVerifications, activeRequests, totalDonations, totalRequests });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/admin/users ─────────────────────────────────────────────────────
// Query params: page (default 1), limit (default 20), verifiedStatus, bloodGroup, search
router.get('/users', async (req, res, next) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 20);
    const skip   = (page - 1) * limit;

    const where = {};
    if (req.query.verifiedStatus) where.verifiedStatus = req.query.verifiedStatus;
    if (req.query.bloodGroup)     where.bloodGroup      = req.query.bloodGroup;
    if (req.query.search) {
      where.OR = [
        { name:  { contains: req.query.search, mode: 'insensitive' } },
        { email: { contains: req.query.search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id:             true,
          name:           true,
          email:          true,
          emailVerified:  true,
          bloodGroup:     true,
          district:       true,
          verifiedStatus: true,
          isAvailable:    true,
          lastDonatedAt:  true,
          createdAt:      true,
          _count:         { select: { responses: true, requests: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/admin/requests ──────────────────────────────────────────────────
// Query params: page, limit, status, bloodGroup
router.get('/requests', async (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip  = (page - 1) * limit;

    const where = {};
    if (req.query.status)     where.status     = req.query.status;
    if (req.query.bloodGroup) where.bloodGroup = req.query.bloodGroup;

    const [requests, total] = await Promise.all([
      prisma.bloodRequest.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { createdAt: 'desc' },
        include: {
          requester: { select: { id: true, name: true, email: true } },
          _count:    { select: { responses: true } },
        },
      }),
      prisma.bloodRequest.count({ where }),
    ]);

    res.json({ requests, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
