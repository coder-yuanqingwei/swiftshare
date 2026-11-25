# 原生工程配置（关键，必须手动完成）

本项目采用 **bare React Native**（不用 Expo Go，因为 UniFFI TurboModule 含自定义原生代码）。
`native-core` 是一个 UniFFI TurboModule 库，通过 `file:` 依赖被 `app` 引用。

## 0. 前置条件

```bash
# Rust 目标平台
rustup target add aarch64-linux-android armv7-linux-androideabi
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
cargo install cargo-ndk

# Node 依赖
cd swiftshare/app && npm install
```

> ⚠️ 生成绑定需要 **Android SDK / NDK** 与 **macOS + Xcode**（iOS 构建只能在 Mac 上做）。
> 在没有这些 SDK 的机器上，只能验证 Rust core（`cargo check && cargo test`）和 TS 类型，
> 无法产出可安装的 APK/IPA。

---

## 1. Android 配置

### 1.1 `app/android/app/src/main/AndroidManifest.xml`

```xml
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.CHANGE_WIFI_STATE" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
```

`BLUETOOTH_SCAN` 若声明 `usesPermissionFlags="neverForLocation"`，则 Android 12+ 无需定位权限。

### 1.2 生成原生绑定

```bash
cd swiftshare/native-core
npm install
npx ubrn build android --and-generate
```

产物：
- `native-core/android/src/main/jniLibs/<abi>/*.so`
- `native-core/src/generated/*.ts`（TypeScript 绑定）
- `native-core/cpp/generated/*`（JSI 胶水）

### 1.3 BLE Peripheral 广播（接收方）

`services/ble.ts` 已按 `react-native-ble-peripheral-manager@0.3.0` 的**真实 API**完整实现：
GATT service/characteristic 注册、读请求动态应答（`onDidReceiveReadRequest` + `respondToRequest`）、
写请求监听、特征值更新。你无需再写广播逻辑，只需确认库已安装并完成 autolink（该库是 TurboModule，
RN 0.76 需开启 New Architecture 或确认兼容）。

关键实现点（`services/ble.ts`）：
- `startAdvertising()`：注册 SERVICE_UUID 服务，含可读 HANDSHAKE_CHAR_UUID + 可写 CONTROL_CHAR_UUID；
- `publishHandshake()`：把握手 JSON 写入特征值，读请求到来时返回最新值；
- GATT UUID 两端必须一致，见文件顶部常量。

### 1.4 ⚠️ HTTP 明文流量（必须配置，否则传输失败）

Rust 接收服务用明文 HTTP。Android 9+ / iOS ATS 默认禁止明文，必须放行，否则发送方
`fetch(http://...)` 直接失败：

```bash
# Android：把模板复制到工程
cp app/native-templates/android/network_security_config.xml \
   app/android/app/src/main/res/xml/network_security_config.xml
# 并在 AndroidManifest.xml 的 <application> 加：
#   android:networkSecurityConfig="@xml/network_security_config"
```

iOS 在 Info.plist 已含 `NSAppTransportSecurity` → `NSAllowsLocalNetworking = true`（仅放行局域网明文，
App Store 审核可过）。

### 1.5 原生配置模板

`app/native-templates/` 下有可直接复制的完整模板：
- `android/AndroidManifest.xml`（蓝牙双角色 + WiFi + 相册权限 + cleartext 配置引用）
- `android/network_security_config.xml`
- `ios/Info.plist`（蓝牙 + 本地网络 + Bonjour + 相册 + ATS + 后台模式）

把它们合并进 `react-native init` 生成的原生工程对应文件即可。

---

## 2. iOS 配置

### 2.1 `Info.plist`

```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>用于发现附近的设备并建立传输握手</string>
<key>NSLocalNetworkUsageDescription</key>
<string>用于在局域网内高速传输图片文件</string>
<key>NSBonjourServices</key>
<array>
  <string>_swiftshare._tcp</string>
</array>
<key>NSPhotoLibraryUsageDescription</key>
<string>用于选择要发送的图片</string>
```

> iOS 14+ 首次使用本地网络会弹权限框；必须在 `NSBonjourServices` 声明服务类型，
> 否则 mDNS/Bonjour 发现会**静默失败**。

### 2.2 Capabilities

- **Background Modes** → 勾选 `Uses Bluetooth LE accessories`（ble-plx 后台模式）
- Xcode Signing & Capabilities 中确认。

### 2.3 生成原生绑定（必须在 macOS）

```bash
cd swiftshare/native-core
npx ubrn build ios --and-generate
(cd example/ios && pod install)   # 若按官方库模板结构
# 然后把 native-core 作为 file: 依赖，pod install 会自动链接 xcframework
```

产物：`native-core/ios/build/*.xcframework`，由 CocoaPods 引入 app。

---

## 3. 平台差异速查

| 能力 | Android | iOS |
|---|---|---|
| BLE 扫描（Central） | ble-plx ✅ | ble-plx ✅ |
| BLE 广播（Peripheral） | peripheral-manager ✅ | peripheral-manager ✅（系统限制较少） |
| 经典蓝牙传文件 | 可做，但本项目不用 | ❌ 需 MFi，本项目不用 |
| WiFi 直连（WiFi Direct） | 可用 | ❌ 无；走同一 WiFi 或热点 |
| 文件落盘路径 | `/sdcard/SwiftShare` | App Documents 目录 |

---

## 4. 已知限制

1. **BLE 广播库较新**（`react-native-ble-peripheral-manager` 周下载量低），若不稳定，
   由于 Rust core 通过 `BleAdapter` 回调解耦，可只替换 `services/ble.ts` 的广播实现，
   或在原生层用 `CBPeripheralManager` / `BluetoothGattServer` 自行实现。
2. **iOS 后台**：切到后台后 HTTP server 与 BLE 广播会被系统挂起，传输时需保持前台。
3. **同一局域网**：两端需在同 WiFi，或一端开热点另一端加入；IP 由 `getLocalIp()` 获取。
