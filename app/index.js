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

/**
 * 诊断壳：第一时间注册渲染（先于一切原生初始化）。
 *
 * 关键事实（v0.2.3 修复）：
 * ubrn 生成的 react-native-swiftshare-core 是 "sync flavor" turbo module——
 * 包在 require() 时已同步执行 default.initialize() 完成初始化。
 * 它并没有导出名为 uniffiInitAsync 的函数（生成的包里根本没有这个符号），
 * 旧代码调用 core.uniffiInitAsync() 会抛 "undefined is not a function"，
 * 这就是自 v0.2 起打开白屏/闪退的真正根因。
 *
 * 因此这里只 require 一次触发原生初始化，不再调用不存在的函数。
 */
function CrashGate() {
  const [booting, setBooting] = useState(true);
  const [content, setContent] = useState(null);
  const [App, setApp] = useState(null);

  useEffect(() => {
    (async () => {
      // 1) 若有上次错误记录，展示出来（诊断用）
      try {
        const ok = await RNFS.exists(CRASH_FILE);
        if (ok) {
          const c = await RNFS.readFile(CRASH_FILE, 'utf8');
          if (c && c.trim()) {
            setContent(c);
            setBooting(false);
            return;
          }
        }
      } catch (_e) {}

      // 2) 触发 Rust 原生模块初始化（require 即初始化，无需调用额外函数）
      try {
        require('react-native-swiftshare-core');
      } catch (e) {
        const msg = 'NATIVE INIT ERROR\n\n' + fmtErr(e);
        try { await RNFS.writeFile(CRASH_FILE, msg, 'utf8'); } catch (_e2) {}
        setContent(msg);
        setBooting(false);
        return;
      }

      // 3) 加载主界面
      try {
        setApp(() => require('./src/App').default);
      } catch (e) {
        const msg = 'APP LOAD ERROR\n\n' + fmtErr(e);
        try { await RNFS.writeFile(CRASH_FILE, msg, 'utf8'); } catch (_e2) {}
        setContent(msg);
      } finally {
        setBooting(false);
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
            setBooting(true);
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
      <Text style={s.stage}>{booting ? '启动中…' : '加载主界面…'}</Text>
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

// 关键：无条件、第一时间注册组件，不再等待任何原生初始化。
AppRegistry.registerComponent(appName, () => CrashGate);
