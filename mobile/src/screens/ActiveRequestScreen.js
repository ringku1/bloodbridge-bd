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
          <Text style={styles.waitingText}>⏳ Waiting for a donor to accept…</Text>
        ) : (
          acceptedDonors.map((response) => {
            const donorId = response.donorId;
            const isFav   = favourites.has(donorId);
            return (
              <View key={response.id} style={styles.donorRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.donorName}>{response.donor?.name || 'Donor'}</Text>
                  <Text style={styles.donorVerified}>
                    {response.donor?.verifiedStatus === 'VERIFIED' ? '✅ Verified' : '⚠️ Unverified'}
                  </Text>
                </View>
                <View style={styles.donorActions}>
                  <TouchableOpacity
                    style={styles.chatBtn}
                    onPress={() => {
                      if (!req?.id) return;
                      navigation.navigate('Chat', {
                        requestId: req.id,
                        otherName: response.donor?.name || 'Donor',
                      });
                    }}
                  >
                    <Text style={styles.chatBtnText}>💬</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.favBtn}
                    onPress={() => toggleFavourite(donorId)}
                  >
                    <Text style={styles.favBtnText}>{isFav ? '♥' : '♡'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.confirmBtn}
                    onPress={() => handleConfirmDonation(req.id, donorId)}
                    disabled={confirmingId === donorId}
                  >
                    {confirmingId === donorId
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
    backgroundColor: COLORS.white, borderRadius: 14, padding: 16, gap: 12,
  },
  requestHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hospitalName:  { fontSize: 16, fontWeight: '700', color: COLORS.text },
  requestMeta:   { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },

  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText:  { fontSize: 12, fontWeight: '700' },

  escalationNote: { backgroundColor: '#FEF3C7', borderRadius: 8, padding: 10 },
  escalationText: { fontSize: 13, color: '#92400E' },

  waitingText: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', paddingVertical: 8 },

  donorRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12,
  },
  donorName:     { fontSize: 15, fontWeight: '600', color: COLORS.text },
  donorVerified: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },

  donorActions: { flexDirection: 'row', gap: 8 },
  chatBtn: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  chatBtnText: { fontSize: 16 },
  favBtn: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  favBtnText: { fontSize: 16, color: COLORS.primary },
  confirmBtn: {
    backgroundColor: COLORS.success, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  confirmBtnText: { color: COLORS.white, fontWeight: '600', fontSize: 13 },

  emptyState:    { alignItems: 'center', paddingTop: 80 },
  emptyIcon:     { fontSize: 48, marginBottom: 16 },
  emptyTitle:    { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptySubtitle: { fontSize: 14, color: COLORS.textMuted, marginTop: 4 },
});
