import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import type { TransferProgress } from '../types';

interface Props {
  transferring: boolean;
  progress?: TransferProgress | null;
  sentBytes?: number;
  logs: string[];
  onReset: () => void;
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function ResultScreen({ transferring, progress, sentBytes, logs, onReset }: Props) {
  const pct = progress && progress.total > 0
    ? Math.min(100, Math.round((progress.current / progress.total) * 100))
    : 0;

  return (
    <View style={styles.container}>
      {transferring ? (
        <>
          <Text style={styles.bigIcon}>⚡</Text>
          <Text style={styles.title}>正在传输</Text>
          <Text style={styles.subtitle}>
            {progress ? `第 ${progress.file_index} / ${progress.file_count} 个文件` : '通过 WiFi 高速传输中…'}
          </Text>

          <View style={styles.barOuter}>
            <View style={[styles.barInner, { width: `${pct}%` }]} />
          </View>
          <Text style={styles.pctText}>{pct}%</Text>
          {progress && (
            <Text style={styles.bytesText}>
              {humanBytes(progress.current)} / {humanBytes(progress.total)}
            </Text>
          )}
          <Text style={styles.tip}>请保持两部手机靠近，不要切到后台</Text>
        </>
      ) : (
        <>
          <Text style={styles.bigIcon}>✓</Text>
          <Text style={styles.title}>传输完成</Text>
          <Text style={styles.subtitle}>
            已发送 {sentBytes ? humanBytes(sentBytes) : '全部文件'}
          </Text>
          <View style={styles.logBox}>
            <ScrollView>
              <Text style={styles.logText}>{logs.join('\n')}</Text>
            </ScrollView>
          </View>
          <TouchableOpacity style={styles.primaryBtn} onPress={onReset}>
            <Text style={styles.primaryBtnText}>完成</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  bigIcon: { fontSize: 72, color: '#16a085', marginBottom: 12 },
  title: { fontSize: 26, fontWeight: '800', color: '#1a1a1a' },
  subtitle: { fontSize: 14, color: '#777', marginTop: 8, marginBottom: 28 },
  barOuter: { width: '100%', height: 12, backgroundColor: '#e5e5e5', borderRadius: 6, overflow: 'hidden' },
  barInner: { height: '100%', backgroundColor: '#16a085', borderRadius: 6 },
  pctText: { fontSize: 20, fontWeight: '700', color: '#16a085', marginTop: 14 },
  bytesText: { fontSize: 13, color: '#888', marginTop: 6 },
  tip: { fontSize: 12, color: '#aaa', marginTop: 32, textAlign: 'center' },
  logBox: { width: '100%', maxHeight: 180, backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 20 },
  logText: { fontFamily: 'monospace', fontSize: 10, color: '#555' },
  primaryBtn: { backgroundColor: '#2f6fed', paddingVertical: 14, paddingHorizontal: 48, borderRadius: 12 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
