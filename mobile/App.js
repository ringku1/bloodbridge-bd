// App.js
//
// Root of the React Native app.
//
// Navigation structure:
//
//   Not logged in:
//     AuthScreen
//
//   Logged in (Root stack):
//     ├── MainTabs (bottom tab navigator)
//     │     ├── Home     → HomeScreen
//     │     ├── Request  → RequestBloodScreen → ActiveRequestScreen
//     │     ├── Donate   → DonorAcceptedScreen  (donor tracks accepted requests + call)
//     │     └── Profile  → DonorProfileScreen → VerificationScreen → CaregiversScreen
//     └── DonorRequest   → DonorRequestScreen  (reached via push notification tap)

import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';

import { useAuthStore }       from './src/store/authStore';
import { usePushNotifications } from './src/hooks/usePushNotifications';
import { navigationRef }      from './src/navigation/RootNavigation';
import { COLORS }             from './src/config';

import AuthScreen           from './src/screens/AuthScreen';
import HomeScreen           from './src/screens/HomeScreen';
import DonorProfileScreen   from './src/screens/DonorProfileScreen';
import RequestBloodScreen   from './src/screens/RequestBloodScreen';
import ActiveRequestScreen  from './src/screens/ActiveRequestScreen';
import VerificationScreen   from './src/screens/VerificationScreen';
import DonorRequestScreen   from './src/screens/DonorRequestScreen';
import DonorAcceptedScreen  from './src/screens/DonorAcceptedScreen';
import CaregiversScreen     from './src/screens/CaregiversScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

// ─── Profile tab stack ─────────────────────────────────────────────────────────
function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={stackOptions}>
      <Stack.Screen name="DonorProfile"  component={DonorProfileScreen}  options={{ title: 'My Profile' }} />
      <Stack.Screen name="Verification"  component={VerificationScreen}   options={{ title: 'Verify Identity' }} />
      <Stack.Screen name="Caregivers"    component={CaregiversScreen}     options={{ title: 'Emergency Caregivers' }} />
    </Stack.Navigator>
  );
}

// ─── Request tab stack ─────────────────────────────────────────────────────────
function RequestStack() {
  return (
    <Stack.Navigator screenOptions={stackOptions}>
      <Stack.Screen name="RequestBlood"  component={RequestBloodScreen}  options={{ title: 'Request Blood' }} />
      <Stack.Screen name="ActiveRequest" component={ActiveRequestScreen} options={{ title: 'My Requests' }} />
    </Stack.Navigator>
  );
}

// ─── Main tab navigator ────────────────────────────────────────────────────────
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown:             false,
        tabBarActiveTintColor:   COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle:             { borderTopColor: COLORS.border },
        tabBarIcon: () => {
          const icons = { Home: '🏠', Request: '🩸', Donate: '💉', Profile: '👤' };
          return <Text style={{ fontSize: 20 }}>{icons[route.name]}</Text>;
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ headerShown: true, title: 'Blood Bridge', headerStyle: { backgroundColor: COLORS.primary }, headerTintColor: COLORS.white }}
      />
      <Tab.Screen name="Request" component={RequestStack} />
      <Tab.Screen name="Donate"  component={DonorAcceptedScreen} options={{ headerShown: true, title: 'My Donations' }} />
      <Tab.Screen name="Profile" component={ProfileStack} />
    </Tab.Navigator>
  );
}

// ─── Root stack ────────────────────────────────────────────────────────────────
// DonorRequest sits above the tab navigator so push notification taps can
// navigate here regardless of which tab the user is on.
function RootNavigator() {
  const token = useAuthStore((state) => state.token);

  if (!token) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Auth" component={AuthScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs"    component={MainTabs} />
      <Stack.Screen
        name="DonorRequest"
        component={DonorRequestScreen}
        options={{ headerShown: true, title: 'Blood Request', ...stackOptions }}
      />
    </Stack.Navigator>
  );
}

// ─── Root component ────────────────────────────────────────────────────────────
export default function App() {
  usePushNotifications();

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef}>
        <StatusBar style="auto" />
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const stackOptions = {
  headerStyle:      { backgroundColor: COLORS.white },
  headerTintColor:  COLORS.primary,
  headerTitleStyle: { fontWeight: '700' },
};
