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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignInScreen({ navigation }) {
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [emailError, setEmailError]   = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword]   = useState(false);
  const [loading, setLoading]         = useState(false);

  const login = useAuthStore((state) => state.login);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  function handleEmailBlur() {
    if (!EMAIL_REGEX.test(email.trim())) {
      setEmailError('Enter a valid email');
    }
  }

  function handlePasswordBlur() {
    if (!password) {
      setPasswordError('Password is required');
    }
  }

  async function handleSignIn() {
    if (!canSubmit) return;
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

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={[styles.input, emailError && styles.inputError]}
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            if (emailError) setEmailError('');
          }}
          onBlur={handleEmailBlur}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="you@example.com"
          placeholderTextColor={COLORS.textMuted}
        />
        {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}

        <Text style={[styles.label, styles.labelSpacing]}>Password</Text>
        <View style={[styles.passwordRow, passwordError && styles.inputError]}>
          <TextInput
            style={styles.passwordInput}
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (passwordError) setPasswordError('');
            }}
            onBlur={handlePasswordBlur}
            secureTextEntry={!showPassword}
            placeholder="Your password"
            placeholderTextColor={COLORS.textMuted}
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setShowPassword((v) => !v)}
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
          >
            <Text style={styles.eyeText}>{showPassword ? '🙈' : '👁'}</Text>
          </TouchableOpacity>
        </View>
        {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}

        <TouchableOpacity
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={handleSignIn}
          disabled={!canSubmit}
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
  label:     { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 6 },
  labelSpacing: { marginTop: 12 },
  input: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
    paddingVertical: 14, paddingHorizontal: 16, fontSize: 15,
    color: COLORS.text, backgroundColor: COLORS.background,
  },
  inputError: { borderColor: '#EF4444' },
  errorText:  { fontSize: 12, color: '#EF4444', marginTop: 4 },
  passwordRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
    backgroundColor: COLORS.background,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 14, paddingHorizontal: 16, fontSize: 15,
    color: COLORS.text,
  },
  eyeButton:  { paddingHorizontal: 14, paddingVertical: 10 },
  eyeText:    { fontSize: 18 },
  button: {
    backgroundColor: COLORS.primary, borderRadius: 10,
    paddingVertical: 16, alignItems: 'center', marginTop: 20,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText:     { color: COLORS.white, fontSize: 16, fontWeight: '700' },
  linkRow:        { marginTop: 16, alignItems: 'center' },
  link:           { color: COLORS.primary, fontWeight: '600' },
  divider:        { height: 1, backgroundColor: COLORS.border, marginVertical: 20 },
  signupText:     { textAlign: 'center', color: COLORS.textMuted, fontSize: 14 },
});
