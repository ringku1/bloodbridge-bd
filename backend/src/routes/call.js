// routes/call.js
//
// Twilio Proxy masked calling endpoints.
//
// Endpoints:
//   POST   /api/call/initiate    — create a proxy session for a donor-requester pair
//   DELETE /api/call/:sessionId  — end an existing proxy session
//
// This is called after a donor accepts a request (POST /api/requests/:id/accept).
// The mobile app then calls /api/call/initiate to get the proxy numbers,
// and shows them to the user: "Call this number to reach the donor/requester."
//
// The proxy session SID is stored in DonorResponse.proxySessionId so we can
// end it later via DELETE /api/call/:sessionId.

const express          = require('express');
const prisma           = require('../config/prisma');
const twilioService    = require('../services/twilioService');
const authMiddleware   = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// ─── POST /api/call/initiate ──────────────────────────────────────────────────
// Body: { requestId }
//
// The caller can be either the donor or the requester — the app sends requestId
// and we figure out both parties from the DonorResponse record.
//
// Returns: { donorProxyNumber, requesterProxyNumber }
//   The mobile app shows the relevant number to the current user.
router.post('/initiate', async (req, res, next) => {
  try {
    const { requestId } = req.body;

    if (!requestId) {
      return res.status(400).json({ error: 'requestId is required' });
    }

    // Find the ACCEPTED DonorResponse for this request
    const response = await prisma.donorResponse.findFirst({
      where: {
        requestId,
        status: 'ACCEPTED',
      },
      include: {
        donor:   { select: { id: true, phone: true } },
        request: { include: { requester: { select: { id: true, phone: true } } } },
      },
    });

    if (!response) {
      return res.status(404).json({
        error: 'No accepted donor found for this request. A donor must accept before initiating a call.',
      });
    }

    // Verify the requester is either the donor or the requester of this blood request
    const isInvolved =
      req.user.id === response.donorId ||
      req.user.id === response.request.requesterId;

    if (!isInvolved) {
      return res.status(403).json({ error: 'You are not a participant in this blood request' });
    }

    // If a session already exists, return the existing proxy numbers
    if (response.proxySessionId) {
      const numbers = await twilioService.getProxyNumbers(response.proxySessionId);
      return res.json({
        sessionId: response.proxySessionId,
        ...numbers,
      });
    }

    // Create new Twilio Proxy session
    const sessionSid = await twilioService.createProxySession(
      response.donor.phone,
      response.request.requester.phone
    );

    // Save session SID to DonorResponse so we can end it later
    await prisma.donorResponse.update({
      where: { id: response.id },
      data:  { proxySessionId: sessionSid },
    });

    const numbers = await twilioService.getProxyNumbers(sessionSid);

    res.json({
      sessionId: sessionSid,
      ...numbers,
      // Remind both parties — neither number is real, both route through Twilio
      note: 'Call via these proxy numbers — your real phone numbers are never shared.',
    });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/call/:sessionId ─────────────────────────────────────────────
// Ends a Twilio Proxy session.
// Only the donor or the requester of the linked blood request can end it.
router.delete('/:sessionId', async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    const response = await prisma.donorResponse.findFirst({
      where:   { proxySessionId: sessionId },
      include: {
        request: { select: { requesterId: true } },
      },
    });

    if (!response) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Only the donor or the original requester can end the session
    const isParticipant =
      req.user.id === response.donorId ||
      req.user.id === response.request.requesterId;

    if (!isParticipant) {
      return res.status(403).json({ error: 'You are not a participant in this call session' });
    }

    await twilioService.endProxySession(sessionId);

    await prisma.donorResponse.update({
      where: { id: response.id },
      data:  { proxySessionId: null },
    });

    res.json({ message: 'Call session ended' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
