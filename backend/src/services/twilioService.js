// services/twilioService.js
//
// Wraps the Twilio Proxy API for masked phone calls.
//
// What is Twilio Proxy?
//   Twilio Proxy lets two people call each other through temporary "proxy numbers".
//   Neither party sees the other's real phone number — they each get a Twilio number
//   that forwards to the other person. This protects user privacy.
//
// How a session works:
//   1. Backend creates a Session in Twilio's Proxy Service
//   2. Adds both participants (donor phone + requester phone)
//   3. Twilio returns a proxy number for each participant
//   4. Donor calls their proxy number → Twilio connects them to the requester
//   5. Requester calls their proxy number → connects to donor
//   6. Session auto-expires after 2 hours (ttl: 7200)
//
// Setup:
//   1. Sign up at twilio.com
//   2. Create a Proxy Service in the console
//   3. Add phone numbers to the proxy pool (Twilio recommends at least 2)
//   4. Copy TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PROXY_SERVICE_SID to .env

const twilio = require('twilio');

// Lazy initialization — Twilio client is only created when first needed.
// This avoids crashes at startup if Twilio credentials aren't set (e.g. local dev).
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
  const service = getClient().proxy.v1.services(process.env.TWILIO_PROXY_SERVICE_SID);

  // Create the session — uniqueName prevents duplicate sessions for the same pair
  const session = await service.sessions.create({
    uniqueName: `session_${Date.now()}`,
    ttl:        7200, // auto-expires after 2 hours
  });

  // Add both participants — Twilio assigns each a proxy number from the pool
  await session.participants().create({ identifier: donorPhone });
  await session.participants().create({ identifier: requesterPhone });

  return session.sid;
}

// Ends a Proxy session (call it when donor completes the donation or request expires).
// After this, calls to the proxy numbers will no longer connect.
async function endProxySession(sessionSid) {
  const service = getClient().proxy.v1.services(process.env.TWILIO_PROXY_SERVICE_SID);
  await service.sessions(sessionSid).remove();
}

// Fetches the proxy numbers for both participants in a session.
// Returns: { donorProxyNumber, requesterProxyNumber }
// Used by the /call/initiate route to show each party their proxy number.
async function getProxyNumbers(sessionSid) {
  const service      = getClient().proxy.v1.services(process.env.TWILIO_PROXY_SERVICE_SID);
  const participants = await service.sessions(sessionSid).participants.list();

  // Participants are stored in order: donor first, requester second
  return {
    donorProxyNumber:     participants[0]?.proxyIdentifier || null,
    requesterProxyNumber: participants[1]?.proxyIdentifier || null,
  };
}

module.exports = { createProxySession, endProxySession, getProxyNumbers };
