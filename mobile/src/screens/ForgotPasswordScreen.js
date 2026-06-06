// screens/ForgotPasswordScreen.js
//
// Two-step password reset:
//   1. User enters email → POST /api/auth/forgot-password
//      Backend emails a reset link (always returns 200 — never leaks if email exists).
//   2. User opens the link in a browser, types a new password, submits.
//   3. Returns here → user signs in with the new password.

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import api from '../services/api';
import { COLORS } from '../config';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail]         = useState('');
  const [emailError, setEmailError] = useState('');
  const [loading, setLoading]     = useState(false);
  const [sent, setSent]           = useState(false);

  const trimmedEmail = email.trim();
  const isEmailValid = EMAIL_RE.test(trimmedEmail);
  const canSubmit    = isEmailValid && !loading;

  function handleEmailBlur() {
    if (!isEmailValid) setEmailError('Enter a valid email');
  }

  function handleEmailChange(value) {
    setEmail(value);
    if (emailError) setEmailError('');
  }

  async function handleSend() {
    if (!isEmailValid) {
      setEmailError('Enter a valid email');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: trimmedEmail });
      setSent(true);
    } catch (err) {
      console.error('[ForgotPassword]', err.message);
      // Even on error we show the success message to avoid leaking whether the email exists.
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Reset your password</Text>

        {!sent ? (
          <>
            <Text style={styles.subtitle}>
              Enter the email on your account. We'll send a reset link if we find a match.
            </Text>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.input, emailError && styles.inputError]}
              value={email}
              onChangeText={handleEmailChange}
              onBlur={handleEmailBlur}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="you@example.com"
              placeholderTextColor={COLORS.textMuted}
              autoFocus
            />
            {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
            <TouchableOpacity
              style={[styles.button, !canSubmit && styles.buttonDisabled]}
              onPress={handleSend}
              disabled={!canSubmit}
            >
              {loading
                ? <ActivityIndicator color={COLORS.white} />
                : <Text style={styles.buttonText}>Send reset link</Text>
              }
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.subtitle}>
              If an account exists for <Text style={styles.emailHighlight}>{trimmedEmail}</Text>,
              a reset link has been sent. Open the link in your inbox to choose a new password.
            </Text>
            <TouchableOpacity
              style={styles.button}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.buttonText}>Back to sign in</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.primary, justifyContent: 'center', padding: 24 },
  card:      { backgroundColor: COLORS.white, borderRadius: 16, padding: 24 },
  title:     { fontSize: 22, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  subtitle:  { fontSize: 14, color: COLORS.textMuted, marginBottom: 20, lineHeight: 20 },
  label:     { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
    paddingVertical: 14, paddingHorizontal: 16, fontSize: 15,
    color: COLORS.text, marginBottom: 12, backgroundColor: COLORS.background,
  },
  inputError:    { borderColor: '#EF4444' },
  errorText:     { fontSize: 12, color: '#EF4444', marginTop: 4, marginBottom: 8 },
  emailHighlight:{ fontWeight: '700', color: COLORS.text },
  button: {
    backgroundColor: COLORS.primary, borderRadius: 10,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText:     { color: COLORS.white, fontSize: 16, fontWeight: '700' },
});
