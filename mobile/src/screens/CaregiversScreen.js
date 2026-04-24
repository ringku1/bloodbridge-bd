// screens/CaregiversScreen.js
//
// Manage emergency caregivers — people who receive an SMS if no donor
// accepts a blood request after 30 minutes (escalation Level 2).
//
// Actions:
//   - View registered caregivers (ordered by priority)
//   - Add a new caregiver (name + Bangladeshi phone number)
//   - Delete a caregiver with swipe/button

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, RefreshControl, Modal,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import api from '../services/api';
import { COLORS } from '../config';

export default function CaregiversScreen() {
  const [caregivers, setCaregivers] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [modalVisible, setModalVisible] = useState(false);

  // Form state
  const [name, setName]       = useState('');
  const [phone, setPhone]     = useState('+880');
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    fetchCaregivers();
  }, []);

  async function fetchCaregivers() {
    try {
      setLoading(true);
      const res = await api.get('/caregivers');
      setCaregivers(res.data.caregivers);
    } catch (err) {
      Alert.alert('Error', 'Could not load caregivers.');
    } finally {
      setLoading(false);
    }
  }

  const onRefresh = useCallback(() => fetchCaregivers(), []);

  async function handleAdd() {
    if (!name.trim()) return Alert.alert('Required', 'Enter the caregiver\'s name.');
    if (!/^\+880[1-9]\d{8}$/.test(phone)) {
      return Alert.alert('Invalid phone', 'Enter a valid Bangladeshi number: +880XXXXXXXXXX');
    }

    setSaving(true);
    try {
      const res = await api.post('/caregivers', { name: name.trim(), phone });
      setCaregivers((prev) => [...prev, res.data.caregiver]);
      setModalVisible(false);
      setName('');
      setPhone('+880');
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Could not add caregiver.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(caregiver) {
    Alert.alert(
      'Remove caregiver',
      `Remove ${caregiver.name} from your emergency contacts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/caregivers/${caregiver.id}`);
              setCaregivers((prev) => prev.filter((c) => c.id !== caregiver.id));
            } catch (err) {
              Alert.alert('Error', 'Could not remove caregiver.');
            }
          },
        },
      ]
    );
  }

  function renderCaregiver({ item, index }) {
    return (
      <View style={styles.caregiverRow}>
        <View style={styles.priorityBadge}>
          <Text style={styles.priorityText}>{index + 1}</Text>
        </View>
        <View style={styles.caregiverInfo}>
          <Text style={styles.caregiverName}>{item.name}</Text>
          <Text style={styles.caregiverPhone}>{item.phone}</Text>
        </View>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => handleDelete(item)}
        >
          <Text style={styles.deleteBtnText}>Remove</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {/* Info banner */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoText}>
          📲  If no donor accepts your blood request within 30 minutes, everyone on this list
          receives an SMS alert. Add family members or close friends.
        </Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={caregivers}
          keyExtractor={(item) => item.id}
          renderItem={renderCaregiver}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>👥</Text>
              <Text style={styles.emptyTitle}>No caregivers yet</Text>
              <Text style={styles.emptySubtitle}>
                Add a family member or friend who should be alerted if you can't find a donor quickly.
              </Text>
            </View>
          }
        />
      )}

      {/* Add button */}
      {caregivers.length < 5 && (
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setModalVisible(true)}
        >
          <Text style={styles.addButtonText}>+ Add Caregiver</Text>
        </TouchableOpacity>
      )}

      {/* Add caregiver modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Caregiver</Text>
            <Text style={styles.modalSubtitle}>
              This person will receive an SMS if you need blood and no donor responds in 30 minutes.
            </Text>

            <Text style={styles.fieldLabel}>Full Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Karim Ahmed"
              autoFocus
            />

            <Text style={styles.fieldLabel}>Phone Number</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="+8801XXXXXXXXX"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setModalVisible(false); setName(''); setPhone('+880'); }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleAdd}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color={COLORS.white} size="small" />
                  : <Text style={styles.saveBtnText}>Add</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center' },

  infoBanner: {
    backgroundColor: '#EFF6FF',
    borderLeftWidth: 4,
    borderLeftColor: '#2563EB',
    margin:          16,
    marginBottom:    0,
    borderRadius:    8,
    padding:         12,
  },
  infoText: { fontSize: 13, color: '#1E40AF', lineHeight: 18 },

  list: { padding: 16, gap: 10 },

  caregiverRow: {
    backgroundColor: COLORS.white,
    borderRadius:    12,
    padding:         14,
    flexDirection:   'row',
    alignItems:      'center',
    gap:             12,
  },
  priorityBadge: {
    width:           32,
    height:          32,
    borderRadius:    16,
    backgroundColor: COLORS.primaryLight,
    alignItems:      'center',
    justifyContent:  'center',
  },
  priorityText:    { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  caregiverInfo:   { flex: 1 },
  caregiverName:   { fontSize: 15, fontWeight: '600', color: COLORS.text },
  caregiverPhone:  { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  deleteBtn: {
    borderWidth:  1,
    borderColor:  '#EF4444',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical:    6,
  },
  deleteBtnText: { fontSize: 12, color: '#EF4444', fontWeight: '600' },

  emptyState:    { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon:     { fontSize: 48, marginBottom: 12 },
  emptyTitle:    { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptySubtitle: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 20 },

  addButton: {
    backgroundColor: COLORS.primary,
    margin:          16,
    borderRadius:    12,
    padding:         16,
    alignItems:      'center',
  },
  addButtonText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },

  modalOverlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent:  'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius:  20,
    borderTopRightRadius: 20,
    padding:  24,
    paddingBottom: 40,
  },
  modalTitle:    { fontSize: 20, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  modalSubtitle: { fontSize: 13, color: COLORS.textMuted, marginBottom: 20, lineHeight: 18 },
  fieldLabel: {
    fontSize:      13,
    fontWeight:    '600',
    color:         COLORS.textMuted,
    textTransform: 'uppercase',
    marginBottom:  6,
  },
  input: {
    borderWidth:       1,
    borderColor:       COLORS.border,
    borderRadius:      10,
    padding:           14,
    fontSize:          15,
    color:             COLORS.text,
    marginBottom:      16,
  },
  modalActions:  { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: {
    flex:         1,
    borderWidth:  1,
    borderColor:  COLORS.border,
    borderRadius: 10,
    padding:      14,
    alignItems:   'center',
  },
  cancelBtnText: { fontSize: 15, color: COLORS.textMuted, fontWeight: '600' },
  saveBtn: {
    flex:            2,
    backgroundColor: COLORS.primary,
    borderRadius:    10,
    padding:         14,
    alignItems:      'center',
  },
  saveBtnText: { fontSize: 15, color: COLORS.white, fontWeight: '700' },
});
