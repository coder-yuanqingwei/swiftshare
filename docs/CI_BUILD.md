# GitHub Actions 云端编译打包 APK

本项目已配置好 GitHub Actions 工作流：`.github/workflows/build-android.yml`。
推送代码后，云端会自动在 Linux runner 上完成 **Rust 交叉编译 → UniFFI 绑定生成 → APK 打包**，
并把 APK 作为 artifact 提供下载。

## 一、前提：授权 GitHub 连接器

当前环境的 GitHub 连接器**尚未授权**（网关返回 `Connector "github" is not authorized`）。
需要先在 **CodeBuddy 设置页 → 连接器 → GitHub** 完成 OAuth 授权。授权后我才能：
1. 在你账号下创建仓库；
2. 把本地已提交的代码推送上去；
3. 触发 Actions 运行。

> 授权完成后回来告诉我，我直接执行推送并盯构建结果。

## 二、CI 做了什么

工作流按以下顺序执行（每一步失败都会留下日志，便于定位）：

| 步骤 | 内容 |
|---|---|
| 1 | checkout 代码 |
| 2 | 装 Node 20 + JDK 17 + Android SDK |
| 3 | 装 NDK 26.1.10909125（与 RN 0.76 `build.gradle` 的 `ndkVersion` 一致） |
| 4 | 装 Rust stable + Android targets（arm64-v8a / armeabi-v7a） |
| 5 | 装 cargo-ndk |
| 6 | `npm install`（app + native-core） |
| 7 | `ubrn build android --config ubrn.config.yaml --and-generate`：交叉编译 Rust 成 `.so`、生成 JNI/TSI 绑定 |
| 8 | `./gradlew assembleRelease` 打出 APK |
| 9 | 上传 APK artifact；若推送的是 git tag，还会自动创建 Release 附 APK |

## 三、触发方式

- **自动**：push 到 `main` 或 `master` 分支。
- **手动**：GitHub 仓库 Actions 页 → 选 "Build Android APK" → Run workflow。
- **发 Release**：打 tag 推送（如 `git tag v0.1.0 && git push origin v0.1.0`），
  CI 会把 APK 直接挂到该 Release 上。

下载 APK：Actions 运行成功后，进入该次运行页面，底部 artifact 列表下载 `swiftshare-apk`。

## 四、本机已完成的准备工作

- [x] 用 RN 0.76 官方模板生成了 `app/android/` 原生工程（含 gradlew）。
- [x] 包名从 `com.helloworld` 改为 `com.swiftshare`，组件名对齐 `app.json` 的 SwiftShare。
- [x] 合并蓝牙/WiFi/相册权限到 `AndroidManifest.xml`。
- [x] 放入 `network_security_config.xml`，放行局域网明文 HTTP（否则传输失败）。
- [x] 给 native-core 加 `codegenConfig`，使 autolink 识别它为 TurboModule。
- [x] 修正 `ubrn.config.yaml`（按 0.31 真实字段：android.targets / bindings）。
- [x] git init 并提交（commit `c281e20`）。

## 五、已知风险与真实限制

1. **iOS 无法在这个工作流里打包**：IPA 需要 macOS runner + Apple 开发者证书 + 签名配置，
   且 GitHub 免费 macOS 额度有限。本工作流只产出 Android APK。如需 iOS，
   建议用 macOS 本地构建或配置 Apple Developer 证书后再加一个 `macos-14` job。
2. **首跑可能踩坑**：这是 UniFFI + RN 深度集成，首次 CI 可能遇到 NDK 版本、autolink、
   Kotlin 版本等兼容问题。日志会精确指出失败步骤，我把报错拿回来逐个修。
3. **BLE 广播库较新**：`react-native-ble-peripheral-manager` 周下载量很低，真机行为需实测；
   但 APK 能否编译出来与它运行时是否稳定是两回事——CI 只保证产出安装包。
4. **没有签名配置**：默认打的是 `assembleRelease`，用 debug 签名或 unsigned；
   可安装但无法上架 Google Play。如需正式签名，后续加 keystore secrets。
