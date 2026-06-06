// screens/ActiveRequestScreen.js
//
// The requester tracks their open blood request here.
//
// For each request:
//   - Status badge (OPEN → MATCHED → FULFILLED)
//   - List of donors who accepted (status = ACCEPTED)
//   - Chat + Favourite + Confirm donation buttons per donor row
//   - Escalation info (radius expanded, caregivers SMSed)

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
  const [favourites, setFavourites] = useState(new Set());

  useEffect(() => {
    fetchActiveRequests();
    fetchFavourites();
  }, []);

  async function fetchFavourites() {
    try {
      const res = await api.get('/donors/favourites');
      setFavourites(new Set((res.data.favourites ?? []).map((u) => u.id)));
    } catch (err) {
      console.error('[ActiveRequest/favs]', err.message);
    }
  }

  async function toggleFavourite(userId) {
    if (!userId) return;
    const next = new Set(favourites);
    const wasFavourite = next.has(userId);
    if (wasFavourite) next.delete(userId); else next.add(userId);
    setFavourites(next);
    try {
      if (wasFavourite) await api.delete(`/donors/favourites/${userId}`);
      else              await api.post(`/donors/favourites/${userId}`);
    } catch (err) {
      console.error('[ActiveRequest/favourite]', err.message);
      setFavourites(favourites);
      Alert.alert('Error', 'Could not update favourite.');
    }
  }

  const onRefresh = useCallback(() => {
    fetchActiveRequests();
    fetchFavourites();
  }, []);

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
              fetchActiveRequests();
            } catch (err) {
              console.error('[ActiveRequest/confirm]', err.message);
              Alert.alert('Error', err.response?.data?.error || 'Failed to confirm donation.');
            } finally {
              setConfirmingId(null);
            }
          },
        },
      ]
    );
  }

  function renderRequest({ item: req }) {
    const status = formatRequestStatus(req.status);
    const acceptedDonors = req.responses?.filter((r) => r.status === 'ACCEPTED') || [];

    return (
      <View style={styles.requestCard}>
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

        {req.escalationLevel > 0 && (
          <View style={styles.escalationNote}>
            <Text style={styles.escalationText}>
              {req.escalationLevel === 1
                ? '⚡ Search expanded to 15km radius'
                : '📲 Caregivers have been notified via SMS'}
            </Text>
          </View>
        )}

        {acceptedDonors.length === 0 ? (
          <View style={styles.waitingBanner}>
            <Text style={styles.waitingIcon}>⏳</Text>
            <Text style={styles.waitingBannerText}>Waiting for a donor to accept…</Text>
          </View>
        ) : (
          acceptedDonors.map((response) => {
            const donorId = response.donorId;
            const isFav   = favourites.has(donorId);
            const acceptedAt = response.respondedAt || response.notifiedAt;
            return (
              <View key={response.id} style={styles.donorBlock}>
                <View style={styles.donorMeta}>
                  <Text style={styles.donorName}>{response.donor?.name || 'Donor'}</Text>
                  <Text style={styles.donorVerified}>
                    {response.donor?.verifiedStatus === 'VERIFIED' ? '✅ Verified' : 'Unverified'}
                  </Text>
                  {acceptedAt && (
                    <Text style={styles.acceptedAgo}>Accepted {timeAgo(acceptedAt)}</Text>
                  )}
                </View>
                <View style={styles.donorActions}>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => {
                      if (!req?.id) return;
                      navigation.navigate('Chat', {
                        requestId: req.id,
                        otherName: response.donor?.name || 'Donor',
                      });
                    }}
                  >
                    <Text style={styles.actionBtnText}>💬  Chat</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => toggleFavourite(donorId)}
                  >
                    <Text style={styles.actionBtnText}>{isFav ? '♥  Favourited' : '♡  Favourite'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.confirmBtn, confirmingId === donorId && styles.buttonDisabled]}
                    onPress={() => handleConfirmDonation(req.id, donorId)}
                    disabled={confirmingId === donorId}
                  >
                    {confirmingId === donorId
                      ? <ActivityIndicator size="small" color={COLORS.white} />
                      : <Text style={styles.confirmBtnText}>✓  Confirm</Text>
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
    backgroundColor: COLORS.white, borderRadius: 14, padding: 16, gap: 12,
  },
  requestHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hospitalName:  { fontSize: 16, fontWeight: '700', color: COLORS.text },
  requestMeta:   { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },

  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText:  { fontSize: 12, fontWeight: '700' },

  escalationNote: { backgroundColor: '#FEF3C7', borderRadius: 8, padding: 10 },
  escalationText: { fontSize: 13, color: '#92400E' },

  waitingBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FEF3C7', borderRadius: 8, padding: 12, gap: 8,
  },
  waitingIcon:        { fontSize: 18 },
  waitingBannerText:  { fontSize: 14, color: '#92400E', fontWeight: '600', flex: 1 },

  donorBlock: {
    borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12, gap: 10,
  },
  donorMeta:     { gap: 2 },
  donorName:     { fontSize: 15, fontWeight: '600', color: COLORS.text },
  donorVerified: { fontSize: 12, color: COLORS.textMuted },
  acceptedAgo:   { fontSize: 11, color: COLORS.textMuted, fontStyle: 'italic' },

  donorActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1, minHeight: 44,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 8,
  },
  actionBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  confirmBtn: {
    flex: 1, minHeight: 44,
    backgroundColor: COLORS.warning, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 13 },
  buttonDisabled: { opacity: 0.5 },

  emptyState:    { alignItems: 'center', paddingTop: 80 },
  emptyIcon:     { fontSize: 48, marginBottom: 16 },
  emptyTitle:    { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptySubtitle: { fontSize: 14, color: COLORS.textMuted, marginTop: 4 },
});
