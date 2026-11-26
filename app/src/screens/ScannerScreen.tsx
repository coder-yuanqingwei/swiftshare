import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
} from 'react-native-vision-camera';
import type { Code } from 'react-native-vision-camera';

interface Props {
  /** 扫到合法连接码后回调（传入完整文本）。 */
  onScanned: (code: string) => void;
  /** 返回发送方主页。 */
  onCancel: () => void;
}

const CODE_PREFIX = 'SwiftShare1:';

export default function ScannerScreen({ onScanned, onCancel }: Props) {
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const [locked, setLocked] = useState(false);
  const [hint, setHint] = useState('把接收方的二维码放入框内');

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  const handleCodes = useCallback(
    (codes: Code[]) => {
      if (locked) return;
      for (const c of codes) {
        const value = c.value;
        if (!value) continue;
        if (value.startsWith(CODE_PREFIX)) {
          setLocked(true);
          setHint('已识别连接码');
          onScanned(value.trim());
          return;
        }
        // 扫到非本 App 的码：给出一次性提示，不中断扫描
        setHint('这不是 SwiftShare 连接码，请扫描接收方显示的二维码');
      }
    },
    [locked, onScanned],
  );

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: handleCodes,
  });

  if (!hasPermission) {
    return (
      <View style={styles.center}>
        <Text style={styles.icon}>📷</Text>
        <Text style={styles.title}>需要相机权限</Text>
        <Text style={styles.hint}>扫码连接需要访问相机，请在弹窗中允许。</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>允许相机权限</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondary} onPress={onCancel}>
          <Text style={styles.secondaryText}>返回</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (device == null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.hint}>正在准备相机…</Text>
        <TouchableOpacity style={styles.secondary} onPress={onCancel}>
          <Text style={styles.secondaryText}>返回</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={!locked}
        codeScanner={codeScanner}
      />
      {/* 取景框遮罩 */}
      <View style={styles.mask} pointerEvents="box-none">
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={onCancel}>
            <Text style={styles.backText}>‹ 返回</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.frameArea}>
          <View style={styles.frame} />
          <Text style={styles.hintOverlay}>{hint}</Text>
        </View>
        <View style={styles.bottomBar}>
          <Text style={styles.bottomText}>对准接收方屏幕上的二维码</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#f7f8fa' },
  icon: { fontSize: 56, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#1a1a1a', marginBottom: 8 },
  hint: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  btn: { backgroundColor: '#2f6fed', paddingVertical: 14, paddingHorizontal: 36, borderRadius: 12 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondary: { marginTop: 14, paddingVertical: 10, paddingHorizontal: 24 },
  secondaryText: { color: '#666', fontWeight: '600', fontSize: 15 },
  mask: { flex: 1 },
  topBar: { paddingTop: 48, paddingHorizontal: 16 },
  backBtn: { alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.45)', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20 },
  backText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  frameArea: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  frame: { width: 250, height: 250, borderWidth: 2, borderColor: '#fff', borderRadius: 16, backgroundColor: 'transparent' },
  hintOverlay: { color: '#fff', fontSize: 14, marginTop: 24, textAlign: 'center', textShadowColor: '#000', textShadowRadius: 4 },
  bottomBar: { paddingBottom: 48, alignItems: 'center' },
  bottomText: { color: '#eee', fontSize: 13 },
});
