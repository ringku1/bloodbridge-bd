// services/twilioService.js
//
// Wraps the Twilio Proxy API for masked phone calls.
//
// How Twilio Proxy works:
//   1. Backend creates a Session in Twilio's Proxy Service
//   2. Adds both participants (donor phone + requester phone)
//   3. Twilio returns a temporary proxy number for each participant
//   4. Donor calls their proxy number → Twilio connects them to the requester
//   5. Neither party ever sees the other's real number
//   6. Session auto-expires after 2 hours
//
// In development (TWILIO_ACCOUNT_SID not set):
//   Runs in mock mode — returns fake proxy numbers and logs to console.
//   No Twilio account needed to test the rest of the app flow.
//
// Setup for production:
//   1. Sign up at twilio.com
//   2. Create a Proxy Service → add phone numbers to the pool
//   3. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PROXY_SERVICE_SID in .env

const twilio = require('twilio');

const hasTwilioCreds =
  process.env.TWILIO_ACCOUNT_SID &&
  process.env.TWILIO_AUTH_TOKEN &&
  process.env.TWILIO_PROXY_SERVICE_SID;

if (!hasTwilioCreds) {
  console.log('[Twilio] No credentials found — running in mock mode (proxy numbers are fake)');
}

// Lazy initialization — client only created when first needed in production
let client;
function getClient() {
  if (!client) {
    client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return client;
}

// Creates a Proxy session for a donor-requester pair.
// Returns the session SID (stored in DonorResponse.proxySessionId).
async function createProxySession(donorPhone, requesterPhone) {
  if (!hasTwilioCreds) {
    const mockSid = `MOCK_SESSION_${Date.now()}`;
    console.log(`[Twilio MOCK] Proxy session created: ${mockSid}`);
    console.log(`[Twilio MOCK]   Donor     : ${donorPhone}`);
    console.log(`[Twilio MOCK]   Requester : ${requesterPhone}`);
    return mockSid;
  }

  const service = getClient().proxy.v1.services(process.env.TWILIO_PROXY_SERVICE_SID);
  const session = await service.sessions.create({
    uniqueName: `session_${Date.now()}`,
    ttl:        7200,
  });

  await session.participants().create({ identifier: donorPhone });
  await session.participants().create({ identifier: requesterPhone });

  return session.sid;
}

// Ends a Proxy session when the donation completes or the request expires.
async function endProxySession(sessionSid) {
  if (!hasTwilioCreds) {
    console.log(`[Twilio MOCK] Proxy session ended: ${sessionSid}`);
    return;
  }

  const service = getClient().proxy.v1.services(process.env.TWILIO_PROXY_SERVICE_SID);
  await service.sessions(sessionSid).remove();
}

// Returns the proxy numbers assigned to each participant.
// Used by /call/initiate to show each party what number to call.
async function getProxyNumbers(sessionSid) {
  if (!hasTwilioCreds) {
    const mockNumbers = {
      donorProxyNumber:     '+8800000000001',
      requesterProxyNumber: '+8800000000002',
    };
    console.log(`[Twilio MOCK] Proxy numbers for session ${sessionSid}:`, mockNumbers);
    return mockNumbers;
  }

  const service      = getClient().proxy.v1.services(process.env.TWILIO_PROXY_SERVICE_SID);
  const participants = await service.sessions(sessionSid).participants.list();

  return {
    donorProxyNumber:     participants[0]?.proxyIdentifier || null,
    requesterProxyNumber: participants[1]?.proxyIdentifier || null,
  };
}

module.exports = { createProxySession, endProxySession, getProxyNumbers };
