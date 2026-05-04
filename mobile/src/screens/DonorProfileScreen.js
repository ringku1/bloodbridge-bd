// screens/DonorProfileScreen.js
//
// Allows the donor to set/update their profile.
// This is typically the first screen shown after login if the user has no name.
//
// Fields:
//   - Name
//   - Blood group (via BloodGroupPicker component)
//   - District (e.g. "Dhaka", "Chattogram")
//   - Location — obtained from the device GPS via expo-location

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import * as Location from 'expo-location';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import BloodGroupPicker from '../components/BloodGroupPicker';
import { COLORS } from '../config';

export default function DonorProfileScreen({ navigation }) {
  const { user, updateUser, logout } = useAuthStore();

  // Pre-fill with existing data so the user can edit in place
  const [name, setName]           = useState(user?.name || '');
  const [bloodGroup, setBloodGroup] = useState(user?.bloodGroup || null);
  const [district, setDistrict]   = useState(user?.district || '');
  const [latitude, setLatitude]   = useState(user?.latitude || null);
  const [longitude, setLongitude] = useState(user?.longitude || null);
  const [loading, setLoading]     = useState(false);
  const [locating, setLocating]   = useState(false);

  // Use expo-location to get the device's GPS coordinates.
  // We ask for WhenInUse permission — the app doesn't need background location.
  async function handleGetLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is needed to set your area.');
        return;
      }
      // getCurrentPositionAsync returns { coords: { latitude, longitude, accuracy } }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLatitude(location.coords.latitude);
      setLongitude(location.coords.longitude);
      Alert.alert('Location set', 'Your current location has been saved.');
    } catch (err) {
      Alert.alert('Error', 'Could not get location. Please try again.');
    } finally {
      setLocating(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter your full name.');
      return;
    }
    if (!bloodGroup) {
      Alert.alert('Blood group required', 'Please select your blood group.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.put('/donors/profile', {
        name:      name.trim(),
        bloodGroup,
        district:  district.trim(),
        latitude,
        longitude,
      });
      updateUser(res.data.user);
      Alert.alert('Saved!', 'Your profile has been updated.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to save profile.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      <Text style={styles.sectionLabel}>Full Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Rafiq Ahmed"
      />

      <Text style={styles.sectionLabel}>Blood Group</Text>
      <BloodGroupPicker value={bloodGroup} onChange={setBloodGroup} />

      <Text style={[styles.sectionLabel, { marginTop: 20 }]}>District</Text>
      <TextInput
        style={styles.input}
        value={district}
        onChangeText={setDistrict}
        placeholder="e.g. Dhaka, Chattogram, Sylhet"
      />

      <Text style={[styles.sectionLabel, { marginTop: 4 }]}>Location (GPS)</Text>
      <TouchableOpacity
        style={styles.locationButton}
        onPress={handleGetLocation}
        disabled={locating}
      >
        {locating
          ? <ActivityIndicator color={COLORS.primary} />
          : <Text style={styles.locationButtonText}>
              {latitude ? '📍 Location set — tap to update' : '📍 Use my current location'}
            </Text>
        }
      </TouchableOpacity>
      {latitude && (
        <Text style={styles.coordsText}>
          {latitude.toFixed(5)}, {longitude.toFixed(5)}
        </Text>
      )}

      <TouchableOpacity
        style={[styles.saveButton, loading && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color={COLORS.white} />
          : <Text style={styles.saveButtonText}>Save Profile</Text>
        }
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.caregiversButton}
        onPress={() => navigation.navigate('Caregivers')}
      >
        <Text style={styles.caregiversButtonText}>👥  Manage Emergency Caregivers</Text>
        <Text style={styles.caregiversButtonSub}>
          Notified by SMS if no donor responds in 30 min
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={() =>
          Alert.alert('Log out', 'Are you sure you want to log out?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Log out', style: 'destructive', onPress: logout },
          ])
        }
      >
        <Text style={styles.logoutButtonText}>Log Out</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content:   { padding: 20, paddingBottom: 40 },

  sectionLabel: {
    fontSize:     13,
    fontWeight:   '600',
    color:        COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom:  8,
  },
  input: {
    borderWidth:       1,
    borderColor:       COLORS.border,
    borderRadius:      10,
    paddingVertical:   14,
    paddingHorizontal: 16,
    fontSize:          15,
    color:             COLORS.text,
    backgroundColor:   COLORS.white,
    marginBottom:      20,
  },

  locationButton: {
    borderWidth:   1,
    borderColor:   COLORS.primary,
    borderRadius:  10,
    padding:       14,
    alignItems:    'center',
  },
  locationButtonText: { color: COLORS.primary, fontWeight: '600', fontSize: 15 },
  coordsText:         { fontSize: 12, color: COLORS.textMuted, marginTop: 6, marginBottom: 20 },

  saveButton: {
    backgroundColor: COLORS.primary,
    borderRadius:    12,
    padding:         18,
    alignItems:      'center',
    marginTop:       24,
  },
  buttonDisabled: { opacity: 0.6 },
  saveButtonText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },

  caregiversButton: {
    borderWidth:   1,
    borderColor:   COLORS.border,
    borderRadius:  12,
    padding:       16,
    marginTop:     12,
  },
  caregiversButtonText: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  caregiversButtonSub:  { fontSize: 12, color: COLORS.textMuted, marginTop: 3 },

  logoutButton: {
    borderWidth:   1,
    borderColor:   '#EF4444',
    borderRadius:  12,
    padding:       16,
    marginTop:     12,
    alignItems:    'center',
  },
  logoutButtonText: { fontSize: 15, fontWeight: '600', color: '#EF4444' },
});
