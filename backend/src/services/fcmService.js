// services/fcmService.js
//
// Sends push notifications via Expo Push Notification Service.
//
// How it works:
//   1. Mobile app calls Notifications.getExpoPushTokenAsync() → gets an
//      ExponentPushToken[...] string unique to the device + app
//   2. App saves that token via PUT /api/donors/fcm-token
//   3. Backend POSTs to https://exp.host/--/api/v2/push/send with the token
//   4. Expo's servers forward to Apple APNs or Google FCM on our behalf
//
// Why Expo Push instead of Firebase directly?
//   - Zero credentials required on the server — no service account JSON
//   - Works for both iOS and Android through one API
//   - Free with no limits for normal usage
//
// Mock mode: if the token is not a valid Expo push token (e.g. old FCM token
// still in the DB, or a test token), the notification is logged instead of sent.

const { Expo } = require('expo-server-sdk');

const expo = new Expo();

// Send a push notification to a single Expo push token
async function send(pushToken, { title, body, data = {} }) {
  if (!pushToken) return;

  if (!Expo.isExpoPushToken(pushToken)) {
    console.log(`[PUSH MOCK] To: ${String(pushToken).slice(0, 20)}... | Title: ${title} | Body: ${body}`);
    return;
  }

  try {
    const tickets = await expo.sendPushNotificationsAsync([{
      to:       pushToken,
      title,
      body,
      data,
      sound:    'default',
      priority: 'high',
    }]);

    for (const ticket of tickets) {
      if (ticket.status === 'error') {
        console.error(`[Push] Delivery error: ${ticket.message}`);
      }
    }
  } catch (err) {
    // Don't let a failed push crash the request flow.
    console.error(`[Push] Failed to send:`, err.message);
  }
}

// Send to multiple devices (used when notifying nearby donors)
async function sendToMany(pushTokens, notification) {
  const validTokens = pushTokens.filter(Boolean);
  if (validTokens.length === 0) return;

  // sendPushNotificationsAsync accepts up to 100 messages at once.
  // chunkPushNotifications splits larger arrays automatically.
  const messages = validTokens
    .filter(Expo.isExpoPushToken)
    .map((to) => ({
      to,
      title:    notification.title,
      body:     notification.body,
      data:     notification.data || {},
      sound:    'default',
      priority: 'high',
    }));

  const mocked = validTokens.filter((t) => !Expo.isExpoPushToken(t));
  for (const token of mocked) {
    console.log(`[PUSH MOCK] To: ${String(token).slice(0, 20)}... | Title: ${notification.title}`);
  }

  if (messages.length === 0) return;

  const chunks = expo.chunkPushNotifications(messages);
  await Promise.allSettled(
    chunks.map((chunk) => expo.sendPushNotificationsAsync(chunk))
  );
}

module.exports = { send, sendToMany };
