// screens/SignUpScreen.js
//
// New user registration: email + password + name + blood group.
// District and GPS location are deferred to the profile screen (first edit).

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import BloodGroupPicker from '../components/BloodGroupPicker';
import { COLORS } from '../config';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignUpScreen({ navigation }) {
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [name, setName]             = useState('');
  const [bloodGroup, setBloodGroup] = useState(null);
  const [loading, setLoading]       = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [emailError, setEmailError] = useState('');
  const [nameError, setNameError]   = useState('');

  const login = useAuthStore((state) => state.login);

  const emailValid    = EMAIL_RE.test(email.trim());
  const passwordValid = password.length >= 8;
  const nameValid     = name.trim().length > 0;
  const formValid     = emailValid && passwordValid && nameValid && !!bloodGroup;

  function onEmailBlur() {
    setEmailError(emailValid ? '' : 'Enter a valid email');
  }

  function onNameBlur() {
    setNameError(name.trim() ? '' : 'Name is required');
  }

  async function handleSignUp() {
    if (!formValid) return;

    setLoading(true);
    try {
      const res = await api.post('/auth/signup', {
        email: email.trim(),
        password,
        name:  name.trim(),
        bloodGroup,
      });
      login(res.data.token, res.data.user);
    } catch (err) {
      console.error('[SignUp]', err.message);
      Alert.alert('Sign up failed', err.response?.data?.error || 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  let passwordHelper = null;
  if (password.length === 0) {
    passwordHelper = <Text style={styles.helper}>At least 8 characters</Text>;
  } else if (password.length < 8) {
    passwordHelper = (
      <Text style={styles.errorText}>Password too short ({password.length}/8)</Text>
    );
  } else {
    passwordHelper = <Text style={styles.helperOk}>✓ Looks good</Text>;
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.appName}>🩸 Blood Bridge</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>Sign up to start saving lives</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={[styles.input, emailError && styles.inputError]}
          value={email}
          onChangeText={(t) => { setEmail(t); if (emailError) setEmailError(''); }}
          onBlur={onEmailBlur}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="you@example.com"
          placeholderTextColor={COLORS.textMuted}
        />
        {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}

        <Text style={[styles.label, styles.labelSpaced]}>Password</Text>
        <View style={styles.passwordRow}>
          <TextInput
            style={[styles.input, styles.passwordInput]}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            placeholder="At least 8 characters"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setShowPassword((v) => !v)}
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
          >
            <Text style={styles.eyeText}>{showPassword ? '🙈' : '👁'}</Text>
          </TouchableOpacity>
        </View>
        {passwordHelper}

        <Text style={[styles.label, styles.labelSpaced]}>Full name</Text>
        <TextInput
          style={[styles.input, nameError && styles.inputError]}
          value={name}
          onChangeText={(t) => { setName(t); if (nameError) setNameError(''); }}
          onBlur={onNameBlur}
          placeholder="e.g. Rafiq Ahmed"
          placeholderTextColor={COLORS.textMuted}
        />
        {nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}

        <Text style={[styles.label, styles.labelSpaced]}>Blood Group</Text>
        <BloodGroupPicker value={bloodGroup} onChange={setBloodGroup} />

        <TouchableOpacity
          style={[styles.button, (!formValid || loading) && styles.buttonDisabled]}
          onPress={handleSignUp}
          disabled={!formValid || loading}
        >
          {loading
            ? <ActivityIndicator color={COLORS.white} />
            : <Text style={styles.buttonText}>Create Account</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.linkRow}>
          <Text style={styles.linkMuted}>
            Already have an account? <Text style={styles.link}>Sign in</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: COLORS.primary, padding: 24, paddingTop: 60 },
  header:    { alignItems: 'center', marginBottom: 24 },
  appName:   { fontSize: 28, fontWeight: '800', color: COLORS.white },
  card:      { backgroundColor: COLORS.white, borderRadius: 16, padding: 24 },
  title:     { fontSize: 22, fontWeight: '700', color: COLORS.text },
  subtitle:  { fontSize: 14, color: COLORS.textMuted, marginTop: 4, marginBottom: 20 },
  input: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
    paddingVertical: 14, paddingHorizontal: 16, fontSize: 15,
    color: COLORS.text, backgroundColor: COLORS.background,
  },
  inputError:    { borderColor: '#EF4444' },
  label:         { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 6 },
  labelSpaced:   { marginTop: 14 },
  errorText:     { fontSize: 12, color: '#EF4444', marginTop: 4 },
  helper:        { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },
  helperOk:      { fontSize: 12, color: '#16A34A', marginTop: 4 },
  passwordRow:   { position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 48 },
  eyeButton: {
    position: 'absolute', right: 8, top: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8,
  },
  eyeText:        { fontSize: 18 },
  button: {
    backgroundColor: COLORS.primary, borderRadius: 10,
    paddingVertical: 16, alignItems: 'center', marginTop: 20,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText:     { color: COLORS.white, fontSize: 16, fontWeight: '700' },
  linkRow:        { marginTop: 16, alignItems: 'center' },
  link:           { color: COLORS.primary, fontWeight: '600' },
  linkMuted:      { color: COLORS.textMuted, fontSize: 14 },
});
