// screens/FavouritesScreen.js
//
// List of users the current user has favourited.
// Long-press a row to remove from favourites.

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

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.row} onLongPress={() => confirmRemove(item)} activeOpacity={0.7}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{(item.name || '?').charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{item.name || 'Unknown'}</Text>
        <Text style={styles.meta}>
          {formatBloodGroup(item.bloodGroup)}{item.district ? ` • ${item.district}` : ''}
        </Text>
      </View>
      {item.verifiedStatus === 'VERIFIED' && item.emailVerified && (
        <Text style={styles.verified}>✓ Verified</Text>
      )}
    </TouchableOpacity>
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
      ListHeaderComponent={
        favourites.length > 0
          ? <Text style={styles.hint}>Long-press a row to remove from favourites.</Text>
          : null
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
  hint:   { fontSize: 12, color: COLORS.textMuted, marginBottom: 12, paddingHorizontal: 4 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.white, borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: COLORS.primary },
  info:       { flex: 1 },
  name:       { fontSize: 15, fontWeight: '600', color: COLORS.text },
  meta:       { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  verified:   { fontSize: 12, color: '#16A34A', fontWeight: '600' },

  empty:    { paddingTop: 80, alignItems: 'center' },
  emptyText: { fontSize: 16, color: COLORS.text, fontWeight: '600' },
  emptySub:  { fontSize: 13, color: COLORS.textMuted, marginTop: 6, textAlign: 'center' },
});
