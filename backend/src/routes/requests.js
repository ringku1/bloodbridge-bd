// routes/requests.js
//
// Blood request lifecycle:
//
//   1. Requester POSTs a new request
//      → PostGIS finds nearby verified donors within 5km
//      → FCM push sent to all of them
//      → Escalation is handled by a Cloudflare Worker cron calling POST /api/cron/escalate
//
//   2. Donor GETs the request details and POSTs /accept
//      → DonorResponse updated to ACCEPTED
//      → Request status set to MATCHED
//      → Escalation stops automatically — cron skips non-OPEN requests
//
//   3. Requester POSTs /confirm after donation
//      → DonorResponse updated to DONATED
//      → Request status set to FULFILLED
//      → Donor locked for 120 days (both writes in a single Prisma transaction)

const express        = require('express');
const Joi            = require('joi');
const prisma         = require('../config/prisma');
const authMiddleware = require('../middleware/auth');
const fcmService     = require('../services/fcmService');
const geoService     = require('../services/geoService');

const router = express.Router();
router.use(authMiddleware);

const BLOOD_GROUPS = ['A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'O_POS', 'O_NEG', 'AB_POS', 'AB_NEG'];

const createRequestSchema = Joi.object({
  bloodGroup:   Joi.string().valid(...BLOOD_GROUPS).required(),
  hospitalName: Joi.string().trim().min(2).max(255).required(),
  latitude:     Joi.number().min(-90).max(90).required(),
  longitude:    Joi.number().min(-180).max(180).required(),
  unitsNeeded:  Joi.number().integer().min(1).max(10).default(1),
});

const confirmSchema = Joi.object({
  donorId: Joi.string().uuid().required(),
});

// ─── POST /api/requests ───────────────────────────────────────────────────────
// Creates a blood request and notifies nearby donors.
router.post('/', async (req, res, next) => {
  try {
    const { error, value } = createRequestSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({ error: error.details.map((d) => d.message).join('; ') });
    }

    const { bloodGroup, hospitalName, latitude, longitude, unitsNeeded } = value;

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

    if (nearbyDonors.length > 0) {
      await prisma.donorResponse.createMany({
        data: nearbyDonors.map((donor) => ({
          requestId: request.id,
          donorId:   donor.id,
        })),
        skipDuplicates: true,
      });

      await fcmService.sendToMany(
        nearbyDonors.map((d) => d.fcmToken),
        {
          title: `Urgent: ${bloodGroup.replace('_', ' ')} blood needed`,
          body:  `${hospitalName} needs blood. You are nearby. Tap to help.`,
          data:  { requestId: request.id, screen: 'RequestDetail' },
        }
      );
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
// "active" must be defined BEFORE "/:id" so Express doesn't treat it as an ID.
router.get('/active', async (req, res, next) => {
  try {
    const requests = await prisma.bloodRequest.findMany({
      where: {
        requesterId: req.user.id,
        status: { in: ['OPEN', 'MATCHED'] },
      },
      include: {
        responses: {
          include: {
            donor: { select: { id: true, name: true, verifiedStatus: true, phone: true } },
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
// Donor accepts a blood request. Escalation stops automatically because the cron
// skips requests whose status is no longer OPEN.
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

    res.json({ message: 'You have accepted this request. Please proceed to the hospital.' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/requests/:id/confirm ──────────────────────────────────────────
// Requester confirms donation happened. Locks the donor for 120 days.
// Uses a Prisma transaction — all three writes succeed or none do.
router.post('/:id/confirm', async (req, res, next) => {
  try {
    const { error, value } = confirmSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { donorId } = value;

    const request = await prisma.bloodRequest.findUnique({
      where: { id: req.params.id },
    });

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (request.requesterId !== req.user.id) {
      return res.status(403).json({ error: 'Only the requester can confirm this donation' });
    }

    // Verify the donor actually accepted this specific request
    const donorResponse = await prisma.donorResponse.findUnique({
      where: { requestId_donorId: { requestId: request.id, donorId } },
    });

    if (!donorResponse || donorResponse.status !== 'ACCEPTED') {
      return res.status(400).json({ error: 'This donor has not accepted your request' });
    }

    const now             = new Date();
    const eligibleAgainAt = new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000);

    await prisma.$transaction([
      prisma.donorResponse.update({
        where: { requestId_donorId: { requestId: request.id, donorId } },
        data:  { status: 'DONATED', donatedConfirmedAt: now },
      }),
      prisma.bloodRequest.update({
        where: { id: request.id },
        data:  { status: 'FULFILLED' },
      }),
      prisma.user.update({
        where: { id: donorId },
        data: {
          isAvailable:    false,
          lastDonatedAt:  now,
          eligibleAgainAt,
        },
      }),
    ]);

    res.json({ message: 'Donation confirmed. Thank you!', eligibleAgainAt });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
