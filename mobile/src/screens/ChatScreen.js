// screens/ChatScreen.js
//
// Temporary 1-hour chat between a donor and the requester after a match.
//
// The screen polls GET /api/chat/:requestId?since=N every 4 seconds.
// Only messages after the last known index are fetched — efficient for Redis lists.
//
// Navigation params:
//   requestId  — the BloodRequest id
//   otherName  — display name of the other party (shown in header)

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, ActivityIndicator, KeyboardAvoidingView,
  Platform, Alert,
} from 'react-native';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { COLORS } from '../config';

const POLL_INTERVAL_MS = 4000;

export default function ChatScreen({ route, navigation }) {
  const { requestId, otherName } = route.params;
  const currentUser = useAuthStore((state) => state.user);

  const [messages, setMessages]     = useState([]);
  const [inputText, setInputText]   = useState('');
  const [sending, setSending]       = useState(false);
  const [expired, setExpired]       = useState(false);
  const [ttlSeconds, setTtlSeconds] = useState(null);
  const [loading, setLoading]       = useState(true);

  const totalRef   = useRef(0);   // tracks how many messages we've seen
  const listRef    = useRef(null);
  const pollRef    = useRef(null);

  useEffect(() => {
    navigation.setOptions({ title: `Chat — ${otherName}` });
  }, [otherName]);

  const poll = useCallback(async () => {
    try {
      const res = await api.get(`/chat/${requestId}?since=${totalRef.current}`);
      const data = res.data;

      if (data.expired) {
        setExpired(true);
        clearInterval(pollRef.current);
        return;
      }

      setTtlSeconds(data.ttlSeconds);

      if (data.messages.length > 0) {
        setMessages((prev) => [...prev, ...data.messages]);
        totalRef.current = data.total;
        // Scroll to bottom after new messages
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch {
      // Non-critical — next poll will retry
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    poll(); // immediate first fetch
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [poll]);

  async function handleSend() {
    const text = inputText.trim();
    if (!text) return;

    setSending(true);
    setInputText('');

    try {
      const res = await api.post(`/chat/${requestId}`, { text });
      const msg = res.data.message;

      // Optimistically append and update the index
      setMessages((prev) => [...prev, msg]);
      totalRef.current += 1;
      setTtlSeconds(res.data.ttlSeconds);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err) {
      setInputText(text); // restore on failure
      Alert.alert('Error', err.response?.data?.error || 'Could not send message.');
    } finally {
      setSending(false);
    }
  }

  function formatTime(isoString) {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatTtl(secs) {
    if (!secs || secs <= 0) return '0 min';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m} min`;
  }

  function renderMessage({ item }) {
    const isMine = item.senderId === currentUser?.id;
    return (
      <View style={[styles.bubbleWrap, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
        {!isMine && <Text style={styles.senderName}>{item.senderName}</Text>}
        <View style={[styles.bubble, isMine ? styles.bubbleBgMine : styles.bubbleBgTheirs]}>
          <Text style={[styles.bubbleText, isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}>
            {item.text}
          </Text>
        </View>
        <Text style={[styles.timestamp, isMine ? styles.timestampRight : styles.timestampLeft]}>
          {formatTime(item.sentAt)}
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      {/* Expiry banner */}
      {expired ? (
        <View style={styles.expiredBanner}>
          <Text style={styles.expiredText}>This chat has expired. Messages are deleted.</Text>
        </View>
      ) : ttlSeconds !== null && (
        <View style={styles.expiryBanner}>
          <Text style={styles.expiryText}>
            🕐 Chat expires in {formatTtl(ttlSeconds)} — messages are deleted after 1 hour
          </Text>
        </View>
      )}

      {/* Message list */}
      <FlatList
        ref={listRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyTitle}>Say hello</Text>
            <Text style={styles.emptySubtitle}>
              This chat is only visible to you and {otherName}.{'\n'}It disappears after 1 hour.
            </Text>
          </View>
        }
      />

      {/* Input bar */}
      {!expired && (
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type a message…"
            placeholderTextColor={COLORS.textMuted}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || sending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
          >
            {sending
              ? <ActivityIndicator size="small" color={COLORS.white} />
              : <Text style={styles.sendBtnText}>Send</Text>
            }
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center' },

  expiryBanner: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 16,
    paddingVertical:   8,
  },
  expiryText: { fontSize: 12, color: '#92400E', textAlign: 'center' },

  expiredBanner: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 16,
    paddingVertical:   10,
  },
  expiredText: { fontSize: 13, color: '#B91C1C', textAlign: 'center', fontWeight: '600' },

  list:        { flex: 1 },
  listContent: { padding: 16, gap: 8, paddingBottom: 8 },

  bubbleWrap:    { maxWidth: '80%', gap: 2 },
  bubbleMine:    { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubbleTheirs:  { alignSelf: 'flex-start', alignItems: 'flex-start' },

  senderName: { fontSize: 11, color: COLORS.textMuted, marginBottom: 2, marginLeft: 4 },

  bubble:         { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleBgMine:   { backgroundColor: COLORS.primary, borderBottomRightRadius: 4 },
  bubbleBgTheirs: { backgroundColor: COLORS.white, borderBottomLeftRadius: 4 },

  bubbleText:      { fontSize: 15, lineHeight: 20 },
  bubbleTextMine:  { color: COLORS.white },
  bubbleTextTheirs:{ color: COLORS.text },

  timestamp:      { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  timestampRight: { textAlign: 'right', marginRight: 4 },
  timestampLeft:  { textAlign: 'left',  marginLeft: 4 },

  emptyState:    { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyIcon:     { fontSize: 48, marginBottom: 16 },
  emptyTitle:    { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptySubtitle: { fontSize: 14, color: COLORS.textMuted, marginTop: 6, textAlign: 'center', lineHeight: 20 },

  inputBar: {
    flexDirection:  'row',
    alignItems:     'flex-end',
    padding:        12,
    gap:            8,
    backgroundColor: COLORS.white,
    borderTopWidth:  1,
    borderTopColor:  COLORS.border,
  },
  input: {
    flex:            1,
    backgroundColor: COLORS.background,
    borderRadius:    20,
    paddingHorizontal: 16,
    paddingVertical:   10,
    fontSize:        15,
    color:           COLORS.text,
    maxHeight:       100,
  },
  sendBtn: {
    backgroundColor: COLORS.primary,
    borderRadius:    20,
    paddingHorizontal: 18,
    paddingVertical:   10,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText:     { color: COLORS.white, fontWeight: '700', fontSize: 15 },
});
