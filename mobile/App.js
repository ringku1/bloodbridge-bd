// App.js
//
// Root of the React Native app.
//
// Navigation structure:
//
//   Not logged in:
//     AuthScreen  (phone + OTP login)
//
//   Logged in:
//     Bottom Tab Navigator
//       ├── Home tab      → HomeScreen
//       ├── Request tab   → Stack: RequestBloodScreen → ActiveRequestScreen
//       └── Profile tab   → Stack: DonorProfileScreen → VerificationScreen
//
// How conditional navigation works:
//   We read `token` from the Zustand authStore.
//   When token is null → show AuthScreen.
//   When token is set  → show the main tab navigator.
//   Zustand is reactive: any change to the store triggers a re-render here.

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';

import { useAuthStore } from './src/store/authStore';
import { usePushNotifications } from './src/hooks/usePushNotifications';
import { COLORS } from './src/config';

import AuthScreen           from './src/screens/AuthScreen';
import HomeScreen           from './src/screens/HomeScreen';
import DonorProfileScreen   from './src/screens/DonorProfileScreen';
import RequestBloodScreen   from './src/screens/RequestBloodScreen';
import ActiveRequestScreen  from './src/screens/ActiveRequestScreen';
import VerificationScreen   from './src/screens/VerificationScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

// ─── Profile tab stack ─────────────────────────────────────────────────────────
function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={stackOptions}>
      <Stack.Screen name="DonorProfile"  component={DonorProfileScreen}  options={{ title: 'My Profile' }} />
      <Stack.Screen name="Verification"  component={VerificationScreen}   options={{ title: 'Verify Identity' }} />
    </Stack.Navigator>
  );
}

// ─── Request tab stack ─────────────────────────────────────────────────────────
function RequestStack() {
  return (
    <Stack.Navigator screenOptions={stackOptions}>
      <Stack.Screen name="RequestBlood"   component={RequestBloodScreen}   options={{ title: 'Request Blood' }} />
      <Stack.Screen name="ActiveRequest"  component={ActiveRequestScreen}  options={{ title: 'My Requests' }} />
    </Stack.Navigator>
  );
}

// ─── Main tab navigator ────────────────────────────────────────────────────────
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown:     false,
        tabBarActiveTintColor:   COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle:     { borderTopColor: COLORS.border },
        // Simple emoji icons — replace with react-native-vector-icons if needed
        tabBarIcon: ({ color }) => {
          const icons = { Home: '🏠', Request: '🩸', Profile: '👤' };
          return <Text style={{ fontSize: 20 }}>{icons[route.name]}</Text>;
        },
      })}
    >
      <Tab.Screen name="Home"    component={HomeScreen}   options={{ headerShown: true, title: 'Blood Bridge', headerStyle: { backgroundColor: COLORS.primary }, headerTintColor: COLORS.white }} />
      <Tab.Screen name="Request" component={RequestStack} />
      <Tab.Screen name="Profile" component={ProfileStack} />
    </Tab.Navigator>
  );
}

// ─── Root component ────────────────────────────────────────────────────────────
export default function App() {
  const token = useAuthStore((state) => state.token);

  // Register device for push notifications whenever a user is logged in
  usePushNotifications();

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="auto" />
        {token ? <MainTabs /> : <AuthScreen />}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const stackOptions = {
  headerStyle:    { backgroundColor: COLORS.white },
  headerTintColor: COLORS.primary,
  headerTitleStyle: { fontWeight: '700' },
};
