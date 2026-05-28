// screens/DonorAcceptedScreen.js
//
// Shows all requests the logged-in user has accepted as a donor.
//
// For each accepted request:
//   - Blood group, hospital, requester name, status
//   - Chat button (1-hour temporary chat)
//   - Heart icon to favourite the requester for later

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
  const [favourites, setFavourites] = useState(new Set()); // requester ids the user has favourited

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    try {
      const [resResp, resFavs] = await Promise.all([
        api.get('/donors/my-responses'),
        api.get('/donors/favourites'),
      ]);
      setResponses(resResp.data.responses ?? []);
      setFavourites(new Set((resFavs.data.favourites ?? []).map((u) => u.id)));
    } catch (err) {
      console.error('[DonorAccepted]', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleFavourite(userId) {
    if (!userId) return;
    const next = new Set(favourites);
    const wasFavourite = next.has(userId);
    if (wasFavourite) next.delete(userId); else next.add(userId);
    setFavourites(next); // optimistic
    try {
      if (wasFavourite) {
        await api.delete(`/donors/favourites/${userId}`);
      } else {
        await api.post(`/donors/favourites/${userId}`);
      }
    } catch (err) {
      console.error('[DonorAccepted/favourite]', err.message);
      Alert.alert('Error', 'Could not update favourite. Try again.');
      setFavourites(favourites); // rollback
    }
  }

  function renderResponse({ item }) {
    const req    = item.request;
    const status = formatRequestStatus(req?.status);
    const isDonated = item.status === 'DONATED';
    const requesterId = req?.requester?.id;
    const isFav = requesterId ? favourites.has(requesterId) : false;

    return (
      <View style={styles.card}>
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

        {isDonated && (
          <View style={styles.donatedBanner}>
            <Text style={styles.donatedText}>✅ Donation confirmed — thank you!</Text>
          </View>
        )}

        {!isDonated && req?.status === 'MATCHED' && (
          <View style={styles.actions}>
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

            {requesterId && (
              <TouchableOpacity
                style={styles.favBtn}
                onPress={() => toggleFavourite(requesterId)}
              >
                <Text style={styles.favBtnText}>
                  {isFav ? '♥  Favourited' : '♡  Add to Favourites'}
                </Text>
              </TouchableOpacity>
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
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchAll} tintColor={COLORS.primary} />}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🩸</Text>
          <Text style={styles.emptyTitle}>No accepted requests yet</Text>
          <Text style={styles.emptySubtitle}>
            When you accept a blood request, it will appear here so you can chat with the requester.
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
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  bloodBadgeText: { fontSize: 16, fontWeight: '800', color: COLORS.primary },
  cardTitles:     { flex: 1 },
  hospitalName:   { fontSize: 15, fontWeight: '700', color: COLORS.text },
  meta:           { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },

  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  statusText:  { fontSize: 11, fontWeight: '700' },

  donatedBanner: { backgroundColor: '#DCFCE7', borderRadius: 8, padding: 10 },
  donatedText:   { fontSize: 13, color: '#15803D', fontWeight: '600' },

  actions: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12, gap: 8 },

  chatBtn: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
    padding: 12, alignItems: 'center',
  },
  chatBtnText: { color: COLORS.text, fontWeight: '600', fontSize: 14 },

  favBtn: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
    padding: 12, alignItems: 'center',
  },
  favBtnText: { color: COLORS.primary, fontWeight: '600', fontSize: 14 },

  emptyState:    { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyIcon:     { fontSize: 48, marginBottom: 16 },
  emptyTitle:    { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptySubtitle: { fontSize: 14, color: COLORS.textMuted, marginTop: 6, textAlign: 'center', lineHeight: 20 },
});
