import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { Role } from '../types';

interface Props {
  onChoose: (role: Role) => void;
}

export default function HomeScreen({ onChoose }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.logo}>⇄</Text>
        <Text style={styles.title}>SwiftShare</Text>
        <Text style={styles.subtitle}>安卓 · iPhone 图片文件互传</Text>
        <Text style={styles.desc}>
          蓝牙发现 · 握手，WiFi 高速传输{'\n'}无需流量，无需数据线
        </Text>
      </View>

      <View style={styles.cards}>
        <TouchableOpacity style={[styles.card, styles.receive]} onPress={() => onChoose('receiver')}>
          <Text style={styles.cardIcon}>⬇</Text>
          <Text style={styles.cardTitle}>接收文件</Text>
          <Text style={styles.cardDesc}>
            本机广播并生成二维码，等待对方连接后接收图片
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.card, styles.send]} onPress={() => onChoose('sender')}>
          <Text style={styles.cardIcon}>⬆</Text>
          <Text style={styles.cardTitle}>发送文件</Text>
          <Text style={styles.cardDesc}>
            扫描附近设备，选择图片后高速发送到对方手机
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.foot}>
        提示：两台设备需连接同一 WiFi，或一台开热点另一台加入
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  hero: { alignItems: 'center', marginBottom: 48 },
  logo: { fontSize: 64, color: '#2f6fed', fontWeight: '300' },
  title: { fontSize: 32, fontWeight: '800', color: '#1a1a1a', marginTop: 8 },
  subtitle: { fontSize: 15, color: '#666', marginTop: 8 },
  desc: { fontSize: 13, color: '#999', marginTop: 16, textAlign: 'center', lineHeight: 20 },
  cards: { gap: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 22,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  receive: { borderLeftWidth: 5, borderLeftColor: '#2f6fed' },
  send: { borderLeftWidth: 5, borderLeftColor: '#16a085' },
  cardIcon: { fontSize: 28, marginBottom: 8 },
  cardTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  cardDesc: { fontSize: 13, color: '#777', marginTop: 6, lineHeight: 19 },
  foot: { marginTop: 40, fontSize: 12, color: '#aaa', textAlign: 'center', lineHeight: 18 },
});
