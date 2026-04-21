// hooks/usePushNotifications.js
//
// Registers the device for push notifications and sends the token to the backend.
//
// How push notifications work on mobile:
//   1. Device registers with Firebase (Android) or APNs (iOS) → gets a unique device token
//   2. We send that token to our backend: PUT /api/donors/fcm-token
//   3. Backend stores the token in User.fcmToken
//   4. When a blood request is created, backend uses Firebase Admin to push to all nearby tokens
//
// This hook is called once from App.js on startup.
// The token changes when the app is reinstalled, so we re-register every time.

import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';

// Configure how notifications behave when the app is in the FOREGROUND
// (by default, foreground notifications are silent — this makes them show a banner)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  false,
  }),
});

export function usePushNotifications() {
  const token = useAuthStore((state) => state.token);

  useEffect(() => {
    // Only register when the user is logged in
    if (!token) return;
    registerForPushNotifications();
  }, [token]);
}

async function registerForPushNotifications() {
  try {
    // On Android, a notification channel must be created first
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name:       'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    // Ask the user for permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[Push] Permission not granted — notifications will not work');
      return;
    }

    // getDevicePushTokenAsync returns the native FCM token (Android) or APNs token (iOS)
    // This is what our backend's Firebase Admin SDK uses to send messages.
    const tokenData = await Notifications.getDevicePushTokenAsync();
    const fcmToken  = tokenData.data;

    // Send to backend — this updates User.fcmToken in the database
    await api.put('/donors/fcm-token', { fcmToken });
    console.log('[Push] FCM token registered');
  } catch (err) {
    // Non-critical — donor just won't receive push notifications
    console.error('[Push] Registration failed:', err.message);
  }
}
