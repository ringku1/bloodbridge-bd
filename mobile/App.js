// App.js
//
// Root of the React Native app.
//
// Navigation structure:
//
//   Not logged in (Auth stack):
//     SignIn → SignUp → ForgotPassword
//
//   Logged in (Root stack):
//     ├── MainTabs (bottom tab navigator)
//     │     ├── Home     → HomeScreen
//     │     ├── Browse   → BrowseRequestsScreen   (all open requests across BD)
//     │     ├── Request  → RequestBloodScreen → ActiveRequestScreen
//     │     ├── Donate   → DonorAcceptedScreen
//     │     └── Profile  → DonorProfileScreen → VerificationScreen → CaregiversScreen → FavouritesScreen
//     ├── DonorRequest   → DonorRequestScreen  (reached via push notification tap)
//     └── Chat           → ChatScreen          (1-hour temp chat, donor ↔ requester)

import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View } from 'react-native';
import React from 'react';

import { useAuthStore }       from './src/store/authStore';
import { usePushNotifications } from './src/hooks/usePushNotifications';
import { navigationRef }      from './src/navigation/RootNavigation';
import { COLORS }             from './src/config';

import SignInScreen         from './src/screens/SignInScreen';
import SignUpScreen         from './src/screens/SignUpScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import HomeScreen           from './src/screens/HomeScreen';
import BrowseRequestsScreen from './src/screens/BrowseRequestsScreen';
import DonorProfileScreen   from './src/screens/DonorProfileScreen';
import RequestBloodScreen   from './src/screens/RequestBloodScreen';
import ActiveRequestScreen  from './src/screens/ActiveRequestScreen';
import VerificationScreen   from './src/screens/VerificationScreen';
import DonorRequestScreen   from './src/screens/DonorRequestScreen';
import DonorAcceptedScreen  from './src/screens/DonorAcceptedScreen';
import CaregiversScreen     from './src/screens/CaregiversScreen';
import FavouritesScreen     from './src/screens/FavouritesScreen';
import ChatScreen           from './src/screens/ChatScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

class ErrorBoundary extends React.Component {
  state = { crashed: false, error: null };
  static getDerivedStateFromError(error) {
    return { crashed: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error.message, info.componentStack);
  }
  render() {
    if (this.state.crashed) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Something went wrong</Text>
          <Text style={{ color: '#6B7280', textAlign: 'center', marginBottom: 24 }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </Text>
          <Text
            style={{ color: '#DC2626', fontWeight: '600' }}
            onPress={() => this.setState({ crashed: false, error: null })}
          >
            Tap to retry
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

// ─── Profile tab stack ─────────────────────────────────────────────────────────
function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={stackOptions}>
      <Stack.Screen name="DonorProfile" component={DonorProfileScreen} options={{ title: 'My Profile' }} />
      <Stack.Screen name="Verification" component={VerificationScreen} options={{ title: 'Verify Identity' }} />
      <Stack.Screen name="Caregivers"   component={CaregiversScreen}   options={{ title: 'Emergency Caregivers' }} />
      <Stack.Screen name="Favourites"   component={FavouritesScreen}   options={{ title: 'My Favourites' }} />
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
          const icons = { Home: '🏠', Browse: '🔍', Request: '🩸', Donate: '💉', Profile: '👤' };
          return <Text style={{ fontSize: 20 }}>{icons[route.name]}</Text>;
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ headerShown: true, title: 'Blood Bridge', headerStyle: { backgroundColor: COLORS.primary }, headerTintColor: COLORS.white }}
      />
      <Tab.Screen
        name="Browse"
        component={BrowseRequestsScreen}
        options={{ headerShown: true, title: 'Browse Requests', ...stackOptions }}
      />
      <Tab.Screen name="Request" component={RequestStack} />
      <Tab.Screen name="Donate"  component={DonorAcceptedScreen} options={{ headerShown: true, title: 'My Donations', ...stackOptions }} />
      <Tab.Screen name="Profile" component={ProfileStack} />
    </Tab.Navigator>
  );
}

// ─── Auth stack ────────────────────────────────────────────────────────────────
function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SignIn"         component={SignInScreen} />
      <Stack.Screen name="SignUp"         component={SignUpScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
}

// ─── Root stack ────────────────────────────────────────────────────────────────
function RootNavigator() {
  const token = useAuthStore((state) => state.token);

  if (!token) return <AuthNavigator />;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs"    component={MainTabs} />
      <Stack.Screen
        name="DonorRequest"
        component={DonorRequestScreen}
        options={{ headerShown: true, title: 'Blood Request', ...stackOptions }}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{ headerShown: true, ...stackOptions }}
      />
    </Stack.Navigator>
  );
}

// ─── Root component ────────────────────────────────────────────────────────────
export default function App() {
  usePushNotifications();

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <NavigationContainer ref={navigationRef}>
          <StatusBar style="auto" />
          <RootNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const stackOptions = {
  headerStyle:      { backgroundColor: COLORS.white },
  headerTintColor:  COLORS.primary,
  headerTitleStyle: { fontWeight: '700' },
};
