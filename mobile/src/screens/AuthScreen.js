// screens/AuthScreen.js
//
// Phone-based OTP authentication — the entry point for new and returning users.
//
// Flow:
//   Phase 1 — user enters their Bangladesh phone number (+880...)
//             → POST /api/auth/send-otp
//             → OTP printed to backend console (mock mode) or sent via SMS (prod)
//
//   Phase 2 — user enters the 6-digit OTP
//             → POST /api/auth/verify-otp
//             → on success: save token + user in authStore → navigate to app
//
// The phone number is pre-filled with "+880" since we're targeting Bangladesh.

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { COLORS } from '../config';

export default function AuthScreen() {
  const [phase, setPhase]     = useState('phone'); // 'phone' | 'otp'
  const [phone, setPhone]     = useState('+880');
  const [otp, setOtp]         = useState('');
  const [loading, setLoading] = useState(false);

  const login = useAuthStore((state) => state.login);

  async function handleSendOtp() {
    if (phone.length < 14) {
      Alert.alert('Invalid number', 'Enter a valid Bangladesh number: +8801XXXXXXXXX');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/send-otp', { phone });
      setPhase('otp');
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to send OTP. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (otp.length !== 6) {
      Alert.alert('Invalid OTP', 'Enter the 6-digit code.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/verify-otp', { phone, otp });
      login(res.data.token, res.data.user);
      // authStore update triggers App.js to re-render and show the main tabs
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Invalid or expired OTP.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.appName}>🩸 Blood Bridge</Text>
        <Text style={styles.tagline}>Saving lives with verified donors</Text>
      </View>

      <View style={styles.card}>
        {phase === 'phone' ? (
          <>
            <Text style={styles.title}>Enter your phone number</Text>
            <Text style={styles.subtitle}>We'll send you a one-time password</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="+8801XXXXXXXXX"
              maxLength={14}
              autoFocus
            />
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSendOtp}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color={COLORS.white} />
                : <Text style={styles.buttonText}>Send OTP</Text>
              }
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.title}>Enter OTP</Text>
            <Text style={styles.subtitle}>
              Code sent to {phone}.{' '}
              <Text style={styles.link} onPress={() => setPhase('phone')}>
                Change number
              </Text>
            </Text>
            <TextInput
              style={[styles.input, styles.otpInput]}
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              placeholder="6-digit code"
              maxLength={6}
              autoFocus
            />
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleVerifyOtp}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color={COLORS.white} />
                : <Text style={styles.buttonText}>Verify & Continue</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSendOtp} style={styles.resendBtn}>
              <Text style={styles.resendText}>Resend OTP</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: COLORS.primary,
    justifyContent:  'center',
    padding:         24,
  },
  header: {
    alignItems:    'center',
    marginBottom:  40,
  },
  appName: {
    fontSize:   32,
    fontWeight: '800',
    color:      COLORS.white,
  },
  tagline: {
    fontSize:  14,
    color:     'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius:    16,
    padding:         24,
  },
  title: {
    fontSize:     22,
    fontWeight:   '700',
    color:        COLORS.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize:     14,
    color:        COLORS.textMuted,
    marginBottom: 20,
  },
  link: {
    color:      COLORS.primary,
    fontWeight: '600',
  },
  input: {
    borderWidth:     1,
    borderColor:     COLORS.border,
    borderRadius:    10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize:        16,
    color:           COLORS.text,
    marginBottom:    16,
    backgroundColor: COLORS.background,
  },
  otpInput: {
    fontSize:    28,
    fontWeight:  '700',
    letterSpacing: 8,
    textAlign:   'center',
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius:    10,
    paddingVertical: 16,
    alignItems:      'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color:      COLORS.white,
    fontSize:   16,
    fontWeight: '700',
  },
  resendBtn: {
    marginTop:  16,
    alignItems: 'center',
  },
  resendText: {
    color:    COLORS.primary,
    fontSize: 14,
  },
});
