// screens/VerificationScreen.js
//
// NID photo upload and verification status screen.
//
// Upload flow (explained step by step):
//
//   1. User taps "Upload NID Photo" → expo-image-picker opens camera/gallery
//   2. App calls GET /api/verify/upload-url → backend generates an S3 presigned PUT URL
//   3. App reads the selected image as a blob and PUTs it directly to the S3 URL
//      (Direct-to-S3 upload: image bytes never go through our backend server)
//   4. App calls POST /api/verify/submit with the s3Key → verifiedStatus becomes PENDING
//   5. Admin reviews via Postman: PUT /api/verify/admin/:userId { status: "VERIFIED" }

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { API_BASE_URL } from '../config';
import { COLORS } from '../config';

// Status display config
const STATUS_CONFIG = {
  UNVERIFIED: {
    icon:    '📋',
    title:   'Not yet verified',
    desc:    'Upload a clear photo of your NID card to become a verified donor. Verified donors appear in search results.',
    color:   COLORS.textMuted,
    bgColor: COLORS.background,
  },
  PENDING: {
    icon:    '⏳',
    title:   'Under review',
    desc:    'Your NID photo has been submitted. Our team typically reviews within 1–2 business days.',
    color:   COLORS.warning,
    bgColor: '#FEF3C7',
  },
  VERIFIED: {
    icon:    '✅',
    title:   'Verified donor',
    desc:    'Your identity has been verified. You now appear in blood request search results.',
    color:   COLORS.success,
    bgColor: '#DCFCE7',
  },
};

export default function VerificationScreen() {
  const { user, updateUser }  = useAuthStore();
  const [uploading, setUploading] = useState(false);
  const [status, setStatus]       = useState(user?.verifiedStatus || 'UNVERIFIED');

  // Re-fetch every time the user navigates to this screen so admin approvals
  // are reflected without needing a full app restart.
  useFocusEffect(useCallback(() => { fetchStatus(); }, []));

  async function fetchStatus() {
    try {
      const res = await api.get('/verify/status');
      setStatus(res.data.verifiedStatus);
      updateUser({ verifiedStatus: res.data.verifiedStatus });
    } catch {
      // Non-critical — just use the cached status
    }
  }

  async function handleUpload() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality:    0.8,
      allowsEditing: false,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    setUploading(true);

    try {
      // Build multipart form — React Native handles the file:// URI natively
      // at the networking layer, which is far more reliable than fetch+blob+PUT.
      const formData = new FormData();
      formData.append('photo', {
        uri:  asset.uri,
        type: asset.mimeType || 'image/jpeg',
        name: 'nid.jpg',
      });

      // POST to our backend; backend uploads to MinIO over the internal Docker
      // network, avoiding direct mobile→MinIO connectivity entirely.
      // Use fetch (not axios) for multipart uploads — React Native's native
      // fetch sets the correct Content-Type with boundary automatically.
      const token = useAuthStore.getState().token;
      const uploadRes = await fetch(`${API_BASE_URL}/verify/upload`, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body:    formData,
      });
      if (!uploadRes.ok) {
        const errData = await uploadRes.json();
        throw new Error(errData.error || 'Upload failed');
      }
      const { s3Key } = await uploadRes.json();

      // Tell the backend which key to store against this user's profile.
      await api.post('/verify/submit', { s3Key });

      setStatus('PENDING');
      updateUser({ verifiedStatus: 'PENDING' });

      Alert.alert(
        'Submitted!',
        "Your NID photo has been submitted for review. We'll notify you once it's approved."
      );
    } catch (err) {
      Alert.alert('Upload failed', err.response?.data?.error || err.message || 'Please try again.');
    } finally {
      setUploading(false);
    }
  }

  const config = STATUS_CONFIG[status] || STATUS_CONFIG.UNVERIFIED;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Status card */}
      <View style={[styles.statusCard, { backgroundColor: config.bgColor }]}>
        <Text style={styles.statusIcon}>{config.icon}</Text>
        <Text style={[styles.statusTitle, { color: config.color }]}>{config.title}</Text>
        <Text style={styles.statusDesc}>{config.desc}</Text>
      </View>

      {/* Upload button — only shown when not yet submitted */}
      {status === 'UNVERIFIED' && (
        <>
          <View style={styles.instructions}>
            <Text style={styles.instructionsTitle}>Tips for a good photo:</Text>
            {[
              'Hold the NID flat and fully visible',
              'Good lighting — no shadows or glare',
              'All four corners visible',
              'Text must be readable',
            ].map((tip) => (
              <Text key={tip} style={styles.tip}>• {tip}</Text>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.uploadButton, uploading && styles.buttonDisabled]}
            onPress={handleUpload}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <ActivityIndicator color={COLORS.white} />
                <Text style={styles.uploadButtonText}> Uploading…</Text>
              </>
            ) : (
              <Text style={styles.uploadButtonText}>📷  Upload NID Photo</Text>
            )}
          </TouchableOpacity>
        </>
      )}

      {/* Re-upload option if pending */}
      {status === 'PENDING' && (
        <TouchableOpacity
          style={styles.reuploadButton}
          onPress={handleUpload}
          disabled={uploading}
        >
          <Text style={styles.reuploadButtonText}>Re-upload NID photo</Text>
        </TouchableOpacity>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content:   { padding: 20, gap: 16, paddingBottom: 40 },

  statusCard: {
    borderRadius: 14,
    padding:      24,
    alignItems:   'center',
    gap:          8,
  },
  statusIcon:  { fontSize: 48 },
  statusTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  statusDesc:  { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },

  instructions: {
    backgroundColor: COLORS.white,
    borderRadius:    12,
    padding:         16,
    gap:             6,
  },
  instructionsTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  tip:               { fontSize: 13, color: COLORS.textMuted },

  uploadButton: {
    backgroundColor: COLORS.primary,
    borderRadius:    12,
    padding:         18,
    alignItems:      'center',
    flexDirection:   'row',
    justifyContent:  'center',
    gap:             8,
  },
  buttonDisabled:   { opacity: 0.6 },
  uploadButtonText: { color: COLORS.white, fontSize: 16, fontWeight: '700' },

  reuploadButton: {
    borderWidth:  1,
    borderColor:  COLORS.primary,
    borderRadius: 12,
    padding:      16,
    alignItems:   'center',
  },
  reuploadButtonText: { color: COLORS.primary, fontWeight: '600' },
});
