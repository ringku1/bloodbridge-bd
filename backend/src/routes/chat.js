// routes/chat.js
//
// Temporary in-chat between a donor and requester after a match.
//
// Messages are stored in Redis as a list with a 1-hour TTL.
// No database writes — Redis handles expiry automatically.
// Mobile polls GET every 4 seconds; ?since=N fetches only new messages.
//
// Redis key: chat:{requestId}
//   Type : List of JSON strings
//   TTL  : 3600 seconds (set only on the first message — stays fixed)

const express        = require('express');
const { v4: uuidv4 } = require('uuid');
const prisma         = require('../config/prisma');
const redis          = require('../config/redis');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const CHAT_TTL = 60 * 60; // 1 hour in seconds

// Verify the caller is the donor or requester on the accepted DonorResponse
async function verifyParticipant(requestId, userId) {
  const response = await prisma.donorResponse.findFirst({
    where:   { requestId, status: 'ACCEPTED' },
    include: { request: { select: { requesterId: true } } },
  });
  if (!response) return null;
  const isInvolved = userId === response.donorId || userId === response.request.requesterId;
  return isInvolved ? response : null;
}

// ─── POST /api/chat/:requestId ────────────────────────────────────────────────
// Body: { text }
// Appends a message to the Redis list. Sets a 1-hour TTL on the first message.
router.post('/:requestId', async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const { text }      = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Message text is required.' });
    }
    if (text.trim().length > 500) {
      return res.status(400).json({ error: 'Message too long (max 500 characters).' });
    }

    const participation = await verifyParticipant(requestId, req.user.id);
    if (!participation) {
      return res.status(403).json({ error: 'You are not a participant in this blood request.' });
    }

    const key   = `chat:${requestId}`;
    const isNew = (await redis.exists(key)) === 0;

    const message = {
      id:         uuidv4(),
      senderId:   req.user.id,
      senderName: req.user.name || 'Unknown',
      text:       text.trim(),
      sentAt:     new Date().toISOString(),
    };

    await redis.rpush(key, JSON.stringify(message));

    // Only set TTL on the very first message so expiry is anchored to chat start
    if (isNew) await redis.expire(key, CHAT_TTL);

    const ttl = await redis.ttl(key);

    res.status(201).json({
      message,
      expiresAt:  new Date(Date.now() + ttl * 1000).toISOString(),
      ttlSeconds: ttl,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/chat/:requestId?since=N ─────────────────────────────────────────
// Returns messages starting at list index N (0-based).
// Pass the current `total` back as `since` on the next poll to get only new messages.
router.get('/:requestId', async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const since         = Math.max(0, parseInt(req.query.since, 10) || 0);

    const participation = await verifyParticipant(requestId, req.user.id);
    if (!participation) {
      return res.status(403).json({ error: 'You are not a participant in this blood request.' });
    }

    const key = `chat:${requestId}`;
    const ttl = await redis.ttl(key);

    // ttl === -2 means the Redis key does not exist. That is true in two cases:
    //   1) no one has sent the first message yet → chat is fresh, NOT expired
    //   2) the 1-hour TTL already ran out and Redis deleted the key
    // We can't distinguish those from Redis alone, so we default to "not expired"
    // and let the empty-state UI handle case (1). Real expiry is detected by
    // the mobile when ttlSeconds drops to 0 on subsequent polls.
    if (ttl === -2) {
      return res.json({ messages: [], total: 0, expiresAt: null, ttlSeconds: null, expired: false });
    }

    const total       = await redis.llen(key);
    const rawMessages = since < total ? await redis.lrange(key, since, -1) : [];
    const messages    = rawMessages.map((m) => {
      try {
        return JSON.parse(m);
      } catch (e) {
        console.error('[Chat] Corrupted Redis message, skipping:', e.message);
        return null;
      }
    }).filter(Boolean);

    res.json({
      messages,
      total,
      expiresAt:  new Date(Date.now() + ttl * 1000).toISOString(),
      ttlSeconds: ttl,
      expired:    false,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
