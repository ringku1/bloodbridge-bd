// components/BloodGroupPicker.js
//
// A reusable grid of blood group buttons.
// Used on both DonorProfileScreen and RequestBloodScreen.
//
// Props:
//   value    — currently selected value (e.g. "A_POS") or null
//   onChange — called with new value when user taps a button
//   error    — when truthy, the entire picker tints red (for required-but-empty state)

import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { BLOOD_GROUPS } from '../utils/formatters';
import { COLORS } from '../config';

export default function BloodGroupPicker({ value, onChange, error }) {
  return (
    <View style={styles.grid}>
      {BLOOD_GROUPS.map((bg) => {
        const selected = value === bg.value;
        return (
          <TouchableOpacity
            key={bg.value}
            onPress={() => onChange(bg.value)}
            style={[
              styles.button,
              selected && styles.buttonSelected,
              error && !selected && styles.buttonError,
            ]}
            activeOpacity={0.7}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>
              {bg.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           8,
  },
  button: {
    width:           72,
    height:          48,
    borderRadius:    8,
    borderWidth:     1.5,
    borderColor:     COLORS.border,
    backgroundColor: COLORS.white,
    alignItems:      'center',
    justifyContent:  'center',
  },
  buttonSelected: {
    borderColor:     COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  buttonError: {
    borderColor: '#EF4444',
  },
  label: {
    fontSize:   16,
    fontWeight: '600',
    color:      COLORS.textMuted,
  },
  labelSelected: {
    color: COLORS.primary,
  },
});
