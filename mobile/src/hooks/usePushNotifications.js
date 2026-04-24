// hooks/usePushNotifications.js
//
// Registers the device for push notifications and handles notification taps.
//
// Two responsibilities:
//   1. Registration — get the FCM/APNs device token and save it to the backend
//   2. Tap handling — when a donor taps a blood request notification, navigate
//      to DonorRequestScreen so they can accept it
//
// Notification data shape (sent by backend when a blood request is created):
//   { requestId: "...", screen: "RequestDetail" }

import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { navigate } from '../navigation/RootNavigation';

// Show notification banners even when the app is in the foreground
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
    if (!token) return;

    // Register device token with the backend
    registerForPushNotifications();

    // Handle taps on notifications (app backgrounded or killed)
    const tapSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.requestId) {
        navigate('DonorRequest', { requestId: data.requestId });
      }
    });

    return () => tapSubscription.remove();
  }, [token]);
}

async function registerForPushNotifications() {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name:             'default',
        importance:       Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

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

    const tokenData = await Notifications.getDevicePushTokenAsync();
    await api.put('/donors/fcm-token', { fcmToken: tokenData.data });
    console.log('[Push] FCM token registered');
  } catch (err) {
    console.error('[Push] Registration failed:', err.message);
  }
}
