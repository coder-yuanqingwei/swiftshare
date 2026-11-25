import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import type { PeerInfo } from '../types';

interface Props {
  peers: PeerInfo[];
  scanning: boolean;
  connectedName?: string | null;
  onPickPeer: (peer: PeerInfo) => void;
  onSendFiles: () => void;
  onReset: () => void;
}

export default function SenderScreen({ peers, scanning, connectedName, onPickPeer, onSendFiles, onReset }: Props) {
  const [selected, setSelected] = useState<PeerInfo | null>(null);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.badge}><Text style={[styles.badgeText, styles.sendBadgeText]}>发送模式</Text></View>
      <Text style={styles.title}>选择接收设备</Text>

      {scanning && !selected && (
        <View style={styles.scanningRow}>
          <ActivityIndicator color="#2f6fed" size="small" />
          <Text style={styles.scanningText}>正在通过蓝牙搜索附近的接收方…</Text>
        </View>
      )}

      {!selected && peers.length > 0 && (
        <View style={styles.list}>
          {peers.map((p) => (
            <TouchableOpacity key={p.device_id} style={styles.peerCard} onPress={() => {
              setSelected(p);
              onPickPeer(p);
            }}>
              <Text style={styles.peerIcon}>📱</Text>
              <View>
                <Text style={styles.peerName}>{p.name || '未命名设备'}</Text>
                <Text style={styles.peerId}>{p.device_id}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {!selected && !scanning && peers.length === 0 && (
        <Text style={styles.empty}>没有发现设备。请确保接收方处于接收模式且蓝牙已开启。</Text>
      )}

      {(selected || connectedName) && (
        <View style={styles.selectedCard}>
          <Text style={styles.selectedTitle}>已连接：{connectedName || selected?.name}</Text>
          <Text style={styles.selectedHint}>点击下方按钮选择要发送的图片或文件</Text>
        </View>
      )}

      {(selected || connectedName) && (
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
  scanningRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  scanningText: { marginLeft: 10, color: '#666', fontSize: 14 },
  list: { gap: 10 },
  peerCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 16, borderRadius: 12, gap: 14, elevation: 2, marginBottom: 10 },
  peerIcon: { fontSize: 28 },
  peerName: { fontSize: 16, fontWeight: '700', color: '#222' },
  peerId: { fontSize: 11, color: '#999', marginTop: 3 },
  empty: { color: '#888', fontSize: 14, lineHeight: 20, paddingVertical: 24, textAlign: 'center' },
  selectedCard: { backgroundColor: '#e0f7f1', borderRadius: 12, padding: 18, marginTop: 8 },
  selectedTitle: { fontSize: 17, fontWeight: '700', color: '#0e8a6f' },
  selectedHint: { fontSize: 13, color: '#0e8a6f', marginTop: 6 },
  sendBtn: { marginTop: 18, backgroundColor: '#16a085', paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  resetBtn: { marginTop: 16, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  resetBtnText: { color: '#666', fontWeight: '600', fontSize: 15 },
});
