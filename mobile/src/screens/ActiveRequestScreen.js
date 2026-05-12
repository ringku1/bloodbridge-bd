// screens/ActiveRequestScreen.js
//
// The requester tracks their open blood request here.
//
// Shows:
//   - Request status badge (OPEN → MATCHED → FULFILLED)
//   - List of donors who accepted (status = ACCEPTED)
//   - For each accepted donor:
//       "Call" button → POST /api/call/initiate → shows proxy phone number
//       "Confirm donation" button → POST /api/requests/:id/confirm
//   - Escalation info (who was notified, radius expanded, caregivers SMSed)

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import api from '../services/api';
import { useRequestStore } from '../store/requestStore';
import { COLORS } from '../config';
import { formatBloodGroup, formatRequestStatus, timeAgo } from '../utils/formatters';

export default function ActiveRequestScreen() {
  const navigation = useNavigation();
  const { activeRequests, fetchActiveRequests, loading } = useRequestStore();
  const [confirmingId, setConfirmingId] = useState(null);
  const [callingId, setCallingId]       = useState(null);
  const [endingId, setEndingId]         = useState(null);
  // activeSessions: { [responseId]: sessionId } — populated after a call is initiated
  const [activeSessions, setActiveSessions] = useState({});
  // revealState: { [responseId]: { requesterRevealed, donorRevealed, donorPhone } }
  const [revealState, setRevealState]   = useState({});
  const [revealingId, setRevealingId]   = useState(null);

  useEffect(() => {
    fetchActiveRequests();
  }, []);

  // Seed activeSessions and revealState from DB whenever the list refreshes
  useEffect(() => {
    const sessions = {};
    const reveals  = {};
    for (const req of activeRequests) {
      for (const r of req.responses ?? []) {
        if (r.proxySessionId) sessions[r.id] = r.proxySessionId;
        reveals[r.id] = {
          requesterRevealed: r.requesterRevealed ?? false,
          donorRevealed:     r.donorRevealed     ?? false,
          donorPhone:        (r.requesterRevealed && r.donorRevealed) ? r.donor?.phone : null,
        };
      }
    }
    setActiveSessions(sessions);
    setRevealState(reveals);
  }, [activeRequests]);

  const onRefresh = useCallback(() => fetchActiveRequests(), []);

  async function handleConfirmDonation(requestId, donorId) {
    Alert.alert(
      'Confirm donation',
      'Has this donor actually donated blood? This will lock their account for 120 days.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, confirm',
          style: 'destructive',
          onPress: async () => {
            setConfirmingId(donorId);
            try {
              await api.post(`/requests/${requestId}/confirm`, { donorId });
              Alert.alert('Thank you!', 'Donation confirmed. The donor will be eligible again in 120 days.');
              fetchActiveRequests(); // refresh list
            } catch (err) {
              Alert.alert('Error', err.response?.data?.error || 'Failed to confirm donation.');
            } finally {
              setConfirmingId(null);
            }
          },
        },
      ]
    );
  }

  async function handleCall(requestId, responseId) {
    setCallingId(requestId);
    try {
      const res = await api.post('/call/initiate', { requestId });
      setActiveSessions((prev) => ({ ...prev, [responseId]: res.data.sessionId }));
      Alert.alert(
        '📞 Call via proxy number',
        `Call this number to reach the donor:\n\n${res.data.donorProxyNumber}\n\nNeither of you will see each other's real number.`,
        [{ text: 'Got it' }]
      );
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not initiate call.');
    } finally {
      setCallingId(null);
    }
  }

  async function handleEndCall(responseId, sessionId) {
    setEndingId(responseId);
    try {
      await api.delete(`/call/${sessionId}`);
      setActiveSessions((prev) => {
        const next = { ...prev };
        delete next[responseId];
        return next;
      });
      fetchActiveRequests();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not end call session.');
    } finally {
      setEndingId(null);
    }
  }

  async function handleReveal(requestId, responseId) {
    setRevealingId(responseId);
    try {
      const res = await api.post(`/call/${requestId}/reveal`);
      setRevealState((prev) => ({
        ...prev,
        [responseId]: {
          requesterRevealed: true,
          donorRevealed:     res.data.otherRevealed,
          donorPhone:        res.data.phone,
        },
      }));
      if (res.data.phone) {
        Alert.alert('🔓 Both numbers revealed!', `Donor's number: ${res.data.phone}`);
      } else {
        Alert.alert('📱 Number shared', "You've shared your number. You'll be notified when the donor shares theirs.");
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not share number.');
    } finally {
      setRevealingId(null);
    }
  }

  function renderRequest({ item: req }) {
    const status = formatRequestStatus(req.status);
    const acceptedDonors = req.responses?.filter((r) => r.status === 'ACCEPTED') || [];

    return (
      <View style={styles.requestCard}>
        {/* Header */}
        <View style={styles.requestHeader}>
          <View>
            <Text style={styles.hospitalName}>{req.hospitalName}</Text>
            <Text style={styles.requestMeta}>
              {formatBloodGroup(req.bloodGroup)} · {req.unitsNeeded} unit(s) · {timeAgo(req.createdAt)}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: status.color + '22' }]}>
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>

        {/* Escalation info */}
        {req.escalationLevel > 0 && (
          <View style={styles.escalationNote}>
            <Text style={styles.escalationText}>
              {req.escalationLevel === 1
                ? '⚡ Search expanded to 15km radius'
                : '📲 Caregivers have been notified via SMS'}
            </Text>
          </View>
        )}

        {/* Accepted donors */}
        {acceptedDonors.length === 0 ? (
          <Text style={styles.waitingText}>⏳ Waiting for a donor to accept…</Text>
        ) : (
          acceptedDonors.map((response) => {
            const sessionId     = activeSessions[response.id];
            const sessionActive = !!sessionId;
            const reveal        = revealState[response.id] || {};
            return (
              <View key={response.id} style={styles.donorRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.donorName}>{response.donor?.name || 'Donor'}</Text>
                  <Text style={styles.donorVerified}>
                    {response.donor?.verifiedStatus === 'VERIFIED' ? '✅ Verified' : '⚠️ Unverified'}
                  </Text>
                  {reveal.donorPhone ? (
                    <Text style={styles.revealedPhone}>📞 {reveal.donorPhone}</Text>
                  ) : reveal.requesterRevealed && !reveal.donorRevealed ? (
                    <Text style={styles.revealPending}>Waiting for donor to share…</Text>
                  ) : null}
                </View>
                <View style={styles.donorActions}>
                  {sessionActive ? (
                    <TouchableOpacity
                      style={styles.endCallBtn}
                      onPress={() => handleEndCall(response.id, sessionId)}
                      disabled={endingId === response.id}
                    >
                      {endingId === response.id
                        ? <ActivityIndicator size="small" color="#EF4444" />
                        : <Text style={styles.endCallBtnText}>⏹ End</Text>
                      }
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.callBtn}
                      onPress={() => handleCall(req.id, response.id)}
                      disabled={callingId === req.id}
                    >
                      {callingId === req.id
                        ? <ActivityIndicator size="small" color={COLORS.primary} />
                        : <Text style={styles.callBtnText}>📞 Call</Text>
                      }
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.chatBtn}
                    onPress={() => navigation.navigate('Chat', {
                      requestId: req.id,
                      otherName: response.donor?.name || 'Donor',
                    })}
                  >
                    <Text style={styles.chatBtnText}>💬</Text>
                  </TouchableOpacity>

                  {!reveal.requesterRevealed && (
                    <TouchableOpacity
                      style={styles.revealBtn}
                      onPress={() => handleReveal(req.id, response.id)}
                      disabled={revealingId === response.id}
                    >
                      {revealingId === response.id
                        ? <ActivityIndicator size="small" color={COLORS.primary} />
                        : <Text style={styles.revealBtnText}>👁 Share #</Text>
                      }
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.confirmBtn}
                    onPress={() => handleConfirmDonation(req.id, response.donorId)}
                    disabled={confirmingId === response.donorId}
                  >
                    {confirmingId === response.donorId
                      ? <ActivityIndicator size="small" color={COLORS.white} />
                      : <Text style={styles.confirmBtnText}>✓ Confirm</Text>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </View>
    );
  }

  if (loading && activeRequests.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={activeRequests}
      keyExtractor={(item) => item.id}
      renderItem={renderRequest}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🩸</Text>
          <Text style={styles.emptyTitle}>No active requests</Text>
          <Text style={styles.emptySubtitle}>Your open blood requests will appear here.</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: COLORS.background },
  content:    { padding: 16, gap: 12, paddingBottom: 40 },
  centered:   { flex: 1, alignItems: 'center', justifyContent: 'center' },

  requestCard: {
    backgroundColor: COLORS.white,
    borderRadius:    14,
    padding:         16,
    gap:             12,
  },
  requestHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hospitalName:  { fontSize: 16, fontWeight: '700', color: COLORS.text },
  requestMeta:   { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },

  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText:  { fontSize: 12, fontWeight: '700' },

  escalationNote: {
    backgroundColor: '#FEF3C7',
    borderRadius:    8,
    padding:         10,
  },
  escalationText: { fontSize: 13, color: '#92400E' },

  waitingText: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', paddingVertical: 8 },

  donorRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop:     12,
  },
  donorName:     { fontSize: 15, fontWeight: '600', color: COLORS.text },
  donorVerified: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },

  donorActions: { flexDirection: 'row', gap: 8 },
  callBtn: {
    borderWidth:  1,
    borderColor:  COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical:   8,
  },
  callBtnText:   { color: COLORS.primary, fontWeight: '600', fontSize: 13 },
  endCallBtn: {
    borderWidth:  1,
    borderColor:  '#EF4444',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical:   8,
  },
  endCallBtnText: { color: '#EF4444', fontWeight: '600', fontSize: 13 },
  confirmBtn: {
    backgroundColor: COLORS.success,
    borderRadius:    8,
    paddingHorizontal: 12,
    paddingVertical:   8,
  },
  confirmBtnText: { color: COLORS.white, fontWeight: '600', fontSize: 13 },

  emptyState:    { alignItems: 'center', paddingTop: 80 },
  emptyIcon:     { fontSize: 48, marginBottom: 16 },
  emptyTitle:    { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptySubtitle: { fontSize: 14, color: COLORS.textMuted, marginTop: 4 },

  chatBtn: {
    borderWidth:  1,
    borderColor:  COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical:   8,
  },
  chatBtnText: { fontSize: 16 },

  revealBtn: {
    borderWidth:  1,
    borderColor:  COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical:   8,
  },
  revealBtnText:  { color: COLORS.primary, fontWeight: '600', fontSize: 13 },
  revealedPhone:  { fontSize: 13, color: COLORS.success, fontWeight: '700', marginTop: 4 },
  revealPending:  { fontSize: 12, color: COLORS.textMuted, marginTop: 4, fontStyle: 'italic' },
});
