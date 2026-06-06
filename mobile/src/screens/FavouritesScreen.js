// screens/FavouritesScreen.js
//
// List of users the current user has favourited.
// Tap the trailing × button to remove (long-press also works).

import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import { formatBloodGroup } from '../utils/formatters';
import { COLORS } from '../config';

export default function FavouritesScreen() {
  const [favourites, setFavourites] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchFavourites() {
    try {
      const res = await api.get('/donors/favourites');
      setFavourites(res.data.favourites ?? []);
    } catch (err) {
      console.error('[Favourites]', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { fetchFavourites(); }, []));

  function confirmRemove(user) {
    Alert.alert(
      'Remove favourite?',
      `Remove ${user.name || 'this user'} from your favourites?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/donors/favourites/${user.id}`);
              setFavourites((f) => f.filter((x) => x.id !== user.id));
            } catch (err) {
              console.error('[Favourites/remove]', err.message);
              Alert.alert('Error', 'Could not remove. Try again.');
            }
          },
        },
      ]
    );
  }

  const renderItem = ({ item }) => {
    const initials = (item.name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
    const isVerified = item.emailVerified === true && item.verifiedStatus === 'VERIFIED';
    return (
      <TouchableOpacity style={styles.row} onLongPress={() => confirmRemove(item)} activeOpacity={0.7}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{item.name || 'Unknown'}</Text>
          <Text style={styles.meta}>
            {formatBloodGroup(item.bloodGroup)}{item.district ? ` • ${item.district}` : ''}
          </Text>
        </View>
        {isVerified && (
          <View style={styles.verifiedPill}>
            <Text style={styles.verifiedPillText}>✓ VERIFIED</Text>
          </View>
        )}
        <TouchableOpacity
          style={styles.removeBtn}
          onPress={() => confirmRemove(item)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={`Remove ${item.name || 'user'} from favourites`}
        >
          <Text style={styles.removeBtnText}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
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
      data={favourites}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); fetchFavourites(); }}
          tintColor={COLORS.primary}
        />
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No favourites yet.</Text>
          <Text style={styles.emptySub}>
            Tap the heart on someone's profile to add them.
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list:   { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.white, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 14, marginBottom: 10,
    minHeight: 56,
    borderWidth: 1, borderColor: COLORS.border,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: COLORS.primary },
  info:       { flex: 1 },
  name:       { fontSize: 15, fontWeight: '600', color: COLORS.text },
  meta:       { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },

  verifiedPill: {
    backgroundColor: '#DCFCE7',
    paddingVertical: 4, paddingHorizontal: 8,
    borderRadius: 8,
    marginRight: 8,
  },
  verifiedPillText: { fontSize: 11, fontWeight: '600', color: '#15803D' },

  removeBtn: {
    width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center',
    marginRight: -8,
  },
  removeBtnText: { fontSize: 20, color: COLORS.textMuted, fontWeight: '600' },

  empty:    { paddingTop: 80, alignItems: 'center' },
  emptyText: { fontSize: 16, color: COLORS.text, fontWeight: '600' },
  emptySub:  { fontSize: 13, color: COLORS.textMuted, marginTop: 6, textAlign: 'center' },
});
