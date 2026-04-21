// routes/auth.js
//
// Handles phone-based OTP authentication.
//
// Flow:
//   1. POST /api/auth/send-otp   → generate OTP, store in Redis (5 min TTL), send via SMS
//   2. POST /api/auth/verify-otp → check OTP, create user if new, return JWT
//
// Why OTP instead of password?
//   In Bangladesh, many users don't have email or remember passwords.
//   Phone OTP is familiar (used by bKash, Nagad, etc.) and more secure
//   than passwords for a mobile-first app.
//
// Why Redis for OTP storage (not DB)?
//   OTPs are temporary (5 min). Redis has native TTL support — keys
//   automatically delete themselves. No cleanup job needed.

const express = require('express');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const redis = require('../config/redis');
const smsService = require('../services/smsService');

const router = express.Router();

// Bangladesh mobile number regex: +8801 followed by 3-9, then 8 digits
// Covers all BD operators: Grameenphone (017x), Robi (018x), Banglalink (019x), etc.
const BD_PHONE_REGEX = /^\+8801[3-9]\d{8}$/;

function generateOtp() {
  // 6-digit numeric OTP: 100000–999999
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

    // Store in Redis: key = "otp:+8801712345678", value = "482910", TTL = 300 seconds
    await redis.setex(`otp:${phone}`, 300, otp);

    await smsService.send(
      phone,
      `Your Blood Bridge OTP is: ${otp}. Valid for 5 minutes. Do not share this code.`
    );

    // Don't reveal whether the phone is already registered — prevents user enumeration
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

    const storedOtp = await redis.get(`otp:${phone}`);

    if (!storedOtp || storedOtp !== otp) {
      return res.status(401).json({ error: 'Invalid or expired OTP' });
    }

    // Delete OTP immediately after successful use — single-use only
    await redis.del(`otp:${phone}`);

    // upsert: if phone exists → fetch user, if not → create new user
    // This is how "registration" works — there's no separate register endpoint.
    const user = await prisma.user.upsert({
      where:  { phone },
      create: { phone, phoneVerified: true },
      update: { phoneVerified: true },
    });

    // Sign a JWT containing userId and phone
    // The token is valid for 30 days (or whatever JWT_EXPIRES_IN is set to)
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
