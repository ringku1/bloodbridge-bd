// screens/ChatScreen.js
//
// Temporary 1-hour chat between a donor and the requester after a match.
//
// Polls GET /api/chat/:requestId?since=N every 4 seconds.
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
const MAX_MESSAGE_LEN  = 500;

function formatTtl(secs) {
  if (!secs || secs <= 0) return '0m';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ChatScreen({ route, navigation }) {
  const { requestId, otherName } = route.params ?? {};
  const currentUser = useAuthStore((state) => state.user);

  const [messages, setMessages]     = useState([]);
  const [inputText, setInputText]   = useState('');
  const [sending, setSending]       = useState(false);
  const [expired, setExpired]       = useState(false);
  const [ttlSeconds, setTtlSeconds] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [newMessages, setNewMessages] = useState(0);
  const [atBottom, setAtBottom]       = useState(true);

  const totalRef = useRef(0);
  const listRef  = useRef(null);
  const pollRef  = useRef(null);

  // Title in header
  useEffect(() => {
    if (otherName) navigation.setOptions({ title: `Chat — ${otherName}` });
  }, [otherName]);

  // Expiry chip in header — only shown once the chat session has actually started
  // (i.e. someone sent at least one message, so we have a real ttlSeconds value).
  useEffect(() => {
    const showChip = expired || (ttlSeconds !== null && ttlSeconds > 0);
    navigation.setOptions({
      headerRight: () => showChip ? (
        <View style={[styles.headerChip, expired && styles.headerChipExpired]}>
          <Text style={[styles.headerChipText, expired && styles.headerChipTextExpired]}>
            {expired ? 'Expired' : `🕐 ${formatTtl(ttlSeconds)}`}
          </Text>
        </View>
      ) : null,
    });
  }, [ttlSeconds, expired, navigation]);

  const poll = useCallback(async () => {
    if (!requestId) return;
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
        if (atBottom) {
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
        } else {
          setNewMessages((n) => n + data.messages.length);
        }
      }
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, [requestId, atBottom]);

  useEffect(() => {
    if (!requestId) { setLoading(false); return; }
    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [poll, requestId]);

  if (!requestId) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: COLORS.textMuted }}>Invalid chat session.</Text>
      </View>
    );
  }

  async function postMessage(text) {
    const res = await api.post(`/chat/${requestId}`, { text });
    setMessages((prev) => [...prev, res.data.message]);
    totalRef.current += 1;
    setTtlSeconds(res.data.ttlSeconds);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }

  async function handleSend() {
    const text = inputText.trim();
    if (!text) return;

    setSending(true);
    setInputText('');

    try {
      await postMessage(text);
    } catch (err) {
      setInputText(text);
      Alert.alert('Error', err.response?.data?.error || 'Could not send message.');
    } finally {
      setSending(false);
    }
  }

  function handleShareNumber() {
    const phone = currentUser?.phone;
    if (!phone) {
      Alert.alert(
        'Add a phone number first',
        'You need to save your phone in your profile before sharing it in chat.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open profile', onPress: () => navigation.navigate('MainTabs', { screen: 'Profile' }) },
        ]
      );
      return;
    }
    Alert.alert(
      'Share your phone number?',
      `Send ${phone} to ${otherName || 'this user'} as a chat message?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Share',
          onPress: async () => {
            setSending(true);
            try {
              await postMessage(`📞 My number: ${phone}`);
            } catch (err) {
              Alert.alert('Error', err.response?.data?.error || 'Could not share number.');
            } finally {
              setSending(false);
            }
          },
        },
      ]
    );
  }

  function handleScroll(e) {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const isBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 40;
    setAtBottom(isBottom);
    if (isBottom && newMessages > 0) setNewMessages(0);
  }

  function jumpToBottom() {
    listRef.current?.scrollToEnd({ animated: true });
    setNewMessages(0);
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
      {expired && (
        <View style={styles.expiredBanner}>
          <Text style={styles.expiredText}>This chat has expired. Messages are deleted.</Text>
        </View>
      )}

      <FlatList
        ref={listRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        onScroll={handleScroll}
        scrollEventThrottle={100}
        onContentSizeChange={() => {
          if (atBottom) listRef.current?.scrollToEnd({ animated: false });
        }}
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

      {newMessages > 0 && !atBottom && (
        <TouchableOpacity style={styles.newMessagesBadge} onPress={jumpToBottom}>
          <Text style={styles.newMessagesText}>
            {newMessages} new message{newMessages !== 1 ? 's' : ''} ↓
          </Text>
        </TouchableOpacity>
      )}

      {!expired && (
        <TouchableOpacity
          style={styles.shareRow}
          onPress={handleShareNumber}
          disabled={sending}
        >
          <Text style={styles.shareText}>📞  Share my phone number</Text>
        </TouchableOpacity>
      )}

      {!expired && (
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type a message…"
            placeholderTextColor={COLORS.textMuted}
            multiline
            maxLength={MAX_MESSAGE_LEN}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <View style={styles.sendCol}>
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
            <Text style={styles.counter}>{inputText.length}/{MAX_MESSAGE_LEN}</Text>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center' },

  headerChip: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 12, marginRight: 12,
  },
  headerChipExpired: { backgroundColor: '#FEE2E2' },
  headerChipText:    { fontSize: 11, color: '#92400E', fontWeight: '700' },
  headerChipTextExpired: { color: '#B91C1C' },

  expiredBanner: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  expiredText: { fontSize: 13, color: '#B91C1C', textAlign: 'center', fontWeight: '600' },

  list:        { flex: 1 },
  listContent: { padding: 16, gap: 8, paddingBottom: 8 },

  bubbleWrap:   { maxWidth: '80%', gap: 2 },
  bubbleMine:   { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubbleTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },

  senderName: { fontSize: 11, color: COLORS.textMuted, marginBottom: 2, marginLeft: 4 },

  bubble:         { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleBgMine:   { backgroundColor: COLORS.primary, borderBottomRightRadius: 4 },
  bubbleBgTheirs: { backgroundColor: COLORS.white,   borderBottomLeftRadius: 4 },

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

  newMessagesBadge: {
    position: 'absolute', bottom: 130, alignSelf: 'center',
    backgroundColor: COLORS.primary, borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  newMessagesText: { color: COLORS.white, fontWeight: '700', fontSize: 12 },

  shareRow: {
    alignItems: 'center', paddingVertical: 10,
    backgroundColor: COLORS.white,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  shareText: { fontSize: 14, color: COLORS.primary, fontWeight: '700' },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    padding: 12, gap: 8,
    backgroundColor: COLORS.white,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.background, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, color: COLORS.text,
    maxHeight: 100,
  },
  sendCol: { alignItems: 'center', gap: 2 },
  sendBtn: {
    backgroundColor: COLORS.primary, borderRadius: 20,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText:     { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  counter:         { fontSize: 10, color: COLORS.textMuted },
});
