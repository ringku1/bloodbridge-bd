// screens/SignInScreen.js
//
// Email + password sign-in. Entry screen for returning users.

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { COLORS } from '../config';

export default function SignInScreen({ navigation }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);

  const login = useAuthStore((state) => state.login);

  async function handleSignIn() {
    if (!email.trim() || !password) {
      Alert.alert('Missing info', 'Enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email: email.trim(), password });
      login(res.data.token, res.data.user);
    } catch (err) {
      console.error('[SignIn]', err.message);
      Alert.alert('Sign in failed', err.response?.data?.error || 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.appName}>🩸 Blood Bridge</Text>
        <Text style={styles.tagline}>Saving lives with verified donors</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Email"
        />
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Password"
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSignIn}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color={COLORS.white} />
            : <Text style={styles.buttonText}>Sign In</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => navigation.navigate('ForgotPassword')}
        >
          <Text style={styles.link}>Forgot password?</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
          <Text style={styles.signupText}>
            Don't have an account? <Text style={styles.link}>Sign up</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.primary, justifyContent: 'center', padding: 24 },
  header:    { alignItems: 'center', marginBottom: 32 },
  appName:   { fontSize: 32, fontWeight: '800', color: COLORS.white },
  tagline:   { fontSize: 14, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  card:      { backgroundColor: COLORS.white, borderRadius: 16, padding: 24 },
  title:     { fontSize: 22, fontWeight: '700', color: COLORS.text },
  subtitle:  { fontSize: 14, color: COLORS.textMuted, marginTop: 4, marginBottom: 20 },
  input: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
    paddingVertical: 14, paddingHorizontal: 16, fontSize: 15,
    color: COLORS.text, marginBottom: 12, backgroundColor: COLORS.background,
  },
  button: {
    backgroundColor: COLORS.primary, borderRadius: 10,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText:     { color: COLORS.white, fontSize: 16, fontWeight: '700' },
  linkRow:        { marginTop: 16, alignItems: 'center' },
  link:           { color: COLORS.primary, fontWeight: '600' },
  divider:        { height: 1, backgroundColor: COLORS.border, marginVertical: 20 },
  signupText:     { textAlign: 'center', color: COLORS.textMuted, fontSize: 14 },
});
