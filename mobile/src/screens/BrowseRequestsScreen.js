// screens/BrowseRequestsScreen.js
//
// All open blood requests across the country.
// Donors can browse and pick one to accept.
//
// Accept is only enabled when the request's blood group matches the donor's.
// Other rows still show full info so the user can share or read context.

import React, { useState, useEffect, useCallback } from 'react';
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

  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchRequests() {
    try {
      const res = await api.get('/requests/browse');
      setRequests(res.data.requests ?? []);
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
      <View style={styles.card}>
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

        <TouchableOpacity
          style={[styles.acceptBtn, !matches && styles.acceptBtnDisabled]}
          onPress={() => handleAccept(item)}
          disabled={!matches}
        >
          <Text style={[styles.acceptBtnText, !matches && styles.acceptBtnTextDisabled]}>
            {matches
              ? 'Accept'
              : `Only ${formatBloodGroup(item.bloodGroup)} donors can accept`}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

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

  card: {
    backgroundColor: COLORS.white,
    borderRadius:    12,
    padding:         16,
    marginBottom:    12,
    borderWidth:     1,
    borderColor:     COLORS.border,
  },
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
  acceptBtnDisabled: {
    backgroundColor: COLORS.background,
    borderWidth: 1, borderColor: COLORS.border,
  },
  acceptBtnText:         { color: COLORS.white, fontSize: 14, fontWeight: '700' },
  acceptBtnTextDisabled: { color: COLORS.textMuted, fontWeight: '600' },
});
