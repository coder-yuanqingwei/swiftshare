import { AppRegistry, Text, View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import React, { useEffect, useState } from 'react';
import RNFS from 'react-native-fs';
import { name as appName } from './app.json';

const CRASH_FILE = RNFS.ExternalDirectoryPath + '/swiftshare_crash.txt';

function fmtErr(e) {
  return e && e.stack ? e.stack : String(e);
}

// JS 层全局错误捕获：release 包未处理异常会直接闪退，先落盘供重启后展示。
if (global.ErrorUtils) {
  const prev = global.ErrorUtils.getGlobalHandler();
  global.ErrorUtils.setGlobalHandler((err, isFatal) => {
    try {
      const msg = 'JS ERROR (fatal=' + !!isFatal + ')\n' + fmtErr(err);
      RNFS.writeFile(CRASH_FILE, msg, 'utf8').catch(() => {});
    } catch (_e) {}
    if (prev) prev(err, isFatal);
  });
}

/**
 * 诊断壳：不依赖任何第三方原生模块（App/Rust 绑定全部懒加载）。
 * 启动时先读崩溃日志；有记录就显示错误全文，没有才初始化并加载正式 App。
 * 初始化过程中的任何错误也会落盘并展示，而不是闪退。
 */
function CrashGate() {
  const [content, setContent] = useState(null);
  const [ready, setReady] = useState(false);
  const [App, setApp] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const ok = await RNFS.exists(CRASH_FILE);
        if (ok) {
          const c = await RNFS.readFile(CRASH_FILE, 'utf8');
          if (c && c.trim()) {
            setContent(c);
            return;
          }
        }
        // 无崩溃记录：初始化 Rust 绑定 → 懒加载正式 App
        const core = require('react-native-swiftshare-core');
        await core.uniffiInitAsync();
        setApp(() => require('./src/App').default);
      } catch (e) {
        const msg = 'STARTUP ERROR\n' + fmtErr(e);
        try { await RNFS.writeFile(CRASH_FILE, msg, 'utf8'); } catch (_e) {}
        setContent(msg);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  if (!ready) return <View style={s.center} />;

  if (content) {
    return (
      <View style={s.center}>
        <Text style={s.title}>检测到上一次错误</Text>
        <Text style={s.sub}>点「复制错误信息」后粘贴发给开发者</Text>
        <ScrollView style={s.logBox}>
          <Text selectable style={s.log}>{content}</Text>
        </ScrollView>
        <TouchableOpacity
          style={s.btn}
          onPress={() => {
            RNFS.writeFile(CRASH_FILE, '', 'utf8').catch(() => {});
            setContent(null);
          }}>
          <Text style={s.btnText}>清除记录，继续打开 App</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (App) return <App />;
  return <View style={s.center} />;
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#f7f8fa', justifyContent: 'center', padding: 24 },
  title: { fontSize: 20, fontWeight: '700', color: '#d32f2f', marginBottom: 8 },
  sub: { fontSize: 13, color: '#555', marginBottom: 12 },
  logBox: { maxHeight: 360, backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 16 },
  log: { fontFamily: 'monospace', fontSize: 11, color: '#333' },
  btn: { backgroundColor: '#2f6fed', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700' },
});

AppRegistry.registerComponent(appName, () => CrashGate);
