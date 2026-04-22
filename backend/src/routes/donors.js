// routes/donors.js
//
// All donor-related actions. Every route here requires authentication.
//
// Endpoints:
//   PUT  /api/donors/profile      — update name, blood group, GPS location, district
//   PUT  /api/donors/fcm-token    — save Firebase push notification token
//   PUT  /api/donors/availability — toggle isAvailable (e.g. donor going on holiday)
//   POST /api/donors/log-donation — manually record a donation (locks donor for 120 days)
//   GET  /api/donors/eligibility  — check if donor can donate + days remaining

const express        = require('express');
const Joi            = require('joi');
const prisma         = require('../config/prisma');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const BLOOD_GROUPS = ['A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'O_POS', 'O_NEG', 'AB_POS', 'AB_NEG'];

// ─── Validation schemas ───────────────────────────────────────────────────────

const profileSchema = Joi.object({
  name:       Joi.string().trim().min(2).max(100),
  bloodGroup: Joi.string().valid(...BLOOD_GROUPS),
  latitude:   Joi.number().min(-90).max(90),
  longitude:  Joi.number().min(-180).max(180),
  district:   Joi.string().trim().max(100),
}).min(1); // at least one field must be present

const fcmTokenSchema = Joi.object({
  fcmToken: Joi.string().min(10).max(512).required(),
});

const donationSchema = Joi.object({
  donatedAt: Joi.date().iso().max('now').optional(),
});

// ─── PUT /api/donors/profile ──────────────────────────────────────────────────
// Body: { name?, bloodGroup?, latitude?, longitude?, district? }
//
// latitude/longitude come from the device GPS.
// district is a human-readable label like "Dhaka" or "Chattogram".
router.put('/profile', async (req, res, next) => {
  try {
    const { error, value } = profileSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({ error: error.details.map((d) => d.message).join('; ') });
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data:  value,
      select: {
        id:             true,
        name:           true,
        bloodGroup:     true,
        latitude:       true,
        longitude:      true,
        district:       true,
        verifiedStatus: true,
        isAvailable:    true,
      },
    });

    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/donors/availability ────────────────────────────────────────────
// Body: { isAvailable: true | false }
//
// Guards against re-enabling during the 120-day lockout after a donation.
router.put('/availability', async (req, res, next) => {
  try {
    const { isAvailable } = req.body;

    if (typeof isAvailable !== 'boolean') {
      return res.status(400).json({ error: 'isAvailable must be true or false' });
    }

    if (isAvailable === true && req.user.eligibleAgainAt && req.user.eligibleAgainAt > new Date()) {
      return res.status(400).json({
        error: `You cannot mark yourself available until ${req.user.eligibleAgainAt.toDateString()} (120-day donation wait).`,
      });
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data:  { isAvailable },
    });

    res.json({ isAvailable, message: `You are now marked as ${isAvailable ? 'available' : 'unavailable'}.` });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/donors/fcm-token ────────────────────────────────────────────────
// Body: { fcmToken }
//
// FCM token is device-specific. The mobile app calls this on every startup
// to keep it fresh (tokens can change on app reinstall).
router.put('/fcm-token', async (req, res, next) => {
  try {
    const { error, value } = fcmTokenSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data:  { fcmToken: value.fcmToken },
    });

    res.json({ message: 'FCM token updated' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/donors/log-donation ────────────────────────────────────────────
// Body: { donatedAt? }  (ISO date string — defaults to now)
//
// Manually logs a donation (e.g. donated at a blood bank independently of the app).
// Locks the donor for 120 days (WHO minimum wait between whole blood donations).
router.post('/log-donation', async (req, res, next) => {
  try {
    const { error, value } = donationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const donationDate    = value.donatedAt ? new Date(value.donatedAt) : new Date();
    const eligibleAgainAt = new Date(donationDate.getTime() + 120 * 24 * 60 * 60 * 1000);

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        isAvailable:    false,
        lastDonatedAt:  donationDate,
        eligibleAgainAt,
      },
      select: {
        id:             true,
        isAvailable:    true,
        lastDonatedAt:  true,
        eligibleAgainAt: true,
      },
    });

    res.json({
      message: `Donation logged. You will be eligible to donate again on ${eligibleAgainAt.toDateString()}.`,
      user,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/donors/eligibility ─────────────────────────────────────────────
// Returns whether the donor can donate today and how many days remain if not.
router.get('/eligibility', async (req, res, next) => {
  try {
    const { isAvailable, eligibleAgainAt, lastDonatedAt } = req.user;

    if (isAvailable) {
      return res.json({
        isAvailable:   true,
        daysRemaining: 0,
        message:       'You are eligible to donate blood.',
      });
    }

    const now          = new Date();
    const msRemaining  = eligibleAgainAt ? eligibleAgainAt - now : 0;
    const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));

    res.json({
      isAvailable:    false,
      lastDonatedAt,
      eligibleAgainAt,
      daysRemaining,
      message: `You can donate again in ${daysRemaining} day(s).`,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
