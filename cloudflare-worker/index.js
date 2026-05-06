// cloudflare-worker/index.js
//
// Cloudflare Worker that triggers Blood Bridge cron endpoints on a schedule.
// Free tier: 100,000 requests/day, no credit card required.
//
// Cron schedules (defined in wrangler.toml):
//   * * * * *      → every minute      → POST /api/cron/escalate
//   */15 * * * *   → every 15 minutes  → POST /api/cron/expiry
//   0 0 * * *      → daily 00:00 UTC   → POST /api/cron/eligibility
//                    (= 06:00 AM Bangladesh Standard Time, UTC+6)
//
// Environment variables (set in Cloudflare dashboard):
//   API_BASE_URL  — your Vercel API URL, e.g. https://your-api.vercel.app
//   CRON_SECRET   — must match CRON_SECRET set in Vercel environment variables

export default {
  async scheduled(event, env, ctx) {
    const { API_BASE_URL, CRON_SECRET } = env;

    if (!API_BASE_URL || !CRON_SECRET) {
      console.error('[CronWorker] Missing API_BASE_URL or CRON_SECRET — check Worker environment variables');
      return;
    }

    const headers = {
      'Content-Type': 'application/json',
      'x-cron-secret': CRON_SECRET,
    };

    let endpoint;

    switch (event.cron) {
      case '0 0 * * *':
        endpoint = '/api/cron/eligibility';
        break;
      case '*/15 * * * *':
        endpoint = '/api/cron/expiry';
        break;
      default:
        // Every-minute schedule → escalation check
        endpoint = '/api/cron/escalate';
    }

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method:  'POST',
        headers,
      });

      const body = await response.json().catch(() => ({}));
      console.log(`[CronWorker] ${endpoint} → HTTP ${response.status}`, JSON.stringify(body));

      if (!response.ok) {
        console.error(`[CronWorker] ${endpoint} returned non-2xx status ${response.status}`);
      }
    } catch (err) {
      console.error(`[CronWorker] ${endpoint} fetch failed:`, err.message);
    }
  },
};
