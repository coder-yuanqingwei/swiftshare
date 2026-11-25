import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator,
} from 'react-native';

interface Props {
  connectedName?: string | null;
  codeError?: string | null;
  onConnectCode: (code: string) => void;
  onPaste: () => Promise<string | null>;
  onSendFiles: () => void;
  onReset: () => void;
}

export default function SenderScreen({
  connectedName, codeError, onConnectCode, onPaste, onSendFiles, onReset,
}: Props) {
  const [code, setCode] = useState('');
  const [connecting, setConnecting] = useState(false);

  const connect = (value: string) => {
    if (!value.trim()) return;
    setConnecting(true);
    try {
      onConnectCode(value.trim());
    } finally {
      setConnecting(false);
    }
  };

  const paste = async () => {
    const text = await onPaste();
    if (text) setCode(text.trim());
  };

  const connected = Boolean(connectedName);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.badge}><Text style={[styles.badgeText, styles.sendBadgeText]}>发送模式</Text></View>
      <Text style={styles.title}>连接接收方</Text>

      <View style={styles.netCard}>
        <Text style={styles.netIcon}>🔥</Text>
        <Text style={styles.netDesc}>
          先加入接收方的个人热点（或连同一 WiFi），再粘贴对方发来的连接码。
        </Text>
      </View>

      {!connected ? (
        <View style={styles.connectCard}>
          <Text style={styles.fieldLabel}>连接码</Text>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            placeholder="粘贴 SwiftShare1: 开头的连接码"
            placeholderTextColor="#aaa"
            multiline
            autoCapitalize="none"
            autoCorrect={false}
          />
          {codeError ? <Text style={styles.errorText}>{codeError}</Text> : null}
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.pasteBtn} onPress={paste}>
              <Text style={styles.pasteBtnText}>粘贴</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.connectBtn, !code.trim() && styles.btnDisabled]}
              onPress={() => connect(code)}
              disabled={!code.trim() || connecting}
            >
              {connecting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.connectBtnText}>连接</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.selectedCard}>
          <Text style={styles.selectedTitle}>✓ 已连接：{connectedName}</Text>
          <Text style={styles.selectedHint}>点击下方按钮选择要发送的图片或文件</Text>
        </View>
      )}

      {connected && (
        <TouchableOpacity style={styles.sendBtn} onPress={onSendFiles}>
          <Text style={styles.sendBtnText}>选择图片并发送</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.resetBtn} onPress={onReset}>
        <Text style={styles.resetBtnText}>返回首页</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f8fa' },
  content: { padding: 24 },
  badge: { alignSelf: 'flex-start', backgroundColor: '#e0f7f1', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, marginBottom: 12 },
  badgeText: { color: '#2f6fed', fontWeight: '700', fontSize: 13 },
  sendBadgeText: { color: '#0e8a6f' },
  title: { fontSize: 22, fontWeight: '800', color: '#1a1a1a', marginBottom: 18 },
  netCard: { flexDirection: 'row', backgroundColor: '#fff8e6', borderRadius: 12, padding: 14, marginBottom: 18, alignItems: 'center' },
  netIcon: { fontSize: 24, marginRight: 12 },
  netDesc: { flex: 1, fontSize: 13, color: '#a8863b', lineHeight: 19 },
  connectCard: { backgroundColor: '#fff', borderRadius: 14, padding: 18, elevation: 2 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#555', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 13, color: '#222', minHeight: 80, textAlignVertical: 'top', marginBottom: 6 },
  errorText: { color: '#d32f2f', fontSize: 12, marginBottom: 8 },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  pasteBtn: { flex: 1, backgroundColor: '#eef3ff', paddingVertical: 13, borderRadius: 10, alignItems: 'center' },
  pasteBtnText: { color: '#2f6fed', fontWeight: '700', fontSize: 15 },
  connectBtn: { flex: 1, backgroundColor: '#2f6fed', paddingVertical: 13, borderRadius: 10, alignItems: 'center' },
  connectBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnDisabled: { backgroundColor: '#a9c2f0' },
  selectedCard: { backgroundColor: '#e0f7f1', borderRadius: 12, padding: 18, marginTop: 8 },
  selectedTitle: { fontSize: 17, fontWeight: '700', color: '#0e8a6f' },
  selectedHint: { fontSize: 13, color: '#0e8a6f', marginTop: 6 },
  sendBtn: { marginTop: 18, backgroundColor: '#16a085', paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  resetBtn: { marginTop: 16, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  resetBtnText: { color: '#666', fontWeight: '600', fontSize: 15 },
});
