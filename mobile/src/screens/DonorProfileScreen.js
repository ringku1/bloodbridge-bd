// screens/DonorProfileScreen.js
//
// Donor profile and account settings.
//
// Sections:
//   - Identity   : email (with verify), change email, change password, save phone
//   - Donor info : name, blood group, district, GPS location
//   - Actions    : Favourites, Caregivers, Log out

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator, Alert, Modal,
} from 'react-native';
import * as Location from 'expo-location';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import BloodGroupPicker from '../components/BloodGroupPicker';
import { COLORS } from '../config';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function DonorProfileScreen({ navigation }) {
  const { user, updateUser, logout } = useAuthStore();

  const [name, setName]             = useState(user?.name || '');
  const [bloodGroup, setBloodGroup] = useState(user?.bloodGroup || null);
  const [district, setDistrict]     = useState(user?.district || '');
  const [latitude, setLatitude]     = useState(user?.latitude || null);
  const [longitude, setLongitude]   = useState(user?.longitude || null);
  const [phone, setPhone]           = useState(user?.phone || '');
  const initialPhone                = user?.phone || '';
  const [loading, setLoading]       = useState(false);
  const [locating, setLocating]     = useState(false);

  // OTP modal state
  const [modalOpen, setModalOpen]         = useState(null); // 'verify' | 'change_email' | 'change_password' | null
  const [otp, setOtp]                     = useState('');
  const [newEmail, setNewEmail]           = useState('');
  const [newEmailError, setNewEmailError] = useState('');
  const [newPassword, setNewPassword]     = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [modalLoading, setModalLoading]   = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const resendTimerRef = useRef(null);
  const mountedRef     = useRef(true);

  // Track mounted state so async ticks (resend countdown, network callbacks)
  // don't try to update state on an unmounted component.
  useEffect(() => () => {
    mountedRef.current = false;
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
  }, []);

  function startResendCountdown() {
    if (!mountedRef.current) return;
    setResendSeconds(60);
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    resendTimerRef.current = setInterval(() => {
      if (!mountedRef.current) { clearInterval(resendTimerRef.current); return; }
      setResendSeconds((s) => {
        if (s <= 1) { clearInterval(resendTimerRef.current); return 0; }
        return s - 1;
      });
    }, 1000);
  }

  async function handleGetLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is needed to set your area.');
        return;
      }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLatitude(location.coords.latitude);
      setLongitude(location.coords.longitude);
      Alert.alert('Location set', 'Your current location has been saved.');
    } catch (err) {
      console.error('[Profile/location]', err.message);
      Alert.alert('Error', 'Could not get location. Please try again.');
    } finally {
      setLocating(false);
    }
  }

  async function handleSaveProfile() {
    if (!name.trim()) return Alert.alert('Name required', 'Please enter your full name.');
    if (!bloodGroup) return Alert.alert('Blood group required', 'Please select your blood group.');

    setLoading(true);
    try {
      const res = await api.put('/donors/profile', {
        name:      name.trim(),
        bloodGroup,
        district:  district.trim(),
        latitude,
        longitude,
      });
      updateUser(res.data.user);
      Alert.alert('Saved!', 'Your profile has been updated.');
    } catch (err) {
      console.error('[Profile/save]', err.message);
      Alert.alert('Error', err.response?.data?.error || 'Failed to save profile.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSavePhone() {
    setLoading(true);
    try {
      const res = await api.put('/donors/phone', { phone: phone.trim() || null });
      updateUser({ phone: res.data.user.phone });
      Alert.alert('Saved!', 'Phone updated.');
    } catch (err) {
      console.error('[Profile/phone]', err.message);
      Alert.alert('Error', err.response?.data?.error || 'Failed to save phone.');
    } finally {
      setLoading(false);
    }
  }

  async function startOtpFlow(purpose) {
    setOtp(''); setNewEmail(''); setNewPassword(''); setNewEmailError('');
    setShowNewPassword(false);
    setModalOpen(purpose);
    try {
      await api.post('/auth/send-email-otp', { purpose });
      startResendCountdown();
    } catch (err) {
      console.error('[Profile/otp-send]', err.message);
      Alert.alert('Error', err.response?.data?.error || 'Could not send code.');
      setModalOpen(null);
    }
  }

  async function resendCode() {
    if (resendSeconds > 0 || !modalOpen) return;
    try {
      await api.post('/auth/send-email-otp', { purpose: modalOpen });
      startResendCountdown();
      Alert.alert('Sent', 'A new code has been emailed to you.');
    } catch (err) {
      console.error('[Profile/otp-resend]', err.message);
      Alert.alert('Error', err.response?.data?.error || 'Could not resend code.');
    }
  }

  async function submitOtp() {
    if (otp.length !== 6) return;
    if (modalOpen === 'change_email') {
      const err = !newEmail.trim() ? 'New email is required'
        : !EMAIL_RE.test(newEmail) ? 'Enter a valid email' : '';
      setNewEmailError(err);
      if (err) return;
    }
    if (modalOpen === 'change_password' && newPassword.length < 8) return;

    setModalLoading(true);
    try {
      const body = { purpose: modalOpen, code: otp };
      if (modalOpen === 'change_email')    body.newEmail = newEmail.trim();
      if (modalOpen === 'change_password') body.newPassword = newPassword;
      const res = await api.post('/auth/verify-email-otp', body);
      updateUser(res.data.user);
      setModalOpen(null);
      Alert.alert('Done', 'Update applied.');
    } catch (err) {
      console.error('[Profile/otp-verify]', err.message);
      Alert.alert('Error', err.response?.data?.error || 'Invalid or expired code.');
    } finally {
      setModalLoading(false);
    }
  }

  const modalTitle = {
    verify:          'Verify your email',
    change_email:    'Change email',
    change_password: 'Change password',
  }[modalOpen];

  const phoneChanged   = phone.trim() !== (initialPhone || '').trim();
  const passwordValid  = newPassword.length >= 8;
  const newEmailValid  = newEmail.trim() && EMAIL_RE.test(newEmail) && !newEmailError;
  const otpComplete    = otp.length === 6;

  let canConfirm = otpComplete;
  if (modalOpen === 'change_email')    canConfirm = canConfirm && newEmailValid;
  if (modalOpen === 'change_password') canConfirm = canConfirm && passwordValid;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      <Text style={styles.sectionHeader}>Identity</Text>

      <View style={styles.identityRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{user?.email}</Text>
        </View>
        {user?.emailVerified ? (
          <Text style={styles.verifiedBadge}>✓ Verified</Text>
        ) : (
          <TouchableOpacity onPress={() => startOtpFlow('verify')}>
            <Text style={styles.link}>Verify</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.miniRow}>
        <TouchableOpacity onPress={() => startOtpFlow('change_email')}>
          <Text style={styles.link}>Change email</Text>
        </TouchableOpacity>
        <Text style={styles.dotSep}>·</Text>
        <TouchableOpacity onPress={() => startOtpFlow('change_password')}>
          <Text style={styles.link}>Change password</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.label, { marginTop: 18 }]}>Phone (optional)</Text>
      <View style={styles.phoneRow}>
        <TextInput
          style={[styles.input, { flex: 1, marginBottom: 0 }]}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="+8801XXXXXXXXX"
          placeholderTextColor={COLORS.textMuted}
        />
        <TouchableOpacity
          style={[styles.savePhoneBtn, (!phoneChanged || loading) && styles.buttonDisabled]}
          onPress={handleSavePhone}
          disabled={!phoneChanged || loading}
        >
          <Text style={styles.savePhoneText}>Save</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.helper}>
        Format: +8801XXXXXXXXX — used only when you tap Share Number in chat.
      </Text>

      {/* ─── Donor info ───────────────────────────────────────────────────── */}
      <Text style={[styles.sectionHeader, { marginTop: 24 }]}>Donor info</Text>

      <Text style={styles.label}>Full Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Rafiq Ahmed"
        placeholderTextColor={COLORS.textMuted}
      />

      <Text style={styles.label}>Blood Group</Text>
      <BloodGroupPicker value={bloodGroup} onChange={setBloodGroup} />

      <Text style={[styles.label, { marginTop: 20 }]}>District</Text>
      <TextInput
        style={styles.input}
        value={district}
        onChangeText={setDistrict}
        placeholder="e.g. Dhaka, Chattogram, Sylhet"
        placeholderTextColor={COLORS.textMuted}
      />

      <Text style={styles.label}>Location (GPS)</Text>
      <TouchableOpacity
        style={styles.locationButton}
        onPress={handleGetLocation}
        disabled={locating}
      >
        {locating
          ? <ActivityIndicator color={COLORS.primary} />
          : <Text style={styles.locationButtonText}>
              {latitude ? '📍 Location set — tap to update' : '📍 Use my current location'}
            </Text>
        }
      </TouchableOpacity>
      {latitude != null && longitude != null && (
        <Text style={styles.coordsText}>
          {Number(latitude).toFixed(5)}, {Number(longitude).toFixed(5)}
        </Text>
      )}

      <TouchableOpacity
        style={[styles.saveButton, loading && styles.buttonDisabled]}
        onPress={handleSaveProfile}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color={COLORS.white} />
          : <Text style={styles.saveButtonText}>Save Profile</Text>
        }
      </TouchableOpacity>

      <TouchableOpacity style={styles.navButton} onPress={() => navigation.navigate('Favourites')}>
        <Text style={styles.navButtonText}>♥  My Favourites</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.navButton} onPress={() => navigation.navigate('Caregivers')}>
        <Text style={styles.navButtonText}>👥  Manage Emergency Caregivers</Text>
        <Text style={styles.navButtonSub}>Notified by SMS if no donor responds in 30 min</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={() =>
          Alert.alert('Log out', 'Are you sure you want to log out?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Log out', style: 'destructive', onPress: logout },
          ])
        }
      >
        <Text style={styles.logoutButtonText}>Log Out</Text>
      </TouchableOpacity>

      {/* ─── OTP modal ────────────────────────────────────────────────────── */}
      <Modal visible={!!modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{modalTitle}</Text>
            <Text style={styles.modalSubtitle}>
              We sent a 6-digit code to {user?.email}. Enter it below.
            </Text>

            {modalOpen === 'change_email' && (
              <>
                <Text style={styles.modalLabel}>New email</Text>
                <TextInput
                  style={[styles.input, newEmailError && styles.inputError]}
                  value={newEmail}
                  onChangeText={(v) => { setNewEmail(v); if (newEmailError) setNewEmailError(''); }}
                  onBlur={() => {
                    if (!newEmail.trim()) setNewEmailError('New email is required');
                    else if (!EMAIL_RE.test(newEmail)) setNewEmailError('Enter a valid email');
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="you@example.com"
                  placeholderTextColor={COLORS.textMuted}
                />
                {newEmailError ? <Text style={styles.errorText}>{newEmailError}</Text> : null}
              </>
            )}
            {modalOpen === 'change_password' && (
              <>
                <Text style={styles.modalLabel}>New password</Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showNewPassword}
                    placeholder="At least 8 characters"
                    placeholderTextColor={COLORS.textMuted}
                  />
                  <TouchableOpacity style={styles.eyeButton} onPress={() => setShowNewPassword((v) => !v)}>
                    <Text style={styles.eyeText}>{showNewPassword ? '🙈' : '👁'}</Text>
                  </TouchableOpacity>
                </View>
                <Text style={newPassword.length === 0 ? styles.helper : passwordValid ? styles.helperOk : styles.errorText}>
                  {newPassword.length === 0
                    ? 'At least 8 characters'
                    : passwordValid
                      ? '✓ Looks good'
                      : `Password too short (${newPassword.length}/8)`}
                </Text>
              </>
            )}

            <Text style={[styles.modalLabel, { marginTop: 16 }]}>6-digit code</Text>
            <TextInput
              style={[styles.input, styles.otpInput, { marginBottom: 0 }]}
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="123456"
              placeholderTextColor={COLORS.textMuted}
            />
            <Text style={styles.counter}>{otp.length}/6</Text>

            <TouchableOpacity onPress={resendCode} disabled={resendSeconds > 0}>
              <Text style={[styles.resendText, resendSeconds > 0 && styles.resendDisabled]}>
                {resendSeconds > 0 ? `Resend in ${resendSeconds}s` : 'Resend code'}
              </Text>
            </TouchableOpacity>

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setModalOpen(null)}>
                <Text style={styles.link}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, (!canConfirm || modalLoading) && styles.buttonDisabled]}
                onPress={submitOtp}
                disabled={!canConfirm || modalLoading}
              >
                {modalLoading
                  ? <ActivityIndicator color={COLORS.white} />
                  : <Text style={styles.modalConfirmText}>Confirm</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content:   { padding: 20, paddingBottom: 40 },

  sectionHeader: {
    fontSize: 12, fontWeight: '700', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12,
  },

  label: {
    fontSize: 13, fontWeight: '600', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 8, marginTop: 8,
  },
  modalLabel: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 6 },
  value: { fontSize: 15, color: COLORS.text, fontWeight: '600', marginTop: 2 },
  helper:   { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },
  helperOk: { fontSize: 12, color: '#16A34A',        marginTop: 4 },
  errorText:{ fontSize: 12, color: '#EF4444',        marginTop: 4 },
  counter:  { fontSize: 11, color: COLORS.textMuted, textAlign: 'right', marginTop: 4 },

  identityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.white, borderRadius: 10,
    padding: 14, borderWidth: 1, borderColor: COLORS.border,
  },
  verifiedBadge: { color: '#16A34A', fontWeight: '700', fontSize: 13 },
  link:          { color: COLORS.primary, fontWeight: '600' },
  miniRow:       { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  dotSep:        { color: COLORS.textMuted },

  phoneRow: { flexDirection: 'row', gap: 8 },
  savePhoneBtn: {
    backgroundColor: COLORS.primary, borderRadius: 10,
    paddingHorizontal: 18, justifyContent: 'center',
  },
  savePhoneText: { color: COLORS.white, fontWeight: '700' },

  input: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
    paddingVertical: 14, paddingHorizontal: 16, fontSize: 15,
    color: COLORS.text, backgroundColor: COLORS.white, marginBottom: 16,
  },
  inputError: { borderColor: '#EF4444' },

  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 0 },
  eyeButton:   { paddingHorizontal: 12, paddingVertical: 12 },
  eyeText:     { fontSize: 18 },

  locationButton: {
    borderWidth: 1, borderColor: COLORS.primary, borderRadius: 10,
    padding: 14, alignItems: 'center',
  },
  locationButtonText: { color: COLORS.primary, fontWeight: '600', fontSize: 15 },
  coordsText:         { fontSize: 12, color: COLORS.textMuted, marginTop: 6, marginBottom: 20 },

  saveButton: {
    backgroundColor: COLORS.primary, borderRadius: 12,
    padding: 18, alignItems: 'center', marginTop: 24,
  },
  buttonDisabled: { opacity: 0.5 },
  saveButtonText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },

  navButton: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
    padding: 16, marginTop: 12,
  },
  navButtonText: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  navButtonSub:  { fontSize: 12, color: COLORS.textMuted, marginTop: 3 },

  logoutButton: {
    borderWidth: 1, borderColor: '#EF4444', borderRadius: 12,
    padding: 16, marginTop: 12, alignItems: 'center',
  },
  logoutButtonText: { fontSize: 15, fontWeight: '600', color: '#EF4444' },

  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  modalCard: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 24, width: '100%',
  },
  modalTitle:    { fontSize: 18, fontWeight: '700', color: COLORS.text },
  modalSubtitle: { fontSize: 13, color: COLORS.textMuted, marginTop: 6, marginBottom: 16 },
  otpInput: {
    fontSize: 22, fontWeight: '700', letterSpacing: 6, textAlign: 'center',
  },
  resendText:     { color: COLORS.primary, fontWeight: '600', marginTop: 12, textAlign: 'center' },
  resendDisabled: { color: COLORS.textMuted },
  modalActions: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16,
  },
  modalConfirm: {
    backgroundColor: COLORS.primary, borderRadius: 10,
    paddingHorizontal: 24, paddingVertical: 12,
  },
  modalConfirmText: { color: COLORS.white, fontWeight: '700' },
});
