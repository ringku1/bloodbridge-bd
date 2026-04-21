// workers/eligibilityWorker.js
//
// Daily cron job that resets donor eligibility after 120 days.
//
// How it works:
//   Runs at 6:00 AM every day (Bangladesh Standard Time = UTC+6, so 6AM BST = 0:00 UTC).
//   Finds all donors where:
//     - isAvailable is false (they are locked after a donation)
//     - eligibleAgainAt <= now (their 120 days are up)
//   Updates them to isAvailable = true and sends a push notification.
//
// Cron syntax:  "0 6 * * *"
//   minute=0, hour=6, day=*, month=*, weekday=*  → runs at 06:00 every day
//
// Why 6:00 AM?
//   Most people check their phones early. Notifying at 6AM means donors see
//   "You can donate again!" right when they start their day.
//
// This module is imported and started in server.js, NOT run standalone.

const cron       = require('node-cron');
const prisma     = require('../config/prisma');
const fcmService = require('../services/fcmService');

function startEligibilityWorker() {
  // '0 0 * * *' = midnight UTC = 6:00 AM Bangladesh Standard Time (UTC+6)
  cron.schedule('0 0 * * *', async () => {
    console.log('[EligibilityWorker] Running daily eligibility reset...');

    try {
      // Step 1: find all donors whose wait period has ended
      const donors = await prisma.user.findMany({
        where: {
          isAvailable:    false,
          eligibleAgainAt: { lte: new Date() },
        },
        select: {
          id:       true,
          fcmToken: true,
          name:     true,
        },
      });

      if (donors.length === 0) {
        console.log('[EligibilityWorker] No donors to reset today.');
        return;
      }

      // Step 2: flip all of them to available in one batch query
      await prisma.user.updateMany({
        where: { id: { in: donors.map((d) => d.id) } },
        data:  { isAvailable: true },
      });

      console.log(`[EligibilityWorker] Reset ${donors.length} donor(s) to available.`);

      // Step 3: send a push notification to each donor
      // Done individually (not sendToMany) so each gets a personalized message
      for (const donor of donors) {
        if (donor.fcmToken) {
          await fcmService.send(donor.fcmToken, {
            title: 'You can donate again!',
            body:  'Your 120-day wait is over. You are now eligible to donate blood. Open the app to mark yourself available.',
            data:  { screen: 'Home' },
          });
        }
      }
    } catch (err) {
      console.error('[EligibilityWorker] Error during reset:', err.message);
    }
  });

  console.log('[EligibilityWorker] Scheduled — runs daily at 06:00 AM BST (00:00 UTC)');
}

module.exports = { startEligibilityWorker };
