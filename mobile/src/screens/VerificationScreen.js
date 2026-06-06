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
  View, Text, Image, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
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
  const [pickedAsset, setPickedAsset] = useState(null); // { uri, mimeType, fileSize }

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

  async function pickPhoto() {
    const { status: perm } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm !== 'granted') {
      Alert.alert(
        'Permission required',
        'Please allow access to your photo library in Settings to upload your NID photo.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality:    0.8,
      allowsEditing: false,
    });

    if (result.canceled) return;
    setPickedAsset(result.assets[0]);
  }

  async function handleUpload() {
    if (!pickedAsset) {
      await pickPhoto();
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('photo', {
        uri:  pickedAsset.uri,
        type: pickedAsset.mimeType || 'image/jpeg',
        name: 'nid.jpg',
      });

      const uploadRes = await api.post('/verify/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        transformRequest: (data) => data,
      });
      const { s3Key } = uploadRes.data;

      await api.post('/verify/submit', { s3Key });

      setStatus('PENDING');
      updateUser({ verifiedStatus: 'PENDING' });
      setPickedAsset(null);

      Alert.alert(
        'Submitted!',
        "Your NID photo is under review. We'll notify you once it's approved (typically 1–2 business days)."
      );
    } catch (err) {
      Alert.alert('Upload failed', err.response?.data?.error || err.message || 'Please try again.');
    } finally {
      setUploading(false);
    }
  }

  function formatFileSize(bytes) {
    if (!bytes) return null;
    return bytes < 1024 * 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

      {/* Upload flow — when not yet submitted */}
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

          {pickedAsset && (
            <View style={styles.previewCard}>
              <Image source={{ uri: pickedAsset.uri }} style={styles.preview} />
              {pickedAsset.fileSize ? (
                <Text style={styles.fileSize}>Photo size: {formatFileSize(pickedAsset.fileSize)}</Text>
              ) : null}
              <TouchableOpacity
                style={styles.retakeButton}
                onPress={pickPhoto}
                disabled={uploading}
              >
                <Text style={styles.retakeButtonText}>↺  Retake / choose another</Text>
              </TouchableOpacity>
            </View>
          )}

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
              <Text style={styles.uploadButtonText}>
                {pickedAsset ? '✓  Confirm & Upload' : '📷  Choose NID Photo'}
              </Text>
            )}
          </TouchableOpacity>
        </>
      )}

      {/* Re-upload option if pending */}
      {status === 'PENDING' && (
        <TouchableOpacity
          style={styles.reuploadButton}
          onPress={() => { setPickedAsset(null); setStatus('UNVERIFIED'); }}
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

  previewCard: {
    backgroundColor: COLORS.white,
    borderRadius:    12,
    padding:         12,
    alignItems:      'center',
    gap:             10,
  },
  preview: {
    width: 240, height: 240, borderRadius: 10,
    backgroundColor: COLORS.background,
  },
  fileSize: { fontSize: 12, color: COLORS.textMuted },
  retakeButton: {
    borderWidth: 1, borderColor: COLORS.primary, borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 16,
  },
  retakeButtonText: { color: COLORS.primary, fontWeight: '600', fontSize: 14 },

  uploadButton: {
    backgroundColor: COLORS.primary,
    borderRadius:    12,
    padding:         18,
    alignItems:      'center',
    flexDirection:   'row',
    justifyContent:  'center',
    gap:             8,
  },
  buttonDisabled:   { opacity: 0.5 },
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
