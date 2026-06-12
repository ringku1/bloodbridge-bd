// screens/BrowseRequestsScreen.js
//
// All open blood requests across the country.
// Donors can browse and pick one to accept.
//
// Cards whose blood group does not match the donor are dimmed entirely:
// no Accept button, just a "Not your blood group" chip. Matching cards
// keep the vivid red badge and primary-colored Accept button.

import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { formatBloodGroup, timeAgo } from '../utils/formatters';
import { COLORS } from '../config';

export default function BrowseRequestsScreen({ navigation }) {
  const user = useAuthStore((s) => s.user);

  const [requests, setRequests]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState(null);

  // Donor is locked from accepting if they're explicitly unavailable OR within
  // the 120-day post-donation wait. Backend remains source of truth; this is a UX hint.
  const lockedUntil = user?.eligibleAgainAt ? new Date(user.eligibleAgainAt) : null;
  const isLocked    = !user?.isAvailable || (lockedUntil && lockedUntil > new Date());

  async function fetchRequests() {
    try {
      const res = await api.get('/requests/browse');
      setRequests(res.data.requests ?? []);
      setLastFetchedAt(new Date().toISOString());
    } catch (err) {
      console.error('[Browse]', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      fetchRequests();
    }, [])
  );

  async function handleAccept(request) {
    if (request.bloodGroup !== user?.bloodGroup) return;
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
      'Accept request?',
      `Confirm you can donate ${formatBloodGroup(request.bloodGroup)} blood at ${request.hospitalName}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            try {
              await api.post(`/requests/${request.id}/accept`);
              // Optimistically remove the accepted card so a fast user can't double-tap
              setRequests((rs) => rs.filter((r) => r.id !== request.id));
              Alert.alert('Accepted', 'Please proceed to the hospital. Open My Donations to chat.');
              fetchRequests();
            } catch (err) {
              console.error('[Browse/accept]', err.message);
              Alert.alert('Error', err.response?.data?.error || 'Could not accept request.');
            }
          },
        },
      ]
    );
  }

  const renderItem = ({ item }) => {
    const matches = item.bloodGroup === user?.bloodGroup;
    return (
      <View style={[styles.card, !matches && styles.cardDimmed]}>
        <View style={styles.cardHeader}>
          <View style={[styles.bgBadge, matches && styles.bgBadgeMatch]}>
            <Text style={[styles.bgText, matches && styles.bgTextMatch]}>
              {formatBloodGroup(item.bloodGroup)}
            </Text>
          </View>
          <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
        </View>

        <Text style={styles.hospital}>{item.hospitalName}</Text>
        <Text style={styles.meta}>
          {item.requester?.name || 'Anonymous'}{item.requester?.district ? ` • ${item.requester.district}` : ''}
        </Text>
        <Text style={styles.meta}>
          {item.unitsNeeded} unit{item.unitsNeeded !== 1 ? 's' : ''} needed
        </Text>

        {matches ? (
          isLocked ? (
            <View style={styles.lockedChip}>
              <Text style={styles.lockedChipText}>
                {lockedUntil
                  ? `Locked until ${lockedUntil.toDateString()}`
                  : 'You are unavailable'}
              </Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.acceptBtn} onPress={() => handleAccept(item)}>
              <Text style={styles.acceptBtnText}>Accept</Text>
            </TouchableOpacity>
          )
        ) : (
          <View style={styles.notMatchChip}>
            <Text style={styles.notMatchChipText}>Not your blood group</Text>
          </View>
        )}
      </View>
    );
  };

  const listHeader = (
    <View style={styles.header}>
      <Text style={styles.headerCount}>
        {requests.length} open request{requests.length === 1 ? '' : 's'}
      </Text>
      {lastFetchedAt ? (
        <Text style={styles.headerUpdated}>Updated {timeAgo(lastFetchedAt)}</Text>
      ) : null}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <FlatList
      data={requests}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.list}
      ListHeaderComponent={listHeader}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); fetchRequests(); }}
          tintColor={COLORS.primary}
        />
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No open requests right now.</Text>
          <Text style={styles.emptySub}>Pull down to refresh.</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list:   { padding: 16, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty:  { paddingTop: 80, alignItems: 'center' },
  emptyText: { fontSize: 16, color: COLORS.textMuted, fontWeight: '600' },
  emptySub:  { fontSize: 13, color: COLORS.textMuted, marginTop: 6 },

  header: {
    flexDirection:  'row',
    alignItems:     'baseline',
    justifyContent: 'space-between',
    marginBottom:   10,
  },
  headerCount:   { fontSize: 14, fontWeight: '700', color: COLORS.text },
  headerUpdated: { fontSize: 12, color: COLORS.textMuted },

  card: {
    backgroundColor: COLORS.white,
    borderRadius:    12,
    padding:         16,
    marginBottom:    12,
    borderWidth:     1,
    borderColor:     COLORS.border,
  },
  cardDimmed: { borderColor: COLORS.background },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  bgBadge: {
    paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 6, backgroundColor: COLORS.background,
  },
  bgBadgeMatch: { backgroundColor: COLORS.primaryLight },
  bgText:       { fontSize: 14, fontWeight: '700', color: COLORS.textMuted },
  bgTextMatch:  { color: COLORS.primary },
  time:         { fontSize: 12, color: COLORS.textMuted },

  hospital: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  meta:     { fontSize: 13, color: COLORS.textMuted, marginTop: 4 },

  acceptBtn: {
    backgroundColor: COLORS.primary,
    borderRadius:    10,
    paddingVertical: 12,
    alignItems:      'center',
    marginTop:       14,
  },
  acceptBtnText: { color: COLORS.white, fontSize: 14, fontWeight: '700' },

  notMatchChip: {
    alignSelf:         'flex-start',
    marginTop:         12,
    paddingHorizontal: 10,
    paddingVertical:   4,
    borderRadius:      999,
    backgroundColor:   COLORS.background,
    borderWidth:       1,
    borderColor:       COLORS.border,
  },
  notMatchChipText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },

  lockedChip: {
    marginTop:         14,
    paddingVertical:   10,
    paddingHorizontal: 12,
    borderRadius:      10,
    backgroundColor:   '#FEF3C7',
    alignItems:        'center',
  },
  lockedChipText: { fontSize: 13, color: '#92400E', fontWeight: '600' },
});
