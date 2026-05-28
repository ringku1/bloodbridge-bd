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

export default function SignUpScreen({ navigation }) {
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [name, setName]             = useState('');
  const [bloodGroup, setBloodGroup] = useState(null);
  const [loading, setLoading]       = useState(false);

  const login = useAuthStore((state) => state.login);

  async function handleSignUp() {
    if (!email.trim() || !password) {
      Alert.alert('Missing info', 'Email and password are required.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Weak password', 'Password must be at least 8 characters.');
      return;
    }
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter your full name.');
      return;
    }
    if (!bloodGroup) {
      Alert.alert('Blood group', 'Please select your blood group.');
      return;
    }

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

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.appName}>🩸 Blood Bridge</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>Sign up to start saving lives</Text>

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
          placeholder="Password (min. 8 characters)"
        />
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Full name"
        />

        <Text style={styles.label}>Blood Group</Text>
        <BloodGroupPicker value={bloodGroup} onChange={setBloodGroup} />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSignUp}
          disabled={loading}
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
    color: COLORS.text, marginBottom: 12, backgroundColor: COLORS.background,
  },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted, marginTop: 8, marginBottom: 10 },
  button: {
    backgroundColor: COLORS.primary, borderRadius: 10,
    paddingVertical: 16, alignItems: 'center', marginTop: 20,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText:     { color: COLORS.white, fontSize: 16, fontWeight: '700' },
  linkRow:        { marginTop: 16, alignItems: 'center' },
  link:           { color: COLORS.primary, fontWeight: '600' },
  linkMuted:      { color: COLORS.textMuted, fontSize: 14 },
});
