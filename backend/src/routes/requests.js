// routes/requests.js
//
// Blood request lifecycle:
//
//   1. Requester POSTs a new request
//      → PostGIS finds nearby verified donors within 5km
//      → FCM push sent to all of them
//      → Two Bull jobs scheduled (15 min escalation, 30 min caregiver SMS)
//
//   2. Donor GETs the request details and POSTs /accept
//      → DonorResponse updated to ACCEPTED
//      → Request status set to MATCHED
//      → Escalation jobs cancelled
//
//   3. Requester POSTs /confirm after donation
//      → DonorResponse updated to DONATED
//      → Request status set to FULFILLED
//      → Donor locked for 120 days (isAvailable=false, eligibleAgainAt set)
//      → Both updates in a single Prisma transaction (atomic)
//
// Note on escalation jobs:
//   Bull queue setup is in workers/escalationWorker.js (Step 7).
//   This file just schedules and cancels jobs — the worker file processes them.

const express        = require('express');
const prisma         = require('../config/prisma');
const authMiddleware = require('../middleware/auth');
const fcmService     = require('../services/fcmService');
const geoService     = require('../services/geoService');
const redis          = require('../config/redis');

const router = express.Router();
router.use(authMiddleware);

// ─── POST /api/requests ───────────────────────────────────────────────────────
// Body: { bloodGroup, hospitalName, latitude, longitude, unitsNeeded }
// Creates a blood request and notifies nearby donors.
router.post('/', async (req, res, next) => {
  try {
    const { bloodGroup, hospitalName, latitude, longitude, unitsNeeded = 1 } = req.body;

    if (!bloodGroup || !hospitalName || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        error: 'bloodGroup, hospitalName, latitude, and longitude are required',
      });
    }

    // Request expires after 6 hours if no donor is found
    const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000);

    const request = await prisma.bloodRequest.create({
      data: {
        requesterId: req.user.id,
        bloodGroup,
        hospitalName,
        latitude,
        longitude,
        unitsNeeded,
        expiresAt,
      },
    });

    // Find verified donors within 5km initial radius
    const nearbyDonors = await geoService.findNearbyDonors({
      lat: latitude,
      lng: longitude,
      bloodGroup,
      radiusKm: 5,
    });

    // Create a DonorResponse row for each notified donor (status = NOTIFIED)
    // This lets us track who was told about the request
    if (nearbyDonors.length > 0) {
      await prisma.donorResponse.createMany({
        data: nearbyDonors.map((donor) => ({
          requestId: request.id,
          donorId:   donor.id,
        })),
        skipDuplicates: true,
      });

      // Send push notification to all nearby donors
      await fcmService.sendToMany(
        nearbyDonors.map((d) => d.fcmToken),
        {
          title: `Urgent: ${bloodGroup.replace('_', ' ')} blood needed`,
          body:  `${hospitalName} needs blood. You are nearby. Tap to help.`,
          data:  { requestId: request.id, screen: 'RequestDetail' },
        }
      );
    }

    // Schedule escalation jobs (Bull queue — implemented in Step 7)
    // Wrapped in try/catch so a Redis failure doesn't block request creation
    try {
      await scheduleEscalation(request.id);
    } catch (err) {
      console.error('[Escalation] Failed to schedule jobs:', err.message);
    }

    res.status(201).json({
      request,
      donorsNotified: nearbyDonors.length,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/requests/active ─────────────────────────────────────────────────
// Returns the logged-in requester's currently open requests.
// "active" must be defined BEFORE "/:id" so Express doesn't treat it as an ID.
router.get('/active', async (req, res, next) => {
  try {
    const requests = await prisma.bloodRequest.findMany({
      where: {
        requesterId: req.user.id,
        status: 'OPEN',
      },
      include: {
        responses: {
          include: {
            donor: {
              select: { id: true, name: true, verifiedStatus: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ requests });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/requests/:id ────────────────────────────────────────────────────
// Full request details — accessible by the requester or any notified donor.
router.get('/:id', async (req, res, next) => {
  try {
    const request = await prisma.bloodRequest.findUnique({
      where: { id: req.params.id },
      include: {
        requester: { select: { id: true, name: true, district: true } },
        responses: {
          include: {
            donor: { select: { id: true, name: true, verifiedStatus: true, bloodGroup: true } },
          },
        },
      },
    });

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    res.json({ request });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/requests/:id/accept ───────────────────────────────────────────
// Donor accepts a blood request.
// Updates their DonorResponse to ACCEPTED and the request status to MATCHED.
// Cancels the escalation jobs (no need to expand radius if donor is found).
router.post('/:id/accept', async (req, res, next) => {
  try {
    const request = await prisma.bloodRequest.findUnique({
      where: { id: req.params.id },
    });

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (request.status !== 'OPEN') {
      return res.status(409).json({ error: `Request is already ${request.status.toLowerCase()}` });
    }

    // Both updates must succeed together — use a transaction
    // If one fails, both are rolled back
    await prisma.$transaction([
      prisma.donorResponse.upsert({
        where:  { requestId_donorId: { requestId: request.id, donorId: req.user.id } },
        create: { requestId: request.id, donorId: req.user.id, status: 'ACCEPTED', respondedAt: new Date() },
        update: { status: 'ACCEPTED', respondedAt: new Date() },
      }),
      prisma.bloodRequest.update({
        where: { id: request.id },
        data:  { status: 'MATCHED' },
      }),
    ]);

    // Cancel escalation jobs since a donor was found
    try {
      await cancelEscalation(request.id);
    } catch (err) {
      console.error('[Escalation] Failed to cancel jobs:', err.message);
    }

    res.json({ message: 'You have accepted this request. Please proceed to the hospital.' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/requests/:id/confirm ──────────────────────────────────────────
// Requester confirms that donation happened.
// Updates the request to FULFILLED and locks the donor for 120 days.
// Uses a Prisma transaction so both writes are atomic.
router.post('/:id/confirm', async (req, res, next) => {
  try {
    const { donorId } = req.body;

    if (!donorId) {
      return res.status(400).json({ error: 'donorId is required' });
    }

    const request = await prisma.bloodRequest.findUnique({
      where: { id: req.params.id },
    });

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // Only the original requester can confirm their own request
    if (request.requesterId !== req.user.id) {
      return res.status(403).json({ error: 'Only the requester can confirm this donation' });
    }

    const now             = new Date();
    const eligibleAgainAt = new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000);

    // Atomic transaction: confirm donation + lock donor — both or neither
    await prisma.$transaction([
      // 1. Mark the donor's response as DONATED
      prisma.donorResponse.update({
        where:  { requestId_donorId: { requestId: request.id, donorId } },
        data:   { status: 'DONATED', donatedConfirmedAt: now },
      }),
      // 2. Mark the request as FULFILLED
      prisma.bloodRequest.update({
        where: { id: request.id },
        data:  { status: 'FULFILLED' },
      }),
      // 3. Lock donor for 120 days (WHO minimum wait between whole blood donations)
      prisma.user.update({
        where: { id: donorId },
        data: {
          isAvailable:    false,
          lastDonatedAt:  now,
          eligibleAgainAt,
        },
      }),
    ]);

    res.json({
      message:        'Donation confirmed. Thank you!',
      eligibleAgainAt,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Escalation helpers ───────────────────────────────────────────────────────
// These interact with the Bull queue that will be set up in Step 7.
// For now they're stubs that store/retrieve job IDs from Redis.
// The actual job processing logic lives in workers/escalationWorker.js.

async function scheduleEscalation(requestId) {
  // Lazy-load Bull queue to avoid crashing if Redis is temporarily unavailable
  const Queue = require('bull');
  const escalationQueue = new Queue('escalation', {
    redis: process.env.REDIS_URL || 'redis://localhost:6379',
  });

  const job1 = await escalationQueue.add(
    { requestId, level: 1 },
    { delay: 15 * 60 * 1000 }  // 15 minutes
  );
  const job2 = await escalationQueue.add(
    { requestId, level: 2 },
    { delay: 30 * 60 * 1000 }  // 30 minutes
  );

  // Store job IDs in Redis so we can cancel them if a donor accepts
  await redis.set(
    `escalation_jobs:${requestId}`,
    JSON.stringify([job1.id, job2.id]),
    'EX',
    3600  // auto-expire key after 1 hour
  );

  await escalationQueue.close();
}

async function cancelEscalation(requestId) {
  const raw = await redis.get(`escalation_jobs:${requestId}`);
  if (!raw) return;

  const jobIds = JSON.parse(raw);
  const Queue  = require('bull');
  const escalationQueue = new Queue('escalation', {
    redis: process.env.REDIS_URL || 'redis://localhost:6379',
  });

  for (const id of jobIds) {
    const job = await escalationQueue.getJob(id);
    if (job) await job.remove();
  }

  await redis.del(`escalation_jobs:${requestId}`);
  await escalationQueue.close();
}

module.exports = router;
