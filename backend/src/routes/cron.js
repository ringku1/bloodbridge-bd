// routes/cron.js
//
// Protected cron endpoints called by the Cloudflare Worker on a schedule.
// All routes require the x-cron-secret header to prevent unauthorized invocations.
//
// Escalation timeline (replaced Bull queue):
//   Every minute  → POST /api/cron/escalate  — expands radius at T+15m, SMS caregivers at T+30m
//   Every 15 min  → POST /api/cron/expiry    — marks OPEN requests past expiresAt as EXPIRED
//   Daily 00:00 UTC → POST /api/cron/eligibility — resets donors whose 120-day wait ended
//
// Optimistic locking: each escalate handler uses updateMany with a WHERE on the current
// escalationLevel. If a concurrent cron invocation already claimed the row, count === 0
// and we skip it — no double-processing, no Redis-backed job store needed.

const express    = require('express');
const prisma     = require('../config/prisma');
const fcmService = require('../services/fcmService');
const smsService = require('../services/smsService');
const geoService = require('../services/geoService');

const router = express.Router();

function cronAuth(req, res, next) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'CRON_SECRET not configured on the server' });
  }
  if (req.headers['x-cron-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

router.use(cronAuth);

// ─── POST /api/cron/escalate ──────────────────────────────────────────────────
// Called every minute. Handles both escalation levels in one pass:
//   Level 1 (T+15m): find OPEN requests with escalationLevel=0 created ≥15m ago
//                    → expand to 15km, notify new donors
//   Level 2 (T+30m): find OPEN requests with escalationLevel=1 created ≥30m ago
//                    → SMS all registered caregivers
router.post('/escalate', async (req, res, next) => {
  try {
    const now            = new Date();
    const fifteenMinsAgo = new Date(now - 15 * 60 * 1000);
    const thirtyMinsAgo  = new Date(now - 30 * 60 * 1000);

    // ── Level 1 ──────────────────────────────────────────────────────────────
    const level1Candidates = await prisma.bloodRequest.findMany({
      where: {
        status:          'OPEN',
        escalationLevel: 0,
        createdAt:       { lte: fifteenMinsAgo },
      },
    });

    let level1Count = 0;
    for (const request of level1Candidates) {
      // Optimistic lock: claim only if still at level 0 and still OPEN
      const claimed = await prisma.bloodRequest.updateMany({
        where: { id: request.id, escalationLevel: 0, status: 'OPEN' },
        data:  { escalationLevel: 1, escalatedAt: now },
      });
      if (claimed.count === 0) continue; // already claimed by a concurrent invocation

      const donors = await geoService.findNearbyDonors({
        lat:        request.latitude,
        lng:        request.longitude,
        bloodGroup: request.bloodGroup,
        radiusKm:   15,
      });

      if (donors.length > 0) {
        await prisma.donorResponse.createMany({
          data: donors.map((donor) => ({
            requestId: request.id,
            donorId:   donor.id,
          })),
          skipDuplicates: true,
        });

        await fcmService.sendToMany(
          donors.map((d) => d.fcmToken),
          {
            title: `Still needed: ${request.bloodGroup.replace('_', ' ')} blood`,
            body:  `${request.hospitalName} still needs a donor. You are within 15 km.`,
            data:  { requestId: request.id, screen: 'RequestDetail' },
          }
        );
      }

      level1Count++;
      console.log(`[Cron/escalate] Level 1: request ${request.id}, notified ${donors.length} donors`);
    }

    // ── Level 2 ──────────────────────────────────────────────────────────────
    const level2Candidates = await prisma.bloodRequest.findMany({
      where: {
        status:          'OPEN',
        escalationLevel: 1,
        createdAt:       { lte: thirtyMinsAgo },
      },
      include: {
        requester: {
          include: {
            caregivers: { orderBy: { priority: 'asc' } },
          },
        },
      },
    });

    let level2Count = 0;
    for (const request of level2Candidates) {
      // Optimistic lock: claim only if still at level 1 and still OPEN
      const claimed = await prisma.bloodRequest.updateMany({
        where: { id: request.id, escalationLevel: 1, status: 'OPEN' },
        data:  { escalationLevel: 2, escalatedAt: now },
      });
      if (claimed.count === 0) continue;

      const caregivers = request.requester.caregivers;
      for (const cg of caregivers) {
        const message =
          `URGENT: ${request.requester.name || 'Someone you know'} needs ` +
          `${request.bloodGroup.replace('_', ' ')} blood at ${request.hospitalName}. ` +
          `No donor has been found in 30 minutes. Please help or spread the word.`;
        await smsService.send(cg.phone, message);
      }

      level2Count++;
      console.log(`[Cron/escalate] Level 2: request ${request.id}, SMS sent to ${caregivers.length} caregiver(s)`);
    }

    res.json({ level1: level1Count, level2: level2Count });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/cron/expiry ────────────────────────────────────────────────────
// Called every 15 minutes. Marks OPEN requests past their expiresAt as EXPIRED.
router.post('/expiry', async (req, res, next) => {
  try {
    const result = await prisma.bloodRequest.updateMany({
      where: {
        status:    'OPEN',
        expiresAt: { lte: new Date() },
      },
      data: { status: 'EXPIRED' },
    });

    if (result.count > 0) {
      console.log(`[Cron/expiry] Expired ${result.count} stale blood request(s)`);
    }

    res.json({ expired: result.count });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/cron/eligibility ───────────────────────────────────────────────
// Called daily at 00:00 UTC (06:00 AM Bangladesh Standard Time).
// Resets donors whose 120-day post-donation wait has ended and sends push notifications.
router.post('/eligibility', async (req, res, next) => {
  try {
    const donors = await prisma.user.findMany({
      where: {
        isAvailable:     false,
        eligibleAgainAt: { lte: new Date() },
      },
      select: { id: true, fcmToken: true },
    });

    if (donors.length === 0) {
      return res.json({ reset: 0 });
    }

    await prisma.user.updateMany({
      where: { id: { in: donors.map((d) => d.id) } },
      data:  { isAvailable: true },
    });

    for (const donor of donors) {
      if (donor.fcmToken) {
        await fcmService.send(donor.fcmToken, {
          title: 'You can donate again!',
          body:  'Your 120-day wait is over. You are now eligible to donate blood. Open the app to mark yourself available.',
          data:  { screen: 'Home' },
        });
      }
    }

    console.log(`[Cron/eligibility] Reset ${donors.length} donor(s) to available`);
    res.json({ reset: donors.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
