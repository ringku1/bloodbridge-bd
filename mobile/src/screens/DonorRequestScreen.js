// screens/DonorRequestScreen.js
//
// Shown to a DONOR who taps a push notification for a blood request.
//
// Flow:
//   1. Push notification arrives: { requestId, screen: 'RequestDetail' }
//   2. usePushNotifications.js taps listener navigates here with requestId
//   3. Screen fetches full request details from GET /api/requests/:id
//   4. Donor taps "Accept" → POST /api/requests/:id/accept
//   5. On success: navigate back + show proxy call instructions

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import api from '../services/api';
import { COLORS } from '../config';
import { formatBloodGroup, timeAgo } from '../utils/formatters';

export default function DonorRequestScreen({ route, navigation }) {
  const { requestId } = route.params;

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
      Alert.alert('Error', 'Could not load request details.', [
        { text: 'Go back', onPress: () => navigation.goBack() },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept() {
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Urgency header */}
      <View style={styles.urgencyBanner}>
        <Text style={styles.urgencyIcon}>🆘</Text>
        <Text style={styles.urgencyText}>Urgent blood needed nearby</Text>
        <Text style={styles.urgencyTime}>{timeAgo(request.createdAt)}</Text>
      </View>

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

      {/* Status / action */}
      {isOpen ? (
        <TouchableOpacity
          style={[styles.acceptButton, accepting && styles.buttonDisabled]}
          onPress={handleAccept}
          disabled={accepting}
        >
          {accepting
            ? <ActivityIndicator color={COLORS.white} />
            : <Text style={styles.acceptButtonText}>✅  I will donate blood</Text>
          }
        </TouchableOpacity>
      ) : (
        <View style={styles.closedBanner}>
          <Text style={styles.closedText}>
            This request is no longer open ({request.status.toLowerCase()}).
          </Text>
        </View>
      )}

      <Text style={styles.disclaimer}>
        By accepting, you agree to go to the hospital and donate blood as soon as possible.
        Your phone number will never be shared directly — calls are routed through a secure proxy.
      </Text>

    </ScrollView>
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
    alignItems:      'center',
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

  disclaimer: {
    fontSize:   12,
    color:      COLORS.textMuted,
    textAlign:  'center',
    lineHeight: 18,
    marginTop:  8,
  },
});
