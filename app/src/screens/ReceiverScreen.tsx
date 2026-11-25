import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import type { Handshake } from '../types';

interface Props {
  handshake: Handshake | null;
  connectionCode: string;
  networkType: string;          // 'wifi' / 'hotspot' 等，用于提示
  logs: string[];
  onCopyCode: () => void;
  onReset: () => void;
}

export default function ReceiverScreen({
  handshake, connectionCode, networkType, logs, onCopyCode, onReset,
}: Props) {
  const [showLogs, setShowLogs] = useState(false);
  const qrSize = Dimensions.get('window').width * 0.5;
  const isWifi = networkType === 'wifi';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.badge}><Text style={styles.badgeText}>接收模式</Text></View>
      <Text style={styles.title}>等待发送方连接</Text>
      <Text style={styles.hint}>
        把下方「连接码」发给对方（微信/短信均可）。对方加入本机热点后粘贴即可连接。
      </Text>

      {/* 热点状态引导 */}
      <View style={styles.netCard}>
        <Text style={styles.netIcon}>{isWifi ? '📶' : '🔥'}</Text>
        <View style={styles.netBody}>
          <Text style={styles.netTitle}>
            {isWifi ? '已连接 WiFi' : '个人热点模式'}
          </Text>
          <Text style={styles.netDesc}>
            {isWifi
              ? '确保发送方连接的是同一个 WiFi'
              : '请让发送方打开 WiFi 并加入你开启的个人热点'}
          </Text>
        </View>
      </View>

      {/* 连接码卡片 —— 核心握手方式 */}
      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>连接码（发给对方复制）</Text>
        <View style={styles.codeBox}>
          <Text style={styles.codeText} selectable>
            {connectionCode || '正在生成连接码…'}
          </Text>
        </View>
        <TouchableOpacity style={styles.copyBtn} onPress={onCopyCode} disabled={!connectionCode}>
          <Text style={styles.copyBtnText}>📋 复制连接码</Text>
        </TouchableOpacity>
      </View>

      {/* 二维码作为备选（对方也可扫码识别） */}
      <View style={styles.qrWrap}>
        {handshake ? (
          <QRCode
            value={connectionCode}
            size={qrSize}
            color="#1a1a1a"
            backgroundColor="#fff"
          />
        ) : (
          <View style={[styles.qrPlaceholder, { width: qrSize, height: qrSize }]}>
            <Text style={styles.qrPlaceholderText}>正在生成本机信息…</Text>
          </View>
        )}
        <Text style={styles.qrCaption}>或让对方扫描此二维码</Text>
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
        <Text style={styles.statusText}>HTTP 服务已就绪 · 等待发送方上传</Text>
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
  hint: { fontSize: 13, color: '#777', textAlign: 'center', lineHeight: 19, marginBottom: 16 },
  netCard: { flexDirection: 'row', width: '100%', backgroundColor: '#fff8e6', borderRadius: 12, padding: 14, marginBottom: 16, alignItems: 'center' },
  netIcon: { fontSize: 26, marginRight: 12 },
  netBody: { flex: 1 },
  netTitle: { fontSize: 15, fontWeight: '700', color: '#a86b00' },
  netDesc: { fontSize: 12, color: '#a8863b', marginTop: 3, lineHeight: 17 },
  codeCard: { width: '100%', backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 16, elevation: 2 },
  codeLabel: { fontSize: 13, fontWeight: '700', color: '#555', marginBottom: 10 },
  codeBox: { backgroundColor: '#f4f6fa', borderRadius: 8, padding: 12, marginBottom: 12 },
  codeText: { fontFamily: 'monospace', fontSize: 12, color: '#2b2b2b', lineHeight: 18 },
  copyBtn: { backgroundColor: '#2f6fed', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  copyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  qrWrap: { padding: 16, backgroundColor: '#fff', borderRadius: 16, elevation: 2, marginBottom: 16, alignItems: 'center' },
  qrPlaceholder: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 8 },
  qrPlaceholderText: { color: '#999', fontSize: 13 },
  qrCaption: { fontSize: 11, color: '#aaa', marginTop: 10 },
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
