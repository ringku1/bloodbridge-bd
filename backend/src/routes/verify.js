// routes/verify.js
//
// NID (National ID) photo verification flow:
//
//   Step 1 — GET  /api/verify/upload-url
//     Backend generates an S3 presigned PUT URL (10 min expiry).
//     Mobile app uses this URL to upload the NID photo directly to S3.
//
//   Step 2 — POST /api/verify/submit  { s3Key }
//     After upload, mobile app sends the S3 key (file path) to the backend.
//     Backend saves the key and sets verifiedStatus = PENDING.
//
//   Step 3 — GET  /api/verify/status
//     Mobile app polls this to show the user their verification status.
//
//   Step 4 (admin) — PUT /api/verify/admin/:userId  { status: "VERIFIED" | "UNVERIFIED" }
//     Admin reviews the NID photo and approves or rejects.
//     Protected by x-admin-secret header.

const express        = require('express');
const multer         = require('multer');
const prisma         = require('../config/prisma');
const s3Service      = require('../services/s3Service');
const fcmService     = require('../services/fcmService');
const authMiddleware = require('../middleware/auth');
const adminAuth      = require('../middleware/adminAuth');

// Memory storage — file buffer lives in req.file.buffer; nothing written to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

const router = express.Router();

// ─── GET /api/verify/upload-url ───────────────────────────────────────────────
// Returns a presigned S3 URL for uploading the NID photo.
router.get('/upload-url', authMiddleware, async (req, res, next) => {
  try {
    const { uploadUrl, s3Key } = await s3Service.generateUploadUrl(req.user.id);

    res.json({
      uploadUrl, // mobile app PUTs the file to this URL
      s3Key,     // mobile app sends this back in /submit
      expiresIn: '10 minutes',
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/verify/upload ──────────────────────────────────────────────────
// Receives the NID photo as multipart/form-data (field name: "photo") and
// uploads it to S3-compatible storage from the backend. Avoids React Native
// blob issues with presigned PUT URLs on some devices.
// Returns: { s3Key }
router.post('/upload', authMiddleware, upload.single('photo'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image provided' });
    }
    const { s3Key } = await s3Service.uploadBuffer(
      req.user.id,
      req.file.buffer,
      req.file.mimetype,
    );
    res.json({ s3Key });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/verify/submit ──────────────────────────────────────────────────
// Body: { s3Key }
// Called after the mobile app has successfully uploaded the photo to S3.
router.post('/submit', authMiddleware, async (req, res, next) => {
  try {
    const { s3Key } = req.body;

    if (!s3Key) {
      return res.status(400).json({ error: 's3Key is required' });
    }

    // Validate the key belongs to this user (prevent tampering with other users' keys)
    if (!s3Key.startsWith(`nid-photos/${req.user.id}/`)) {
      return res.status(403).json({ error: 'Invalid s3Key for this user' });
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        nidPhotoUrl:    s3Key,
        verifiedStatus: 'PENDING',
      },
    });

    res.json({
      message:        'NID photo submitted for review. Verification typically takes 1–2 business days.',
      verifiedStatus: 'PENDING',
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/verify/status ───────────────────────────────────────────────────
// Returns the current verification status for the logged-in user.
router.get('/status', authMiddleware, async (req, res, next) => {
  try {
    const { verifiedStatus, nidPhotoUrl } = req.user;

    const messages = {
      UNVERIFIED: 'You have not submitted your NID photo yet.',
      PENDING:    'Your NID photo is under review.',
      VERIFIED:   'You are a verified donor. You appear in search results.',
    };

    res.json({
      verifiedStatus,
      hasSubmittedNid: !!nidPhotoUrl,
      message:         messages[verifiedStatus],
    });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/verify/admin/:userId ────────────────────────────────────────────
// Admin endpoint — update a user's verification status.
// Protected by x-admin-secret header (see middleware/adminAuth.js).
//
// Body: { status: "VERIFIED" | "UNVERIFIED" | "PENDING" }
//
// Usage (Postman):
//   PUT http://localhost:3000/api/verify/admin/<userId>
//   Headers: x-admin-secret: <ADMIN_SECRET from .env>
//   Body: { "status": "VERIFIED" }
router.put('/admin/:userId', adminAuth, async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ['UNVERIFIED', 'PENDING', 'VERIFIED'];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        error: `status must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const user = await prisma.user.update({
      where: { id: req.params.userId },
      data:  { verifiedStatus: status },
      select: {
        id:             true,
        name:           true,
        phone:          true,
        fcmToken:       true,
        verifiedStatus: true,
        nidPhotoUrl:    true,
      },
    });

    // Notify the donor so the app updates without requiring a manual refresh
    if (user.fcmToken) {
      const messages = {
        VERIFIED:   { title: '✅ Identity Verified!', body: 'Your NID has been approved. You now appear in blood request search results.' },
        UNVERIFIED: { title: 'Verification Rejected', body: 'Your NID photo could not be verified. Please re-upload a clearer photo.' },
        PENDING:    null,
      };
      const msg = messages[status];
      if (msg) await fcmService.send(user.fcmToken, msg).catch(() => {});
    }

    let nidPhotoViewUrl = null;
    if (user.nidPhotoUrl) {
      nidPhotoViewUrl = await s3Service.generateViewUrl(user.nidPhotoUrl);
    }

    res.json({
      message:        `User verification status updated to ${status}`,
      user,
      nidPhotoViewUrl,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/verify/admin/pending ───────────────────────────────────────────
// Admin endpoint — list all users with PENDING verification status.
// Useful for reviewing NID photos in batch.
router.get('/admin/pending', adminAuth, async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { verifiedStatus: 'PENDING' },
      select: {
        id:          true,
        name:        true,
        nidPhotoUrl: true,
        createdAt:   true,
      },
      orderBy: { createdAt: 'asc' }, // oldest submissions first (FIFO review)
    });

    // Generate view URLs for each photo (15-min presigned)
    const usersWithUrls = await Promise.all(
      users.map(async (u) => ({
        ...u,
        nidPhotoViewUrl: u.nidPhotoUrl
          ? await s3Service.generateViewUrl(u.nidPhotoUrl)
          : null,
      }))
    );

    res.json({ count: users.length, users: usersWithUrls });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
