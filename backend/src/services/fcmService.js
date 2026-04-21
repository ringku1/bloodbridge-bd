// services/fcmService.js
//
// Wraps Firebase Admin SDK for sending push notifications.
//
// How FCM works:
//   1. Mobile app registers with Firebase and gets a unique device token (fcmToken)
//   2. App saves that token to our backend via PUT /api/donors/fcm-token
//   3. Backend calls firebase-admin to push a notification to that specific token
//
// Why firebase-admin (server SDK)?
//   The mobile app uses the Firebase client SDK. The server uses firebase-admin,
//   which authenticates with a service account and can send messages to any device.
//
// Setup:
//   1. Go to Firebase Console → Project Settings → Service Accounts
//   2. Generate a new private key → download JSON
//   3. Copy FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL to .env

const admin = require('firebase-admin');

// Check if real Firebase credentials are provided.
// The placeholder value in .env.example contains "your_key_here" — detect that.
const hasFirebaseCreds =
  process.env.FIREBASE_PROJECT_ID &&
  process.env.FIREBASE_PRIVATE_KEY &&
  !process.env.FIREBASE_PRIVATE_KEY.includes('your_key_here');

// Only initialize Firebase if real credentials are present.
// In development (USE_MOCK_FCM or missing creds), we skip init and log instead.
// This prevents the "Invalid PEM" crash at startup when credentials aren't set yet.
if (hasFirebaseCreds && !admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), // .env escapes \n
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  });
} else if (!hasFirebaseCreds) {
  console.log('[FCM] No credentials found — running in mock mode (notifications logged to console)');
}

// Send a push notification to a single device token
async function send(fcmToken, { title, body, data = {} }) {
  if (!fcmToken) return;

  // Mock mode: log instead of sending a real push notification
  if (!hasFirebaseCreds) {
    console.log(`[FCM MOCK] To: ${fcmToken.slice(0, 20)}... | Title: ${title} | Body: ${body}`);
    return;
  }

  try {
    await admin.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data,
      android: {
        priority: 'high', // ensures delivery even when phone is in Doze mode
      },
      apns: {
        payload: {
          aps: { sound: 'default' },
        },
      },
    });
  } catch (err) {
    // Don't let a failed push crash the request flow.
    // Invalid/expired tokens are common (user uninstalled app).
    console.error(`[FCM] Failed to send to token ${fcmToken?.slice(0, 20)}...:`, err.message);
  }
}

// Send to multiple devices (used when notifying nearby donors)
async function sendToMany(fcmTokens, notification) {
  // Filter out nulls/undefined before sending
  const validTokens = fcmTokens.filter(Boolean);
  if (validTokens.length === 0) return;

  // Send all in parallel — Promise.allSettled won't stop on individual failures
  await Promise.allSettled(validTokens.map((token) => send(token, notification)));
}

module.exports = { send, sendToMany };
