// workers/escalationWorker.js
//
// Bull queue worker for the caregiver escalation system.
//
// What is Bull?
//   Bull is a Redis-backed job queue. You add jobs with a delay, and
//   this worker "processes" them when the delay expires. Think of it
//   like a reliable setTimeout that survives server restarts.
//
// Escalation timeline:
//   T+0  : Blood request created → 5km radius, notify nearby donors
//   T+15m: Level 1 job fires → expand to 15km, notify more donors
//   T+30m: Level 2 job fires → SMS all caregivers ("no donor found yet")
//
// If a donor accepts before T+15m, both jobs are removed via cancelEscalation()
// in requests.js — so they never fire.
//
// This module is imported and started in server.js.

const Queue      = require('bull');
const prisma     = require('../config/prisma');
const fcmService = require('../services/fcmService');
const smsService = require('../services/smsService');
const geoService = require('../services/geoService');

// Create the queue — same name and Redis config as in requests.js
// Bull uses the queue name as the Redis key prefix, so the name must match exactly.
const escalationQueue = new Queue('escalation', {
  redis: process.env.REDIS_URL || 'redis://localhost:6379',
});

function startEscalationWorker() {
  escalationQueue.process(async (job) => {
    const { requestId, level } = job.data;

    console.log(`[EscalationWorker] Processing level ${level} for request ${requestId}`);

    // Fetch the request with requester + caregivers
    const request = await prisma.bloodRequest.findUnique({
      where:   { id: requestId },
      include: {
        requester: {
          include: {
            caregivers: { orderBy: { priority: 'asc' } }, // notify in priority order
          },
        },
      },
    });

    if (!request) {
      console.log(`[EscalationWorker] Request ${requestId} not found — skipping`);
      return;
    }

    // If a donor already accepted, skip escalation entirely
    if (request.status !== 'OPEN') {
      console.log(`[EscalationWorker] Request ${requestId} is ${request.status} — skipping escalation`);
      return;
    }

    // ─── Level 1: Expand radius to 15km ─────────────────────────────────────
    if (level === 1) {
      const donors = await geoService.findNearbyDonors({
        lat:       request.latitude,
        lng:       request.longitude,
        bloodGroup: request.bloodGroup,
        radiusKm:  15,  // expanded from initial 5km
      });

      if (donors.length > 0) {
        // Add new DonorResponse rows for newly found donors (skip already-notified ones)
        await prisma.donorResponse.createMany({
          data: donors.map((donor) => ({
            requestId: request.id,
            donorId:   donor.id,
          })),
          skipDuplicates: true,
        });

        await fcmService.sendToMany(
          donors.map((d) => d.fcmToken),
          {
            title: `Still needed: ${request.bloodGroup.replace('_', ' ')} blood`,
            body:  `${request.hospitalName} still needs a donor. You are within 15km.`,
            data:  { requestId: request.id, screen: 'RequestDetail' },
          }
        );
      }

      await prisma.bloodRequest.update({
        where: { id: requestId },
        data:  { escalationLevel: 1, escalatedAt: new Date() },
      });

      console.log(`[EscalationWorker] Level 1: notified ${donors.length} donors in 15km radius`);
    }

    // ─── Level 2: SMS all caregivers ─────────────────────────────────────────
    if (level === 2) {
      const caregivers = request.requester.caregivers;

      if (caregivers.length === 0) {
        console.log(`[EscalationWorker] Level 2: no caregivers registered for user ${request.requesterId}`);
      }

      for (const cg of caregivers) {
        const message =
          `URGENT: ${request.requester.name || 'Someone you know'} needs ` +
          `${request.bloodGroup.replace('_', ' ')} blood at ${request.hospitalName}. ` +
          `No donor has been found in 30 minutes. Please help or spread the word.`;

        await smsService.send(cg.phone, message);
        console.log(`[EscalationWorker] Level 2: SMS sent to caregiver ${cg.name}`);
      }

      await prisma.bloodRequest.update({
        where: { id: requestId },
        data:  { escalationLevel: 2, escalatedAt: new Date() },
      });
    }
  });

  // Log queue errors so they don't silently fail
  escalationQueue.on('failed', (job, err) => {
    console.error(`[EscalationWorker] Job ${job.id} failed:`, err.message);
  });

  console.log('[EscalationWorker] Ready — listening for escalation jobs');
}

module.exports = { startEscalationWorker, escalationQueue };
