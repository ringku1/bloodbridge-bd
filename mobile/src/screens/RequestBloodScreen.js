// screens/RequestBloodScreen.js
//
// A form for posting an urgent blood request.
// After submission, nearby verified donors receive a push notification.
//
// Fields:
//   - Blood group needed (BloodGroupPicker)
//   - Hospital name
//   - Location (GPS auto-fill or manual entry)
//   - Units needed (+ / − stepper)

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
  const [bloodGroup, setBloodGroup]     = useState(null);
  const [hospitalName, setHospitalName] = useState('');
  const [hospitalError, setHospitalError] = useState('');
  const [unitsNeeded, setUnitsNeeded]   = useState(1);
  const [latitude, setLatitude]         = useState(null);
  const [longitude, setLongitude]       = useState(null);
  const [locating, setLocating]         = useState(false);

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
    } catch (err) {
      console.error('[RequestBlood]', err.message);
      Alert.alert('Error', 'Could not get location.');
    } finally {
      setLocating(false);
    }
  }

  async function handleSubmit() {
    if (!isValid) return;

    try {
      const result = await createRequest({
        bloodGroup,
        hospitalName: hospitalName.trim(),
        latitude,
        longitude,
        unitsNeeded,
      });

      Alert.alert(
        'Request sent!',
        `${result?.donorsNotified ?? 0} donor(s) have been notified nearby.`,
        [{ text: 'Track request', onPress: () => navigation.navigate('ActiveRequest') }]
      );
    } catch (err) {
      console.error('[RequestBlood]', err.message);
      Alert.alert('Error', 'Failed to post request. Check your connection and try again.');
    }
  }

  const hospitalValid = hospitalName.trim().length > 0;
  const locationSet   = latitude != null && longitude != null;
  const isValid       = !!bloodGroup && hospitalValid && locationSet && !hospitalError;

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
        style={[styles.input, hospitalError && styles.inputError]}
        value={hospitalName}
        onChangeText={(v) => { setHospitalName(v); if (hospitalError) setHospitalError(''); }}
        onBlur={() => setHospitalError(hospitalName.trim() ? '' : 'Hospital name is required')}
        placeholder="e.g. Dhaka Medical College Hospital"
        placeholderTextColor={COLORS.textMuted}
      />
      {hospitalError
        ? <Text style={styles.errorText}>{hospitalError}</Text>
        : <Text style={styles.helper}>Full name of the hospital so donors can find it.</Text>}

      <Text style={[styles.label, { marginTop: 20 }]}>Units Needed</Text>
      <View style={styles.stepperRow}>
        <TouchableOpacity
          style={[styles.stepperBtn, unitsNeeded <= 1 && styles.buttonDisabled]}
          onPress={() => setUnitsNeeded((n) => Math.max(1, n - 1))}
          disabled={unitsNeeded <= 1}
        >
          <Text style={styles.stepperBtnText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.stepperValue}>{unitsNeeded}</Text>
        <TouchableOpacity
          style={[styles.stepperBtn, unitsNeeded >= 10 && styles.buttonDisabled]}
          onPress={() => setUnitsNeeded((n) => Math.min(10, n + 1))}
          disabled={unitsNeeded >= 10}
        >
          <Text style={styles.stepperBtnText}>+</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.helper}>1 unit ≈ 350–450 ml of blood</Text>

      <Text style={[styles.label, { marginTop: 20 }]}>Hospital Location</Text>
      <TouchableOpacity style={styles.locationButton} onPress={handleGetLocation} disabled={locating}>
        {locating
          ? <ActivityIndicator color={COLORS.primary} />
          : <Text style={styles.locationButtonText}>
              {locationSet ? '📍 Location set — tap to update' : '📍 Use current location'}
            </Text>
        }
      </TouchableOpacity>
      {locationSet && (
        <Text style={styles.coordsText}>{Number(latitude).toFixed(5)}, {Number(longitude).toFixed(5)}</Text>
      )}

      <TouchableOpacity
        style={[styles.submitButton, (!isValid || loading) && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={!isValid || loading}
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
    fontSize: 13, fontWeight: '600', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
    paddingVertical: 14, paddingHorizontal: 16, fontSize: 15,
    color: COLORS.text, backgroundColor: COLORS.white,
  },
  inputError: { borderColor: '#EF4444' },
  helper:     { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },
  errorText:  { fontSize: 12, color: '#EF4444', marginTop: 4 },

  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepperBtn: {
    width: 44, height: 44, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  stepperBtnText: { fontSize: 22, fontWeight: '700', color: COLORS.primary },
  stepperValue:   { fontSize: 20, fontWeight: '700', color: COLORS.text, minWidth: 32, textAlign: 'center' },

  locationButton: {
    borderWidth: 1, borderColor: COLORS.primary, borderRadius: 10,
    padding: 14, alignItems: 'center',
  },
  locationButtonText: { color: COLORS.primary, fontWeight: '600' },
  coordsText:         { fontSize: 12, color: COLORS.textMuted, marginTop: 6 },

  submitButton: {
    backgroundColor: COLORS.primary, borderRadius: 12,
    padding: 18, alignItems: 'center', marginTop: 24,
  },
  buttonDisabled:   { opacity: 0.5 },
  submitButtonText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },
});
