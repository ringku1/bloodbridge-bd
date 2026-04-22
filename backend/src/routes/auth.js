// routes/auth.js
//
// Phone-based OTP authentication.
//
// Flow:
//   1. POST /api/auth/send-otp   → generate OTP, store in Redis (5 min TTL), send via SMS
//   2. POST /api/auth/verify-otp → check OTP, create user if new, return JWT
//
// Brute-force protection:
//   We track failed verify attempts in Redis per phone number.
//   After 3 consecutive failures the phone is locked for 15 minutes.
//   The lock key is "otp_attempts:<phone>" with a 900-second TTL.

const express = require('express');
const jwt     = require('jsonwebtoken');
const prisma  = require('../config/prisma');
const redis   = require('../config/redis');
const smsService = require('../services/smsService');

const router = express.Router();

const BD_PHONE_REGEX = /^\+8801[3-9]\d{8}$/;

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ─── POST /api/auth/send-otp ──────────────────────────────────────────────────
// Body: { phone: "+8801712345678" }
router.post('/send-otp', async (req, res, next) => {
  try {
    const { phone } = req.body;

    if (!phone || !BD_PHONE_REGEX.test(phone)) {
      return res.status(400).json({
        error: 'Invalid phone number. Use E.164 format: +8801XXXXXXXXX',
      });
    }

    const otp = generateOtp();

    // key = "otp:+8801...", value = OTP, TTL = 5 minutes
    await redis.setex(`otp:${phone}`, 300, otp);

    // Clear any previous failed-attempt counter when a fresh OTP is requested
    await redis.del(`otp_attempts:${phone}`);

    await smsService.send(
      phone,
      `Your Blood Bridge OTP is: ${otp}. Valid for 5 minutes. Do not share this code.`
    );

    res.json({ message: 'OTP sent successfully' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/verify-otp ───────────────────────────────────────────────
// Body: { phone: "+8801712345678", otp: "482910" }
// Returns: { token, user }
router.post('/verify-otp', async (req, res, next) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ error: 'phone and otp are required' });
    }

    // ── Brute-force guard ──────────────────────────────────────────────────
    const attemptsKey = `otp_attempts:${phone}`;
    const attempts    = parseInt(await redis.get(attemptsKey) || '0', 10);

    if (attempts >= 3) {
      return res.status(429).json({
        error: 'Too many failed OTP attempts. Request a new OTP and try again.',
      });
    }

    const storedOtp = await redis.get(`otp:${phone}`);

    if (!storedOtp || storedOtp !== otp) {
      // Increment attempt counter; auto-expires after 15 minutes
      await redis.setex(attemptsKey, 900, attempts + 1);
      return res.status(401).json({ error: 'Invalid or expired OTP' });
    }

    // OTP correct — clear both the OTP and the attempt counter
    await redis.del(`otp:${phone}`, `otp_attempts:${phone}`);

    // upsert: if phone exists → fetch user; if not → create new user
    const user = await prisma.user.upsert({
      where:  { phone },
      create: { phone, phoneVerified: true },
      update: { phoneVerified: true },
    });

    const token = jwt.sign(
      { userId: user.id, phone: user.phone },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );

    res.json({
      token,
      user: {
        id:             user.id,
        phone:          user.phone,
        name:           user.name,
        bloodGroup:     user.bloodGroup,
        verifiedStatus: user.verifiedStatus,
        isAvailable:    user.isAvailable,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
