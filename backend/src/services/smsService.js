// services/smsService.js
//
// Thin wrapper around SMS sending.
//
// In development (USE_MOCK_SMS=true in .env):
//   Prints the OTP to the server console — no real SMS sent.
//   This avoids spending API credits while building features.
//
// In production (USE_MOCK_SMS=false):
//   Calls the SSL Wireless HTTP API — Bangladesh's most common SMS gateway.
//   SSL Wireless docs: https://developer.sslwireless.com/
//
// To switch to production: set USE_MOCK_SMS=false in .env and add real credentials.

const axios = require('axios');

// SSL Wireless API endpoint (confirm this with their latest documentation)
const SSL_WIRELESS_URL = 'https://sms.sslwireless.com/pushapi/dynamic/server.php';

async function send(phone, message) {
  if (process.env.USE_MOCK_SMS === 'true') {
    // ─── MOCK MODE ─────────────────────────────────────────────────────────
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[SMS MOCK]  To     :', phone);
    console.log('[SMS MOCK]  Message:', message);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return { success: true, mock: true };
  }

  // ─── PRODUCTION MODE ───────────────────────────────────────────────────────
  const response = await axios.get(SSL_WIRELESS_URL, {
    params: {
      api_token: process.env.SSL_WIRELESS_API_KEY,
      sid:       process.env.SSL_WIRELESS_SID,
      sms:       message,
      msisdn:    phone,
      // csmsid must be unique per message — used by SSL Wireless for deduplication
      csmsid:    `BB_${Date.now()}`,
    },
  });

  return response.data;
}

module.exports = { send };
