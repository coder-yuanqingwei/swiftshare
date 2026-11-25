import React, { useEffect, useState, useCallback } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import Toast from 'react-native-toast-message';
import DocumentPicker from 'react-native-document-picker';
import { transfer } from './services/transfer';
import { ensurePermissions } from './services/permissions';
import {
  makeConnectionCode,
  parseConnectionCode,
  copyConnectionCode,
  pasteFromClipboard,
} from './services/connection';
import { inspectLan } from './services/network';
import type { AppPhase, Handshake, TransferProgress, Role } from './types';

import HomeScreen from './screens/HomeScreen';
import ReceiverScreen from './screens/ReceiverScreen';
import SenderScreen from './screens/SenderScreen';
import ResultScreen from './screens/ResultScreen';

export default function App() {
  const [phase, setPhase] = useState<AppPhase>('idle');
  const [role, setRole] = useState<Role | null>(null);
  const [handshake, setHandshake] = useState<Handshake | null>(null);
  const [connectionCode, setConnectionCode] = useState('');
  const [networkType, setNetworkType] = useState('');
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [sentBytes, setSentBytes] = useState(0);
  const [connectedName, setConnectedName] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [hotspotHint, setHotspotHint] = useState<string>('');

  useEffect(() => {
    // Wire the Rust engine callbacks into React state once at startup.
    transfer.init({
      onPeerFound: () => {}, // 热点方案不再使用 BLE 设备发现
      onLog: (m) => setLogs((prev) => [...prev.slice(-40), m]),
      onProgress: (p) => setProgress(p),
    });
    return () => {
      transfer.stopReceiver();
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
      if (r === 'receiver') {
        setPhase('checking-network');
      } else {
        // 发送方：加入热点/WiFi 后手动输入连接码即可，无需网络预检（连接码里带 IP）。
        setCodeError(null);
        setPhase('discovering');
      }
    },
    [],
  );

  /** 接收方：检测局域网 → 启动 HTTP 服务 → 生成连接码。失败时进入热点引导。 */
  const startReceiverFlow = useCallback(async () => {
    setPhase('checking-network');
    try {
      const status = await inspectLan();
      if (!status.isLan || !status.ip) {
        setHotspotHint(
          !status.connected
            ? '当前没有网络连接。请打开个人热点，然后让发送方加入。'
            : status.type === 'cellular'
              ? '当前是蜂窝数据，无法设备间直连。请开启个人热点或连接同一 WiFi。'
              : '未获取到局域网 IP，请开启个人热点后重试。',
        );
        setPhase('setup-hotspot');
        return;
      }
      const { getSaveDir } = await import('./services/network');
      const dir = getSaveDir();
      const hs = await transfer.startReceiver(status.ip, dir, 8787);
      setHandshake(hs);
      setConnectionCode(makeConnectionCode(hs));
      setNetworkType(status.type);
      pushLog(`本机 IP ${status.ip}:${hs.port}，HTTP 服务就绪，连接码已生成`);
      setPhase('advertising');
    } catch (e: any) {
      setPhase('error');
      Toast.show({ type: 'error', text1: '启动接收失败', text2: e?.message ?? String(e) });
    }
  }, [pushLog]);

  useEffect(() => {
    if (phase === 'checking-network' && role === 'receiver') {
      startReceiverFlow();
    }
  }, [phase, role, startReceiverFlow]);

  /** 发送方：粘贴连接码 → 解析握手 → 进入待发送状态。 */
  const connectByCode = useCallback((code: string) => {
    try {
      const hs = parseConnectionCode(code);
      setHandshake(hs);
      setConnectedName(hs.device_name || hs.ip);
      setCodeError(null);
      pushLog(`已解析连接码，目标 ${hs.ip}:${hs.port}`);
      setPhase('connected');
    } catch (e: any) {
      setCodeError(e?.message ?? String(e));
      Toast.show({ type: 'error', text1: '连接码无效', text2: e?.message ?? String(e) });
    }
  }, [pushLog]);

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
      if (DocumentPicker && DocumentPicker.isCancel && DocumentPicker.isCancel(e)) return;
      setPhase('error');
      Toast.show({ type: 'error', text1: '传输失败', text2: e?.message ?? String(e) });
    }
  }, [handshake]);

  const reset = useCallback(() => {
    transfer.stopReceiver();
    setPhase('idle');
    setRole(null);
    setHandshake(null);
    setConnectionCode('');
    setNetworkType('');
    setProgress(null);
    setLogs([]);
    setSentBytes(0);
    setConnectedName(null);
    setCodeError(null);
    setHotspotHint('');
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      {phase === 'idle' && <HomeScreen onChoose={chooseRole} />}

      {(phase === 'requesting-permissions' || phase === 'checking-network') && (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.hint}>
            {phase === 'requesting-permissions' ? '正在申请权限…' : '正在检测网络…'}
          </Text>
        </View>
      )}

      {phase === 'setup-hotspot' && (
        <ScrollView style={styles.center} contentContainerStyle={styles.centerContent}>
          <Text style={styles.bigIcon}>🔥</Text>
          <Text style={styles.errorTitle}>需要局域网连接</Text>
          <Text style={styles.hotspotDesc}>{hotspotHint}</Text>
          <View style={styles.stepsCard}>
            <Text style={styles.step}>1. 本机打开「个人热点」</Text>
            <Text style={styles.step}>2. 让发送方连接此热点</Text>
            <Text style={styles.step}>3. 点击下方按钮重新检测</Text>
          </View>
          <TouchableOpacity style={styles.primaryBtn} onPress={startReceiverFlow}>
            <Text style={styles.primaryBtnText}>已开启热点，重新检测</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={reset}>
            <Text style={styles.secondaryBtnText}>返回首页</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {phase === 'advertising' && role === 'receiver' && (
        <ReceiverScreen
          handshake={handshake}
          connectionCode={connectionCode}
          networkType={networkType}
          logs={logs}
          onCopyCode={() => {
            copyConnectionCode(connectionCode);
            Toast.show({ type: 'success', text1: '已复制连接码', text2: '发送给对方即可' });
          }}
          onReset={reset}
        />
      )}

      {phase === 'discovering' && role === 'sender' && (
        <SenderScreen
          connectedName={connectedName}
          codeError={codeError}
          onConnectCode={connectByCode}
          onPaste={pasteFromClipboard}
          onSendFiles={pickAndSend}
          onReset={reset}
        />
      )}

      {phase === 'connected' && role === 'sender' && (
        <SenderScreen
          connectedName={connectedName}
          codeError={codeError}
          onConnectCode={connectByCode}
          onPaste={pasteFromClipboard}
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
  centerContent: { justifyContent: 'center', alignItems: 'center' },
  hint: { marginTop: 12, color: '#666' },
  bigIcon: { fontSize: 64, marginBottom: 12 },
  errorTitle: { fontSize: 22, fontWeight: '700', color: '#d32f2f', marginBottom: 16 },
  hotspotDesc: { fontSize: 14, color: '#555', textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  stepsCard: { width: '100%', backgroundColor: '#fff', borderRadius: 12, padding: 18, marginBottom: 24 },
  step: { fontSize: 15, color: '#333', lineHeight: 26 },
  logBox: { maxHeight: 240, width: '100%', backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 16 },
  logText: { fontFamily: 'monospace', fontSize: 11, color: '#444' },
  primaryBtn: { backgroundColor: '#2f6fed', paddingVertical: 14, paddingHorizontal: 36, borderRadius: 12, marginBottom: 12 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryBtn: { paddingVertical: 12, paddingHorizontal: 36 },
  secondaryBtnText: { color: '#666', fontWeight: '600', fontSize: 15 },
});
