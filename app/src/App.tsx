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
  Clipboard,
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
import ScannerScreen from './screens/ScannerScreen';
import ResultScreen from './screens/ResultScreen';

/** 把底层（Rust/系统）英文异常转成可读中文提示，便于用户自行排查。 */
function friendlyError(e: any): string {
  const raw = e?.message ?? String(e);
  const s = String(raw);
  if (/Permission denied|EACCES|os error 13|read-only file system/i.test(s)) {
    return `没有文件写入权限：${s}\n请开启个人热点或连接同一 WiFi 后重试。`;
  }
  if (/Address already in use|EADDRINUSE|os error 98/i.test(s)) {
    return `端口被占用：${s}\n请关闭其他传输类 App 后重试。`;
  }
  if (/checksum|mismatch/i.test(s)) {
    return `原生库版本不匹配：${s}\n请卸载旧版后重新安装。`;
  }
  if (/connection refused|unreachable|ECONN|network/i.test(s)) {
    return `网络连接失败：${s}\n请确认发送方已加入同一热点/WiFi。`;
  }
  return s;
}

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
  const [errorDetail, setErrorDetail] = useState<string>('');

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
        const msg = perm.reason ?? '未知权限错误';
        pushLog(`权限不足: ${msg}`);
        setErrorDetail(msg);
        setPhase('error');
        Toast.show({ type: 'error', text1: '权限不足', text2: msg });
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
    [pushLog],
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
      // port=0：由系统分配空闲端口，Rust 返回实际端口写进连接码，
      // 避免 8787 被占用时 bind 失败。
      const hs = await transfer.startReceiver(status.ip, dir, 0);
      setHandshake(hs);
      setConnectionCode(makeConnectionCode(hs));
      setNetworkType(status.type);
      pushLog(`本机 IP ${status.ip}:${hs.port}，HTTP 服务就绪，连接码已生成`);
      setPhase('advertising');
    } catch (e: any) {
      const msg = friendlyError(e);
      pushLog(`启动接收失败: ${msg}`);
      setErrorDetail(msg);
      setPhase('error');
      Toast.show({ type: 'error', text1: '启动接收失败', text2: msg });
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
      const msg = e?.message ?? String(e);
      setCodeError(msg);
      Toast.show({ type: 'error', text1: '连接码无效', text2: msg });
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
      const msg = friendlyError(e);
      pushLog(`传输失败: ${msg}`);
      setErrorDetail(msg);
      setPhase('error');
      Toast.show({ type: 'error', text1: '传输失败', text2: msg });
    }
  }, [handshake, pushLog]);

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
    setErrorDetail('');
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

      {(phase === 'discovering' || phase === 'connected') && role === 'sender' && (
        <SenderScreen
          connectedName={connectedName}
          codeError={codeError}
          onConnectCode={connectByCode}
          onPaste={pasteFromClipboard}
          onScan={() => setPhase('scanning')}
          onSendFiles={pickAndSend}
          onReset={reset}
        />
      )}

      {phase === 'scanning' && role === 'sender' && (
        <ScannerScreen
          onScanned={(code) => {
            setPhase('discovering');
            connectByCode(code);
          }}
          onCancel={() => setPhase('discovering')}
        />
      )}

      {phase === 'transferring' && (
        <ResultScreen transferring progress={progress} logs={logs} onReset={reset} />
      )}

      {phase === 'done' && (
        <ResultScreen transferring={false} sentBytes={sentBytes} logs={logs} onReset={reset} />
      )}

      {phase === 'error' && (
        <ScrollView style={styles.center} contentContainerStyle={styles.centerContent}>
          <Text style={styles.bigIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>操作失败</Text>
          {errorDetail ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorCardLabel}>错误信息（可复制）</Text>
              <Text style={styles.errorCardText} selectable>{errorDetail}</Text>
            </View>
          ) : null}
          <ScrollView style={styles.logBox}>
            <Text style={styles.logText}>{logs.join('\n') || '（暂无日志）'}</Text>
          </ScrollView>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => {
              Clipboard.setString(`错误: ${errorDetail}\n日志:\n${logs.join('\n')}`);
              Toast.show({ type: 'success', text1: '已复制错误信息', text2: '可发给开发者排查' });
            }}>
            <Text style={styles.secondaryBtnText}>复制错误信息</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryBtn} onPress={reset}>
            <Text style={styles.primaryBtnText}>返回首页</Text>
          </TouchableOpacity>
        </ScrollView>
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
  errorCard: { width: '100%', backgroundColor: '#fff', borderLeftWidth: 4, borderLeftColor: '#d32f2f', borderRadius: 10, padding: 14, marginBottom: 16 },
  errorCardLabel: { fontSize: 12, color: '#999', marginBottom: 6 },
  errorCardText: { fontSize: 14, color: '#333', lineHeight: 20 },
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
