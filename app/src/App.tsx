import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import Toast from 'react-native-toast-message';
import DocumentPicker from 'react-native-document-picker';
import { transfer } from './services/transfer';
import { ensurePermissions } from './services/permissions';
import { ble } from './services/ble';
import type { AppPhase, Handshake, PeerInfo, TransferProgress, Role } from './types';

import HomeScreen from './screens/HomeScreen';
import ReceiverScreen from './screens/ReceiverScreen';
import SenderScreen from './screens/SenderScreen';
import ResultScreen from './screens/ResultScreen';

export default function App() {
  const [phase, setPhase] = useState<AppPhase>('idle');
  const [role, setRole] = useState<Role | null>(null);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [handshake, setHandshake] = useState<Handshake | null>(null);
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [sentBytes, setSentBytes] = useState(0);
  const [connectedName, setConnectedName] = useState<string | null>(null);
  const handshakesRef = useRef<Record<string, string>>({});

  useEffect(() => {
    // Wire the Rust engine callbacks into React state once at startup.
    transfer.init({
      onPeerFound: (id, name) => {
        setPeers((prev) => (prev.some((p) => p.device_id === id) ? prev : [...prev, { device_id: id, name }]));
      },
      onLog: (m) => setLogs((prev) => [...prev.slice(-40), m]),
      onProgress: (p) => setProgress(p),
    });
    return () => {
      transfer.stopDiscovery();
      transfer.stopReceiver();
      ble.destroy();
    };
  }, []);

  const pushLog = useCallback((m: string) => setLogs((prev) => [...prev.slice(-40), m]), []);

  const chooseRole = useCallback(
    async (r: Role) => {
      setRole(r);
      setPhase('requesting-permissions');
      const perm = await ensurePermissions();
      if (!perm.ok) {
        setPhase('error');
        Toast.show({ type: 'error', text1: '权限不足', text2: perm.reason });
        return;
      }
      const on = await ble.ensureBluetoothOn();
      if (!on) {
        setPhase('error');
        Toast.show({
          type: 'error',
          text1: '蓝牙未开启',
          text2: Platform.OS === 'ios' ? '请在控制中心开启蓝牙后重试' : '请开启蓝牙后重试',
        });
        return;
      }
      setPhase(r === 'receiver' ? 'advertising' : 'discovering');
    },
    [],
  );

  const startReceiverFlow = useCallback(async () => {
    try {
      const { getLocalIp, getSaveDir } = await import('./services/network');
      const ip = await getLocalIp();
      const dir = getSaveDir();
      const hs = await transfer.startReceiver(ip, dir, 8787);
      setHandshake(hs);
      const payload = transfer.toQrPayload(hs);
      await ble.startAdvertising(hs.device_name || 'SwiftShare');
      await ble.publishHandshake(payload);
      pushLog(`本机 IP ${ip}:${hs.port}，已广播握手`);
      setPhase('advertising');
    } catch (e: any) {
      setPhase('error');
      Toast.show({ type: 'error', text1: '启动接收失败', text2: e?.message ?? String(e) });
    }
  }, [pushLog]);

  useEffect(() => {
    if (phase === 'advertising' && role === 'receiver' && !handshake) {
      startReceiverFlow();
    }
    if (phase === 'discovering' && role === 'sender') {
      transfer.startDiscovery();
    }
  }, [phase, role, handshake, startReceiverFlow]);

  const pickPeer = useCallback(
    async (peer: PeerInfo) => {
      setPhase('connected');
      setConnectedName(peer.name);
      const json = await ble.readHandshake(peer.device_id);
      if (!json) {
        setPhase('discovering');
        Toast.show({ type: 'error', text1: '读取握手失败', text2: '请让接收方重新广播' });
        return;
      }
      try {
        const hs = transfer.fromQrPayload(json);
        setHandshake(hs);
        handshakesRef.current[peer.device_id] = json;
        setPhase('connected'); // stay here so the user can pick files before sending
      } catch (e: any) {
        setPhase('discovering');
        Toast.show({ type: 'error', text1: '握手格式错误', text2: e?.message ?? String(e) });
      }
    },
    [],
  );

  const pickAndSend = useCallback(async () => {
    if (!handshake) {
      Toast.show({ type: 'error', text1: '尚未连接到接收方' });
      return;
    }
    try {
      const results = await DocumentPicker.pick({
        type: [DocumentPicker.types.images],
        allowMultiSelection: true,
      });
      const paths = results.map((r: any) => r.uri);
      if (!paths.length) return;
      setPhase('transferring');
      const bytes = await transfer.sendFiles(handshake, paths);
      setSentBytes(bytes);
      setPhase('done');
    } catch (e: any) {
      // Cancellation is not an error.
      if (DocumentPicker && DocumentPicker.isCancel && DocumentPicker.isCancel(e)) return;
      setPhase('error');
      Toast.show({ type: 'error', text1: '传输失败', text2: e?.message ?? String(e) });
    }
  }, [handshake]);

  const reset = useCallback(() => {
    transfer.stopDiscovery();
    transfer.stopReceiver();
    setPhase('idle');
    setRole(null);
    setPeers([]);
    setHandshake(null);
    setProgress(null);
    setLogs([]);
    setSentBytes(0);
    setConnectedName(null);
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      {phase === 'idle' && <HomeScreen onChoose={chooseRole} />}

      {(phase === 'requesting-permissions') && (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.hint}>正在申请权限…</Text>
        </View>
      )}

      {phase === 'advertising' && role === 'receiver' && (
        <ReceiverScreen handshake={handshake} logs={logs} onReset={reset} />
      )}

      {(phase === 'discovering' || phase === 'connected') && role === 'sender' && (
        <SenderScreen
          peers={peers}
          scanning={phase === 'discovering'}
          connectedName={connectedName}
          onPickPeer={pickPeer}
          onSendFiles={pickAndSend}
          onReset={reset}
        />
      )}

      {phase === 'transferring' && (
        <ResultScreen transferring progress={progress} logs={logs} onReset={reset} />
      )}

      {phase === 'done' && (
        <ResultScreen transferring={false} sentBytes={sentBytes} logs={logs} onReset={reset} />
      )}

      {phase === 'error' && (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>出错了</Text>
          <ScrollView style={styles.logBox}>
            <Text style={styles.logText}>{logs.join('\n')}</Text>
          </ScrollView>
          <TouchableOpacity style={styles.primaryBtn} onPress={reset}>
            <Text style={styles.primaryBtnText}>返回首页</Text>
          </TouchableOpacity>
        </View>
      )}

      <Toast />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f7f8fa' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  hint: { marginTop: 12, color: '#666' },
  errorTitle: { fontSize: 22, fontWeight: '700', color: '#d32f2f', marginBottom: 16 },
  logBox: { maxHeight: 240, width: '100%', backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 16 },
  logText: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11, color: '#444' },
  primaryBtn: { backgroundColor: '#2f6fed', paddingVertical: 14, paddingHorizontal: 36, borderRadius: 12 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
