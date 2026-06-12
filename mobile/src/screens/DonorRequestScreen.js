// screens/DonorRequestScreen.js
//
// Shown to a DONOR who taps a push notification for a blood request.
//
// Flow:
//   1. Push notification arrives: { requestId, screen: 'RequestDetail' }
//   2. usePushNotifications.js taps listener navigates here with requestId
//   3. Screen fetches full request details from GET /api/requests/:id
//   4. Donor taps "Accept" → POST /api/requests/:id/accept
//   5. On success: navigate back; donor can then open a 1-hour chat from My Donations

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { COLORS } from '../config';
import { formatBloodGroup, timeAgo } from '../utils/formatters';

const CLOSED_MESSAGES = {
  MATCHED:   'Already matched with another donor.',
  FULFILLED: 'Donation completed for this request.',
  EXPIRED:   'This request has expired.',
};

export default function DonorRequestScreen({ route, navigation }) {
  const { requestId } = route.params;
  const user = useAuthStore((s) => s.user);
  const userBloodGroup = user?.bloodGroup;

  // Locked = manually unavailable, or inside the 120-day post-donation wait.
  // Backend remains source of truth; this is a UX hint.
  const lockedUntil = user?.eligibleAgainAt ? new Date(user.eligibleAgainAt) : null;
  const isLocked    = !user?.isAvailable || (lockedUntil && lockedUntil > new Date());

  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    fetchRequest();
  }, [requestId]);

  async function fetchRequest() {
    try {
      const res = await api.get(`/requests/${requestId}`);
      setRequest(res.data.request);
    } catch (err) {
      console.error('[DonorRequest]', err.message);
      Alert.alert('Error', 'Could not load request details.', [
        { text: 'Go back', onPress: () => navigation.goBack() },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept() {
    if (isLocked) {
      const dateStr = lockedUntil ? lockedUntil.toDateString() : null;
      Alert.alert(
        'You are locked',
        dateStr
          ? `You can donate again on ${dateStr}.`
          : 'You are not available to donate. Enable availability in your profile first.',
      );
      return;
    }
    Alert.alert(
      'Accept this request?',
      'You are committing to go to the hospital and donate blood. The requester will be notified.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, I will donate',
          onPress: async () => {
            setAccepting(true);
            try {
              await api.post(`/requests/${requestId}/accept`);
              Alert.alert(
                'Thank you!',
                'You have accepted this request. Please proceed to the hospital as soon as possible.',
                [{ text: 'OK', onPress: () => navigation.goBack() }]
              );
            } catch (err) {
              console.error('[DonorRequest]', err.message);
              Alert.alert('Error', err.response?.data?.error || 'Could not accept request.');
            } finally {
              setAccepting(false);
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!request) return null;

  const isOpen = request.status === 'OPEN';
  const matches = userBloodGroup && userBloodGroup === request.bloodGroup;
  const closedMessage = CLOSED_MESSAGES[request.status] || 'This request is no longer open.';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Urgency header */}
      <View style={styles.urgencyBanner}>
        <Text style={styles.urgencyIcon}>🆘</Text>
        <Text style={styles.urgencyText}>Urgent blood needed nearby</Text>
        <Text style={styles.urgencyTime}>{timeAgo(request.createdAt)}</Text>
      </View>

      {/* Match indicator */}
      {userBloodGroup && (
        <View style={[styles.matchBanner, matches ? styles.matchOk : styles.matchMismatch]}>
          <Text style={[styles.matchText, matches ? styles.matchTextOk : styles.matchTextMismatch]}>
            {matches
              ? `✓ You can donate ${formatBloodGroup(request.bloodGroup)} blood`
              : `Requires ${formatBloodGroup(request.bloodGroup)} donors — your group is ${formatBloodGroup(userBloodGroup)}`}
          </Text>
        </View>
      )}

      {/* Blood group */}
      <View style={styles.bloodGroupCard}>
        <Text style={styles.bloodGroupLabel}>Blood Group Required</Text>
        <Text style={styles.bloodGroupValue}>{formatBloodGroup(request.bloodGroup)}</Text>
      </View>

      {/* Request details */}
      <View style={styles.detailsCard}>
        <DetailRow icon="🏥" label="Hospital" value={request.hospitalName} />
        <DetailRow icon="💉" label="Units needed" value={`${request.unitsNeeded} unit(s)`} />
        {request.requester?.district && (
          <DetailRow icon="📍" label="District" value={request.requester.district} />
        )}
        <DetailRow
          icon="👤"
          label="Requested by"
          value={request.requester?.name || 'Anonymous'}
        />
      </View>

      {/* What happens next */}
      {isOpen && matches && (
        <View style={styles.stepsCard}>
          <Text style={styles.stepsHeader}>What happens next</Text>
          <Step n={1} text="Tap Accept to confirm you can donate" />
          <Step n={2} text="A 1-hour chat opens with the requester" />
          <Step n={3} text={`Go to ${request.hospitalName} as soon as possible`} />
        </View>
      )}

      {/* Status / action */}
      {isOpen && matches ? (
        isLocked ? (
          <View style={styles.lockedBanner}>
            <Text style={styles.lockedBannerText}>
              {lockedUntil
                ? `You can donate again on ${lockedUntil.toDateString()}.`
                : 'You are marked unavailable. Enable availability in your profile first.'}
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.acceptButton, accepting && styles.buttonDisabled]}
            onPress={handleAccept}
            disabled={accepting}
          >
            {accepting
              ? <ActivityIndicator color={COLORS.white} />
              : <Text style={styles.acceptButtonText}>I will donate blood</Text>
            }
          </TouchableOpacity>
        )
      ) : !isOpen ? (
        <View style={styles.closedBanner}>
          <Text style={styles.closedText}>{closedMessage}</Text>
        </View>
      ) : null}

      <Text style={styles.disclaimer}>
        By accepting, you agree to go to the hospital and donate blood as soon as possible.
        You can chat with the requester for an hour after accepting.
      </Text>

    </ScrollView>
  );
}

function Step({ n, text }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{n}</Text></View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

function DetailRow({ icon, label, value }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailIcon}>{icon}</Text>
      <View style={styles.detailText}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content:   { padding: 16, gap: 12, paddingBottom: 40 },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center' },

  urgencyBanner: {
    backgroundColor: '#FEE2E2',
    borderRadius:    14,
    padding:         16,
    alignItems:      'center',
    gap:             4,
  },
  urgencyIcon: { fontSize: 32 },
  urgencyText: { fontSize: 17, fontWeight: '700', color: '#991B1B' },
  urgencyTime: { fontSize: 12, color: '#B91C1C' },

  matchBanner: { borderRadius: 10, padding: 12 },
  matchOk:       { backgroundColor: '#DCFCE7' },
  matchMismatch: { backgroundColor: '#FEE2E2' },
  matchText:         { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  matchTextOk:       { color: '#15803D' },
  matchTextMismatch: { color: '#B91C1C' },

  stepsCard: {
    backgroundColor: COLORS.white, borderRadius: 14, padding: 16, gap: 12,
  },
  stepsHeader: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  stepRow:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepNumber: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  stepNumberText: { color: COLORS.white, fontWeight: '700', fontSize: 13 },
  stepText:       { flex: 1, fontSize: 14, color: COLORS.text },

  bloodGroupCard: {
    backgroundColor: COLORS.primary,
    borderRadius:    14,
    padding:         20,
    alignItems:      'center',
  },
  bloodGroupLabel: { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '600', textTransform: 'uppercase' },
  bloodGroupValue: { fontSize: 42, fontWeight: '900', color: COLORS.white, marginTop: 4 },

  detailsCard: {
    backgroundColor: COLORS.white,
    borderRadius:    14,
    padding:         16,
    gap:             12,
  },
  detailRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  detailIcon: { fontSize: 20, marginTop: 2 },
  detailText: { flex: 1 },
  detailLabel: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600', textTransform: 'uppercase' },
  detailValue: { fontSize: 15, color: COLORS.text, fontWeight: '600', marginTop: 2 },

  acceptButton: {
    backgroundColor: COLORS.success,
    borderRadius:    12,
    padding:         18,
    minHeight:       44,
    alignItems:      'center',
    justifyContent:  'center',
    marginTop:       8,
  },
  acceptButtonText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },
  buttonDisabled:   { opacity: 0.6 },

  closedBanner: {
    backgroundColor: '#F3F4F6',
    borderRadius:    12,
    padding:         16,
    alignItems:      'center',
  },
  closedText: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center' },

  lockedBanner: {
    backgroundColor: '#FEF3C7',
    borderRadius:    12,
    padding:         14,
    alignItems:      'center',
    marginTop:       8,
  },
  lockedBannerText: { fontSize: 14, color: '#92400E', fontWeight: '600', textAlign: 'center' },

  disclaimer: {
    fontSize:   12,
    color:      COLORS.textMuted,
    textAlign:  'center',
    lineHeight: 18,
    marginTop:  8,
  },
});
