// screens/DonorAcceptedScreen.js
//
// Shows all requests the logged-in user has accepted as a donor.
//
// For each accepted request:
//   - Blood group, hospital, requester name
//   - "Call Requester" button → POST /api/call/initiate → shows requesterProxyNumber
//   - "End Call" button when a proxy session is active
//   - Status badge (ACCEPTED = waiting to donate, DONATED = confirmed)

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import api from '../services/api';
import { COLORS } from '../config';
import { formatBloodGroup, formatRequestStatus, timeAgo } from '../utils/formatters';

export default function DonorAcceptedScreen() {
  const navigation = useNavigation();
  const [responses, setResponses] = useState([]);
  const [loading, setLoading]     = useState(true);
  // Track active call sessions locally: { [responseId]: sessionId }
  const [activeSessions, setActiveSessions] = useState({});
  const [callingId, setCallingId]           = useState(null);
  const [endingId, setEndingId]             = useState(null);
  // revealState: { [responseId]: { donorRevealed, requesterRevealed, requesterPhone } }
  const [revealState, setRevealState]       = useState({});
  const [revealingId, setRevealingId]       = useState(null);

  useEffect(() => {
    fetchMyResponses();
  }, []);

  const onRefresh = useCallback(() => fetchMyResponses(), []);

  async function fetchMyResponses() {
    try {
      setLoading(true);
      const res = await api.get('/donors/my-responses');
      const responseList = res.data.responses ?? [];
      setResponses(responseList);
      // Seed activeSessions and revealState from DB
      const sessions = {};
      const reveals  = {};
      for (const r of responseList) {
        if (r.proxySessionId) sessions[r.id] = r.proxySessionId;
        reveals[r.id] = {
          donorRevealed:     r.donorRevealed     ?? false,
          requesterRevealed: r.requesterRevealed ?? false,
          requesterPhone:    (r.donorRevealed && r.requesterRevealed) ? r.request?.requester?.phone : null,
        };
      }
      setActiveSessions(sessions);
      setRevealState(reveals);
    } catch (err) {
      Alert.alert('Error', 'Could not load your accepted requests.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCall(response) {
    setCallingId(response.id);
    try {
      const res = await api.post('/call/initiate', { requestId: response.requestId });
      // Store the session locally so End Call button appears immediately
      setActiveSessions((prev) => ({ ...prev, [response.id]: res.data.sessionId }));
      Alert.alert(
        '📞 Call via proxy number',
        `Call this number to reach the requester:\n\n${res.data.requesterProxyNumber}\n\nNeither of you will see each other's real number.`,
        [{ text: 'Got it' }]
      );
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not initiate call.');
    } finally {
      setCallingId(null);
    }
  }

  async function handleEndCall(response) {
    const sessionId = activeSessions[response.id];
    if (!sessionId) return;

    setEndingId(response.id);
    try {
      await api.delete(`/call/${sessionId}`);
      setActiveSessions((prev) => {
        const next = { ...prev };
        delete next[response.id];
        return next;
      });
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not end call session.');
    } finally {
      setEndingId(null);
    }
  }

  async function handleReveal(response) {
    setRevealingId(response.id);
    try {
      const res = await api.post(`/call/${response.requestId}/reveal`);
      setRevealState((prev) => ({
        ...prev,
        [response.id]: {
          donorRevealed:     true,
          requesterRevealed: res.data.otherRevealed,
          requesterPhone:    res.data.phone,
        },
      }));
      if (res.data.phone) {
        Alert.alert('🔓 Both numbers revealed!', `Requester's number: ${res.data.phone}`);
      } else {
        Alert.alert('📱 Number shared', "You've shared your number. You'll be notified when the requester shares theirs.");
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not share number.');
    } finally {
      setRevealingId(null);
    }
  }

  function renderResponse({ item }) {
    const req    = item.request;
    const status = formatRequestStatus(req?.status);
    const sessionActive = !!activeSessions[item.id];
    const isDonated     = item.status === 'DONATED';
    const reveal        = revealState[item.id] || {};

    return (
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.bloodBadge}>
            <Text style={styles.bloodBadgeText}>{formatBloodGroup(req?.bloodGroup)}</Text>
          </View>
          <View style={styles.cardTitles}>
            <Text style={styles.hospitalName}>{req?.hospitalName || 'Hospital'}</Text>
            <Text style={styles.meta}>
              {req?.requester?.name || 'Requester'} · {timeAgo(item.respondedAt)}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: status.color + '22' }]}>
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>

        {/* Donation confirmed badge */}
        {isDonated && (
          <View style={styles.donatedBanner}>
            <Text style={styles.donatedText}>✅ Donation confirmed — thank you!</Text>
          </View>
        )}

        {/* Call actions — only when request is still MATCHED (not yet fulfilled) */}
        {!isDonated && req?.status === 'MATCHED' && (
          <View style={styles.actions}>
            {/* Chat button — always available while matched */}
            <TouchableOpacity
              style={styles.chatBtn}
              onPress={() => {
                if (!item?.requestId) return;
                navigation.navigate('Chat', {
                  requestId: item.requestId,
                  otherName: req?.requester?.name || 'Requester',
                });
              }}
            >
              <Text style={styles.chatBtnText}>💬  Chat with Requester</Text>
            </TouchableOpacity>

            {sessionActive ? (
              <TouchableOpacity
                style={styles.endCallBtn}
                onPress={() => handleEndCall(item)}
                disabled={endingId === item.id}
              >
                {endingId === item.id
                  ? <ActivityIndicator size="small" color="#EF4444" />
                  : <Text style={styles.endCallBtnText}>⏹  End Call Session</Text>
                }
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.callBtn}
                onPress={() => handleCall(item)}
                disabled={callingId === item.id}
              >
                {callingId === item.id
                  ? <ActivityIndicator size="small" color={COLORS.primary} />
                  : <Text style={styles.callBtnText}>📞  Call Requester</Text>
                }
              </TouchableOpacity>
            )}

            {/* Mutual phone reveal */}
            {!reveal.donorRevealed ? (
              <TouchableOpacity
                style={styles.revealBtn}
                onPress={() => handleReveal(item)}
                disabled={revealingId === item.id}
              >
                {revealingId === item.id
                  ? <ActivityIndicator size="small" color={COLORS.primary} />
                  : <Text style={styles.revealBtnText}>👁  Share my number</Text>
                }
              </TouchableOpacity>
            ) : reveal.requesterPhone ? (
              <View style={styles.revealedBox}>
                <Text style={styles.revealedLabel}>Requester's number</Text>
                <Text style={styles.revealedPhone}>{reveal.requesterPhone}</Text>
              </View>
            ) : (
              <Text style={styles.revealPending}>You shared your number — waiting for requester…</Text>
            )}
          </View>
        )}
      </View>
    );
  }

  if (loading && responses.length === 0) {
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
      data={responses}
      keyExtractor={(item) => item.id}
      renderItem={renderResponse}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🩸</Text>
          <Text style={styles.emptyTitle}>No accepted requests yet</Text>
          <Text style={styles.emptySubtitle}>
            When you accept a blood request, it will appear here so you can call the requester.
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content:   { padding: 16, gap: 12, paddingBottom: 40 },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center' },

  card: {
    backgroundColor: COLORS.white,
    borderRadius:    14,
    padding:         16,
    gap:             12,
  },
  cardHeader:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bloodBadge: {
    width:           44,
    height:          44,
    borderRadius:    22,
    backgroundColor: COLORS.primaryLight,
    alignItems:      'center',
    justifyContent:  'center',
  },
  bloodBadgeText: { fontSize: 16, fontWeight: '800', color: COLORS.primary },
  cardTitles:     { flex: 1 },
  hospitalName:   { fontSize: 15, fontWeight: '700', color: COLORS.text },
  meta:           { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },

  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  statusText:  { fontSize: 11, fontWeight: '700' },

  donatedBanner: {
    backgroundColor: '#DCFCE7',
    borderRadius:    8,
    padding:         10,
  },
  donatedText: { fontSize: 13, color: '#15803D', fontWeight: '600' },

  actions: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12, gap: 8 },

  chatBtn: {
    borderWidth:  1,
    borderColor:  COLORS.border,
    borderRadius: 10,
    padding:      12,
    alignItems:   'center',
  },
  chatBtnText: { color: COLORS.text, fontWeight: '600', fontSize: 14 },

  callBtn: {
    borderWidth:  1,
    borderColor:  COLORS.primary,
    borderRadius: 10,
    padding:      12,
    alignItems:   'center',
  },
  callBtnText: { color: COLORS.primary, fontWeight: '600', fontSize: 14 },

  endCallBtn: {
    borderWidth:  1,
    borderColor:  '#EF4444',
    borderRadius: 10,
    padding:      12,
    alignItems:   'center',
  },
  endCallBtnText: { color: '#EF4444', fontWeight: '600', fontSize: 14 },

  revealBtn: {
    borderWidth:  1,
    borderColor:  COLORS.primary,
    borderRadius: 10,
    padding:      12,
    alignItems:   'center',
    marginTop:    8,
  },
  revealBtnText:  { color: COLORS.primary, fontWeight: '600', fontSize: 14 },
  revealedBox: {
    backgroundColor: '#DCFCE7',
    borderRadius:    10,
    padding:         12,
    marginTop:       8,
  },
  revealedLabel: { fontSize: 12, color: '#15803D', marginBottom: 2 },
  revealedPhone: { fontSize: 16, fontWeight: '700', color: '#15803D' },
  revealPending: { fontSize: 13, color: COLORS.textMuted, fontStyle: 'italic', marginTop: 8, textAlign: 'center' },

  emptyState:    { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyIcon:     { fontSize: 48, marginBottom: 16 },
  emptyTitle:    { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptySubtitle: { fontSize: 14, color: COLORS.textMuted, marginTop: 6, textAlign: 'center', lineHeight: 20 },
});
