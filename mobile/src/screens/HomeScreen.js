// screens/HomeScreen.js
//
// The main dashboard for a logged-in donor.
//
// Shows:
//   - User's name, blood group badge, verified status
//   - Eligibility card: "You can donate" OR countdown to next eligible date
//   - Availability toggle: donors can mark themselves unavailable (e.g. traveling)
//   - Verification banner if not yet VERIFIED
//   - Quick "Request Blood" button (navigates to RequestBloodScreen)

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Switch, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { COLORS } from '../config';
import { formatBloodGroup, formatDate, timeAgo } from '../utils/formatters';

export default function HomeScreen({ navigation }) {
  const { user, updateUser } = useAuthStore();
  const [eligibility, setEligibility]       = useState(null);
  const [loading, setLoading]               = useState(true);
  const [toggling, setToggling]             = useState(false);
  const [fetchError, setFetchError]         = useState(false);
  const [lastFetchedAt, setLastFetchedAt]   = useState(null);

  useFocusEffect(useCallback(() => { fetchEligibility(); }, []));

  async function fetchEligibility() {
    try {
      const res = await api.get('/donors/eligibility');
      setEligibility(res.data);
      setFetchError(false);
      setLastFetchedAt(new Date());
    } catch (err) {
      console.error('Failed to fetch eligibility:', err.message);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }

  // Toggle the donor's availability (e.g. going on holiday → set unavailable)
  async function handleAvailabilityToggle(newValue) {
    if (isLocked) return;
    setToggling(true);
    try {
      await api.put('/donors/availability', { isAvailable: newValue });
      updateUser({ isAvailable: newValue });
      setEligibility((prev) => prev ? { ...prev, isAvailable: newValue } : prev);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not update availability.');
    } finally {
      setToggling(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const isAvailable     = eligibility?.isAvailable ?? user?.isAvailable;
  const eligibleAgainAt = eligibility?.eligibleAgainAt;
  const isLocked        = !isAvailable && eligibleAgainAt
    && new Date(eligibleAgainAt).getTime() > Date.now();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── Profile header ──────────────────────────────────────────────── */}
      <View style={styles.profileCard}>
        <View style={styles.profileInfo}>
          <Text style={styles.userName}>{user?.name || 'Set up your profile'}</Text>
          <Text style={styles.userDistrict}>{user?.district || ''}</Text>
        </View>
        {user?.bloodGroup && (
          <View style={styles.bloodBadge}>
            <Text style={styles.bloodBadgeText}>{formatBloodGroup(user.bloodGroup)}</Text>
          </View>
        )}
      </View>

      {/* ── Verification banner ─────────────────────────────────────────── */}
      {user?.verifiedStatus !== 'VERIFIED' && (
        <TouchableOpacity
          style={styles.verificationBanner}
          onPress={() => navigation.navigate('Verification')}
        >
          <Text style={styles.verificationBannerText}>
            {user?.verifiedStatus === 'PENDING'
              ? "⏳  NID under review — you'll appear in searches once verified"
              : '⚠️  Upload your NID to become a verified donor'}
          </Text>
          <Text style={styles.verificationBannerLink}>Verify now →</Text>
        </TouchableOpacity>
      )}

      {/* ── Eligibility fetch error banner ──────────────────────────────── */}
      {fetchError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>Couldn't load eligibility status.</Text>
          <TouchableOpacity onPress={fetchEligibility}>
            <Text style={styles.errorBannerLink}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Eligibility card ────────────────────────────────────────────── */}
      <View style={[styles.eligibilityCard, isAvailable ? styles.eligibleCard : styles.ineligibleCard]}>
        {isAvailable ? (
          <>
            <Text style={styles.eligibilityIcon}>✅</Text>
            <Text style={styles.eligibilityTitle}>You can donate!</Text>
            <Text style={styles.eligibilitySubtitle}>You are eligible to donate blood today.</Text>
          </>
        ) : (
          <>
            <Text style={styles.eligibilityIcon}>⏳</Text>
            <Text style={styles.eligibilityTitle}>
              {eligibility?.daysRemaining ?? '?'} day{(eligibility?.daysRemaining ?? 1) !== 1 ? 's' : ''} remaining
            </Text>
            <Text style={styles.eligibilitySubtitle}>
              Last donated: {formatDate(eligibility?.lastDonatedAt)}{'\n'}
              Eligible again: {formatDate(eligibility?.eligibleAgainAt)}
            </Text>
          </>
        )}
      </View>

      {/* ── Updated-ago indicator ───────────────────────────────────────── */}
      {lastFetchedAt && (
        <Text style={styles.updatedAgo}>Updated {timeAgo(lastFetchedAt)}</Text>
      )}

      {/* ── Availability toggle ─────────────────────────────────────────── */}
      <View style={[styles.row, isLocked && styles.rowDisabled]}>
        <View style={styles.rowText}>
          <Text style={styles.rowLabel}>Show me as available</Text>
          <Text style={styles.rowSub}>
            {isLocked
              ? `You're locked from donating until ${formatDate(eligibleAgainAt)} (120-day post-donation wait).`
              : "Turn off if you're traveling or unavailable"}
          </Text>
        </View>
        <Switch
          value={isAvailable ?? true}
          onValueChange={handleAvailabilityToggle}
          trackColor={{ true: COLORS.primary }}
          disabled={toggling || isLocked}
        />
      </View>

      {/* ── Quick actions ───────────────────────────────────────────────── */}
      <TouchableOpacity
        style={styles.requestButton}
        onPress={() => navigation.navigate('RequestBlood')}
      >
        <Text style={styles.requestButtonText}>🩸  Request Blood for Someone</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => navigation.getParent()?.navigate('Browse')}
      >
        <Text style={styles.secondaryButtonText}>🔍  Browse Open Requests</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: COLORS.background },
  content:    { padding: 16, gap: 12 },
  centered:   { flex: 1, alignItems: 'center', justifyContent: 'center' },

  profileCard: {
    backgroundColor: COLORS.primary,
    borderRadius:    14,
    padding:         20,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
  },
  profileInfo:  { flex: 1 },
  userName:     { fontSize: 22, fontWeight: '700', color: COLORS.white },
  userDistrict: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  bloodBadge: {
    width:           56,
    height:          56,
    borderRadius:    28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  bloodBadgeText: { fontSize: 18, fontWeight: '800', color: COLORS.white },

  errorBanner: {
    backgroundColor: COLORS.primaryLight,
    borderRadius:    10,
    paddingVertical:   10,
    paddingHorizontal: 14,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
  },
  errorBannerText: { fontSize: 13, color: COLORS.primaryDark, flex: 1 },
  errorBannerLink: { fontSize: 13, color: COLORS.primaryDark, fontWeight: '700', marginLeft: 12 },

  updatedAgo: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center' },

  verificationBanner: {
    backgroundColor: '#FEF3C7',
    borderRadius:    12,
    padding:         14,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
  },
  verificationBannerText: { fontSize: 13, color: '#92400E' },
  verificationBannerLink: { fontSize: 13, color: COLORS.warning, fontWeight: '700', marginTop: 4 },

  eligibilityCard: {
    borderRadius:   14,
    padding:        20,
    alignItems:     'center',
  },
  eligibleCard:   { backgroundColor: '#DCFCE7' },
  ineligibleCard: { backgroundColor: '#FEE2E2' },
  eligibilityIcon:     { fontSize: 32, marginBottom: 8 },
  eligibilityTitle:    { fontSize: 20, fontWeight: '700', color: COLORS.text },
  eligibilitySubtitle: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', marginTop: 4 },

  row: {
    backgroundColor: COLORS.white,
    borderRadius:    12,
    padding:         16,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
  },
  rowDisabled: { opacity: 0.5 },
  rowText:  { flex: 1, marginRight: 12 },
  rowLabel: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  rowSub:   { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },

  requestButton: {
    backgroundColor: COLORS.primary,
    borderRadius:    12,
    padding:         18,
    alignItems:      'center',
    marginTop:       8,
  },
  requestButtonText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },

  secondaryButton: {
    borderWidth:  1,
    borderColor:  COLORS.primary,
    borderRadius: 12,
    padding:      16,
    alignItems:   'center',
  },
  secondaryButtonText: { color: COLORS.primary, fontSize: 15, fontWeight: '700' },
});
