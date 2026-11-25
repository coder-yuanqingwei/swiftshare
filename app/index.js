import { AppRegistry, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import React, { useEffect, useState } from 'react';
import RNFS from 'react-native-fs';
import { name as appName } from './app.json';

const CRASH_FILE = RNFS.ExternalDirectoryPath + '/swiftshare_crash.txt';

function fmtErr(e) {
  return e && e.stack ? e.stack : String(e);
}

// JS 层全局错误捕获：release 包未处理异常可能表现为白屏而非闪退，先落盘。
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

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(label + ' 超过 ' + (ms / 1000) + ' 秒未返回（疑似挂起）')), ms)
    ),
  ]);
}

/**
 * 诊断壳：第一时间注册渲染（先于一切原生初始化），任何阶段出错或挂起
 * 都会在屏幕上显示出来。修复点：v0.2.0 把 AppRegistry.registerComponent
 * 放在 uniffiInitAsync 之后，若初始化挂起/抛错则永远白屏。
 */
function CrashGate() {
  const [stage, setStage] = useState('启动中…');
  const [content, setContent] = useState(null); // 错误/崩溃详情
  const [App, setApp] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setStage('读取崩溃记录…');
        const ok = await RNFS.exists(CRASH_FILE);
        if (ok) {
          const c = await RNFS.readFile(CRASH_FILE, 'utf8');
          if (c && c.trim()) {
            setContent(c);
            return;
          }
        }

        setStage('初始化 Rust 引擎（uniffiInitAsync）…');
        const core = require('react-native-swiftshare-core');
        await withTimeout(
          Promise.resolve(core.uniffiInitAsync()),
          10000,
          'uniffiInitAsync'
        );

        setStage('加载主界面…');
        setApp(() => require('./src/App').default);
      } catch (e) {
        const msg = 'STARTUP ERROR\n阶段: ' + stage + '\n\n' + fmtErr(e);
        try { await RNFS.writeFile(CRASH_FILE, msg, 'utf8'); } catch (_e) {}
        setContent(msg);
      }
    })();
  }, []);

  if (content) {
    return (
      <View style={s.center}>
        <Text style={s.title}>检测到启动错误</Text>
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

  return (
    <View style={s.center}>
      <ActivityIndicator size="large" />
      <Text style={s.stage}>{stage}</Text>
      <Text style={s.hint}>如果长时间停在这一行，说明卡在这一步</Text>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#f7f8fa', justifyContent: 'center', padding: 24 },
  title: { fontSize: 20, fontWeight: '700', color: '#d32f2f', marginBottom: 8 },
  sub: { fontSize: 13, color: '#555', marginBottom: 12 },
  logBox: { maxHeight: 360, backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 16 },
  log: { fontFamily: 'monospace', fontSize: 11, color: '#333' },
  btn: { backgroundColor: '#2f6fed', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700' },
  stage: { marginTop: 16, fontSize: 14, color: '#333', fontWeight: '600' },
  hint: { marginTop: 8, fontSize: 11, color: '#999' },
});

// 关键修复：无条件、第一时间注册组件，不再等待任何原生初始化。
AppRegistry.registerComponent(appName, () => CrashGate);
