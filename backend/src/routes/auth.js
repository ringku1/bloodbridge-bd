// routes/auth.js
//
// Email + password authentication.
//
// Flow:
//   POST /signup            → create account, return JWT (email not yet verified)
//   POST /login             → verify password, return JWT
//   POST /send-email-otp    → email a 6-digit code for verify | change_email | change_password
//   POST /verify-email-otp  → consume the code; flip emailVerified or apply the requested change
//   POST /forgot-password   → email a reset link (always 200 — never leak which emails exist)
//   POST /reset-password    → consume the reset token, set new password
//
// Redis keys:
//   email_otp:<userId>:<purpose>  → 6-digit code, 10 min TTL
//   pwd_reset:<token>             → userId, 30 min TTL
//   forgot_attempts:<email>       → counter, 1 hour TTL (3 forgot-password requests/hour/email)

const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const prisma  = require('../config/prisma');
const redis   = require('../config/redis');
const emailService   = require('../services/emailService');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const EMAIL_REGEX     = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_PURPOSES  = ['verify', 'change_email', 'change_password'];
const VALID_BLOOD     = ['A_POS','A_NEG','B_POS','B_NEG','O_POS','O_NEG','AB_POS','AB_NEG'];

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function publicUser(u) {
  return {
    id:             u.id,
    email:          u.email,
    emailVerified:  u.emailVerified,
    phone:          u.phone,
    name:           u.name,
    bloodGroup:     u.bloodGroup,
    verifiedStatus: u.verifiedStatus,
    isAvailable:    u.isAvailable,
    district:       u.district,
  };
}

function signJwt(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
}

// ─── POST /api/auth/signup ────────────────────────────────────────────────────
// Body: { email, password, name, bloodGroup }
router.post('/signup', async (req, res, next) => {
  try {
    const { email, password, name, bloodGroup } = req.body;

    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (bloodGroup && !VALID_BLOOD.includes(bloodGroup)) {
      return res.status(400).json({ error: 'Invalid blood group' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email:        normalizedEmail,
        passwordHash,
        name:         name?.trim() || null,
        bloodGroup:   bloodGroup || null,
      },
    });

    res.status(201).json({ token: signJwt(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
// Body: { email, password }
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    res.json({ token: signJwt(user), user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/send-email-otp ────────────────────────────────────────────
// Auth required. Body: { purpose }
router.post('/send-email-otp', authMiddleware, async (req, res, next) => {
  try {
    const { purpose } = req.body;

    if (!VALID_PURPOSES.includes(purpose)) {
      return res.status(400).json({ error: `purpose must be one of: ${VALID_PURPOSES.join(', ')}` });
    }

    const code = generateOtp();
    await redis.setex(`email_otp:${req.user.id}:${purpose}`, 600, code);
    await emailService.sendOtp(req.user.email, code, purpose);

    res.json({ message: 'OTP sent to your email' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/verify-email-otp ──────────────────────────────────────────
// Auth required. Body: { purpose, code, newEmail?, newPassword? }
router.post('/verify-email-otp', authMiddleware, async (req, res, next) => {
  try {
    const { purpose, code, newEmail, newPassword } = req.body;

    if (!VALID_PURPOSES.includes(purpose)) {
      return res.status(400).json({ error: `purpose must be one of: ${VALID_PURPOSES.join(', ')}` });
    }
    if (!code) {
      return res.status(400).json({ error: 'code is required' });
    }

    const key    = `email_otp:${req.user.id}:${purpose}`;
    const stored = await redis.get(key);

    if (!stored || stored !== code) {
      return res.status(401).json({ error: 'Invalid or expired code' });
    }
    await redis.del(key);

    const updates = {};

    if (purpose === 'verify') {
      updates.emailVerified = true;
    } else if (purpose === 'change_email') {
      if (!newEmail || !EMAIL_REGEX.test(newEmail)) {
        return res.status(400).json({ error: 'Valid newEmail is required' });
      }
      const normalized = newEmail.toLowerCase().trim();
      const dup = await prisma.user.findUnique({ where: { email: normalized } });
      if (dup && dup.id !== req.user.id) {
        return res.status(409).json({ error: 'That email is already in use' });
      }
      // OTP was sent to the OLD mailbox, so the NEW one isn't yet proven.
      // User must trigger a separate `verify` flow on the new address.
      updates.email = normalized;
      updates.emailVerified = false;
    } else if (purpose === 'change_password') {
      if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ error: 'newPassword must be at least 8 characters' });
      }
      updates.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: updates,
    });

    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/forgot-password ───────────────────────────────────────────
// Body: { email }
// Always returns 200 so attackers can't learn whether an email exists.
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email || !EMAIL_REGEX.test(email)) {
      return res.json({ message: 'If that email exists, a reset link has been sent.' });
    }

    const normalized = email.toLowerCase().trim();

    // Per-email rate limit: 3 requests / hour
    const attemptsKey = `forgot_attempts:${normalized}`;
    const attempts    = parseInt(await redis.get(attemptsKey) || '0', 10);
    if (attempts >= 3) {
      return res.json({ message: 'If that email exists, a reset link has been sent.' });
    }
    await redis.setex(attemptsKey, 3600, attempts + 1);

    const user = await prisma.user.findUnique({ where: { email: normalized } });
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      await redis.setex(`pwd_reset:${token}`, 1800, user.id);
      const link = `${process.env.FRONTEND_RESET_URL || 'https://blood-bridge-admin.vercel.app/reset'}?token=${token}`;
      await emailService.sendPasswordReset(user.email, link);
    }

    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/reset-password ────────────────────────────────────────────
// Body: { token, newPassword }
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'token and newPassword (8+ chars) required' });
    }

    const key    = `pwd_reset:${token}`;
    const userId = await redis.get(key);
    if (!userId) {
      return res.status(401).json({ error: 'Reset link is invalid or has expired' });
    }
    await redis.del(key);

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    res.json({ message: 'Password reset. You can now log in with your new password.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
