import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import type { Handshake } from '../types';

interface Props {
  handshake: Handshake | null;
  logs: string[];
  onReset: () => void;
}

export default function ReceiverScreen({ handshake, logs, onReset }: Props) {
  const [showLogs, setShowLogs] = useState(false);
  const qrSize = Dimensions.get('window').width * 0.62;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.badge}><Text style={styles.badgeText}>接收模式</Text></View>
      <Text style={styles.title}>等待发送方连接</Text>
      <Text style={styles.hint}>让对方扫描下方二维码，或在附近设备列表中选择本机</Text>

      <View style={styles.qrWrap}>
        {handshake ? (
          <QRCode
            value={JSON.stringify(handshake)}
            size={qrSize}
            color="#1a1a1a"
            backgroundColor="#fff"
          />
        ) : (
          <View style={[styles.qrPlaceholder, { width: qrSize, height: qrSize }]}>
            <Text style={styles.qrPlaceholderText}>正在生成本机信息…</Text>
          </View>
        )}
      </View>

      {handshake && (
        <View style={styles.infoCard}>
          <Text style={styles.infoRow}>
            <Text style={styles.infoLabel}>地址  </Text>{handshake.ip}:{handshake.port}
          </Text>
          <Text style={styles.infoRow}>
            <Text style={styles.infoLabel}>设备名  </Text>{handshake.device_name || 'SwiftShare'}
          </Text>
          <Text style={styles.infoRow}>
            <Text style={styles.infoLabel}>配对码  </Text>{handshake.token.slice(0, 8)}…
          </Text>
        </View>
      )}

      <View style={styles.statusRow}>
        <View style={styles.pulse} />
        <Text style={styles.statusText}>蓝牙广播中 · HTTP 服务已就绪</Text>
      </View>

      <TouchableOpacity onPress={() => setShowLogs((v) => !v)}>
        <Text style={styles.logToggle}>{showLogs ? '隐藏' : '查看'}调试日志</Text>
      </TouchableOpacity>
      {showLogs && (
        <ScrollView style={styles.logBox}>
          <Text style={styles.logText}>{logs.join('\n')}</Text>
        </ScrollView>
      )}

      <TouchableOpacity style={styles.stopBtn} onPress={onReset}>
        <Text style={styles.stopBtnText}>停止接收</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f8fa' },
  content: { padding: 24, alignItems: 'center' },
  badge: { backgroundColor: '#e8f0fe', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, marginBottom: 12 },
  badgeText: { color: '#2f6fed', fontWeight: '700', fontSize: 13 },
  title: { fontSize: 22, fontWeight: '800', color: '#1a1a1a', marginBottom: 8 },
  hint: { fontSize: 13, color: '#777', textAlign: 'center', lineHeight: 19, marginBottom: 20 },
  qrWrap: { padding: 16, backgroundColor: '#fff', borderRadius: 16, elevation: 3, marginBottom: 18 },
  qrPlaceholder: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 8 },
  qrPlaceholderText: { color: '#999', fontSize: 13 },
  infoCard: { width: '100%', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 },
  infoRow: { fontSize: 14, color: '#333', marginVertical: 3 },
  infoLabel: { color: '#999' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  pulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#16a085', marginRight: 8 },
  statusText: { fontSize: 13, color: '#16a085' },
  logToggle: { color: '#2f6fed', fontSize: 13, marginBottom: 8 },
  logBox: { maxHeight: 160, width: '100%', backgroundColor: '#fff', borderRadius: 8, padding: 10, marginBottom: 12 },
  logText: { fontFamily: 'monospace', fontSize: 10, color: '#555' },
  stopBtn: { marginTop: 8, paddingVertical: 13, paddingHorizontal: 40, borderRadius: 12, borderWidth: 1, borderColor: '#ddd' },
  stopBtnText: { color: '#666', fontWeight: '600', fontSize: 15 },
});
