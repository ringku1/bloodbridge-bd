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

// Initialize Firebase Admin once — calling initializeApp() multiple times throws an error.
// The || check prevents re-initialization if this module is somehow required twice.
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'), // .env escapes \n
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  });
}

// Send a push notification to a single device token
async function send(fcmToken, { title, body, data = {} }) {
  if (!fcmToken) return; // donor hasn't registered their device yet

  try {
    await admin.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data, // optional key-value pairs (e.g. requestId so the app can deep-link)
      android: {
        priority: 'high', // ensures delivery even when phone is in Doze mode
      },
      apns: {
        payload: {
          aps: { sound: 'default' }, // iOS plays notification sound
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
