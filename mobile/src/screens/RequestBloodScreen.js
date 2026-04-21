// screens/RequestBloodScreen.js
//
// A form for posting an urgent blood request.
// After submission, nearby verified donors receive a push notification.
//
// Fields:
//   - Blood group needed (BloodGroupPicker)
//   - Hospital name
//   - Location (GPS auto-fill or manual entry)
//   - Units needed

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import * as Location from 'expo-location';
import { useRequestStore } from '../store/requestStore';
import BloodGroupPicker from '../components/BloodGroupPicker';
import { COLORS } from '../config';

export default function RequestBloodScreen({ navigation }) {
  const [bloodGroup, setBloodGroup]   = useState(null);
  const [hospitalName, setHospitalName] = useState('');
  const [unitsNeeded, setUnitsNeeded] = useState('1');
  const [latitude, setLatitude]       = useState(null);
  const [longitude, setLongitude]     = useState(null);
  const [locating, setLocating]       = useState(false);

  const { createRequest, loading } = useRequestStore();

  async function handleGetLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location is needed to find nearby donors.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLatitude(loc.coords.latitude);
      setLongitude(loc.coords.longitude);
    } catch {
      Alert.alert('Error', 'Could not get location.');
    } finally {
      setLocating(false);
    }
  }

  async function handleSubmit() {
    if (!bloodGroup)          return Alert.alert('Required', 'Select the blood group needed.');
    if (!hospitalName.trim()) return Alert.alert('Required', 'Enter the hospital name.');
    if (!latitude)            return Alert.alert('Required', 'Set the location first.');

    try {
      const result = await createRequest({
        bloodGroup,
        hospitalName: hospitalName.trim(),
        latitude,
        longitude,
        unitsNeeded: parseInt(unitsNeeded, 10) || 1,
      });

      Alert.alert(
        'Request sent!',
        `${result.donorsNotified} donor(s) have been notified nearby.`,
        [{ text: 'Track request', onPress: () => navigation.navigate('ActiveRequest') }]
      );
    } catch {
      // Error is already set in the store; show it here
      Alert.alert('Error', 'Failed to post request. Check your connection and try again.');
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      <Text style={styles.title}>Request Blood</Text>
      <Text style={styles.subtitle}>
        Nearby verified donors will be notified immediately.
      </Text>

      <Text style={styles.label}>Blood Group Needed</Text>
      <BloodGroupPicker value={bloodGroup} onChange={setBloodGroup} />

      <Text style={[styles.label, { marginTop: 20 }]}>Hospital Name</Text>
      <TextInput
        style={styles.input}
        value={hospitalName}
        onChangeText={setHospitalName}
        placeholder="e.g. Dhaka Medical College Hospital"
      />

      <Text style={styles.label}>Units Needed</Text>
      <TextInput
        style={[styles.input, styles.unitsInput]}
        value={unitsNeeded}
        onChangeText={setUnitsNeeded}
        keyboardType="number-pad"
        maxLength={2}
      />

      <Text style={styles.label}>Hospital Location</Text>
      <TouchableOpacity style={styles.locationButton} onPress={handleGetLocation} disabled={locating}>
        {locating
          ? <ActivityIndicator color={COLORS.primary} />
          : <Text style={styles.locationButtonText}>
              {latitude ? '📍 Location set — tap to update' : '📍 Use current location'}
            </Text>
        }
      </TouchableOpacity>
      {latitude && (
        <Text style={styles.coordsText}>{latitude.toFixed(5)}, {longitude.toFixed(5)}</Text>
      )}

      <TouchableOpacity
        style={[styles.submitButton, loading && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color={COLORS.white} />
          : <Text style={styles.submitButtonText}>🩸  Send Request Now</Text>
        }
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content:   { padding: 20, paddingBottom: 40 },

  title:    { fontSize: 24, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  subtitle: { fontSize: 13, color: COLORS.textMuted, marginBottom: 24 },

  label: {
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
  unitsInput: { width: 80 },

  locationButton: {
    borderWidth:  1,
    borderColor:  COLORS.primary,
    borderRadius: 10,
    padding:      14,
    alignItems:   'center',
  },
  locationButtonText: { color: COLORS.primary, fontWeight: '600' },
  coordsText:         { fontSize: 12, color: COLORS.textMuted, marginTop: 6, marginBottom: 20 },

  submitButton: {
    backgroundColor: COLORS.primary,
    borderRadius:    12,
    padding:         18,
    alignItems:      'center',
    marginTop:       24,
  },
  buttonDisabled:   { opacity: 0.6 },
  submitButtonText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },
});
