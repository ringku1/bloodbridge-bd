// routes/donors.js
//
// All donor-related actions. Every route here requires authentication
// (the user must be logged in via JWT).
//
// Endpoints:
//   PUT  /api/donors/profile      — update name, blood group, GPS location, district
//   PUT  /api/donors/fcm-token    — save Firebase push notification token
//   POST /api/donors/log-donation — manually record a donation (locks donor for 120 days)
//   GET  /api/donors/eligibility  — check if donor can donate + days remaining

const express      = require('express');
const prisma       = require('../config/prisma');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// All donor routes require a valid JWT
router.use(authMiddleware);

// ─── PUT /api/donors/profile ──────────────────────────────────────────────────
// Body: { name, bloodGroup, latitude, longitude, district }
//
// The donor fills this out after their first login.
// latitude/longitude come from the device's GPS.
// district is a string like "Dhaka", "Chattogram" — used as a human-readable label.
//
// Blood group must match one of the 8 enum values:
//   A_POS, A_NEG, B_POS, B_NEG, O_POS, O_NEG, AB_POS, AB_NEG
router.put('/profile', async (req, res, next) => {
  try {
    const { name, bloodGroup, latitude, longitude, district } = req.body;

    // Only update fields that were actually sent — undefined fields are ignored by Prisma
    const data = {};
    if (name      !== undefined) data.name      = name;
    if (bloodGroup !== undefined) data.bloodGroup = bloodGroup;
    if (latitude  !== undefined) data.latitude  = latitude;
    if (longitude !== undefined) data.longitude = longitude;
    if (district  !== undefined) data.district  = district;

    // Validate bloodGroup enum if provided
    const validBloodGroups = ['A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'O_POS', 'O_NEG', 'AB_POS', 'AB_NEG'];
    if (bloodGroup && !validBloodGroups.includes(bloodGroup)) {
      return res.status(400).json({
        error: `Invalid blood group. Must be one of: ${validBloodGroups.join(', ')}`,
      });
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
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

// ─── PUT /api/donors/fcm-token ────────────────────────────────────────────────
// Body: { fcmToken }
//
// FCM (Firebase Cloud Messaging) token is a device-specific string that Firebase
// uses to route push notifications to the right phone.
// It changes when the app is reinstalled, so the mobile app calls this endpoint
// on every startup to keep the token fresh.
router.put('/fcm-token', async (req, res, next) => {
  try {
    const { fcmToken } = req.body;

    if (!fcmToken) {
      return res.status(400).json({ error: 'fcmToken is required' });
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data:  { fcmToken },
    });

    res.json({ message: 'FCM token updated' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/donors/log-donation ────────────────────────────────────────────
// Body: { donatedAt }  (ISO date string, e.g. "2026-04-22T10:00:00Z")
//
// This is for manually logging a donation (e.g. donated at a blood bank independently
// of a request in the app). It locks the donor for 120 days.
//
// When a donation happens through the app (donor accepts a request + requester confirms),
// the same logic runs in POST /api/requests/:id/confirm — but that route handles
// the DonorResponse update too.
//
// 120 days = minimum wait between whole blood donations (WHO guideline).
router.post('/log-donation', async (req, res, next) => {
  try {
    const { donatedAt } = req.body;

    const donationDate = donatedAt ? new Date(donatedAt) : new Date();

    if (isNaN(donationDate.getTime())) {
      return res.status(400).json({ error: 'Invalid donatedAt date format. Use ISO 8601: 2026-04-22T10:00:00Z' });
    }

    // eligibleAgainAt = donation date + 120 days
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
      message: 'Donation logged. You will be eligible to donate again on ' +
               eligibleAgainAt.toDateString(),
      user,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/donors/eligibility ─────────────────────────────────────────────
// Returns whether the donor is currently eligible and how many days remain.
//
// This is shown on the donor's home screen: a countdown timer until they can
// donate again, or a "You can donate now!" banner.
router.get('/eligibility', async (req, res, next) => {
  try {
    const { isAvailable, eligibleAgainAt, lastDonatedAt } = req.user;

    if (isAvailable) {
      return res.json({
        isAvailable:  true,
        daysRemaining: 0,
        message:      'You are eligible to donate blood.',
      });
    }

    // Calculate how many full days remain
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
