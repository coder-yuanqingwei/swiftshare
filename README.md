# SwiftShare

安卓 ↔ iPhone 图片/文件互传 App。**热点组网 + 连接码握手 + WiFi 高速传输**，一套 TypeScript + React Native + Rust 代码覆盖两端。

> v0.2 起已移除蓝牙：BLE 吞吐仅约 20–100 KB/s、iOS 经典蓝牙需 MFi，不适合本产品主场景。握手改为「连接码复制/粘贴」，传输走局域网 HTTP，速度比蓝牙快几个数量级。

## 为什么这样设计

AirDrop / Quick Share 不能跨端，跨端互传必须自己实现。本项目采用与"快牙/互传"同款的思路：

```
① 一台设备开个人热点 —— 两台手机形成局域网（无需路由器/流量）
② 接收方生成「连接码」—— 含 IP + 端口 + token，用户发给对方复制/粘贴
③ WiFi HTTP —— 图片/文件走高速通道（Rust axum 服务端 + reqwest 客户端）
```

详细说明见 [docs/OFFLINE_FALLBACK.md](docs/OFFLINE_FALLBACK.md)。

Rust 承担"硬核"部分（HTTP 服务、流式上传、进度记帐、token 校验、**SHA256 完整性校验**），React Native 只做 UI 和编排，二者通过 UniFFI 生成的 TurboModule 通信（**无 JSON 桥接开销**）。

接收方 HTTP 服务用 `port: 0` 让系统自动分配空闲端口，避免多 App 抢 8787 端口冲突；每个文件传完接收方会校验 SHA256，不一致直接拒绝，保证图片不损坏。

## 技术栈

| 层 | 技术 |
|---|---|
| UI | TypeScript + React Native 0.76 |
| 跨语言桥 | uniffi-bindgen-react-native（UniFFI → TurboModule/JSI） |
| 核心逻辑 | Rust 2021（axum + reqwest + tokio） |
| 握手 | 可复制连接码（RN 核心 Clipboard）+ 二维码（react-native-qrcode-svg） |
| 文件/权限 | document-picker、fs、permissions、netinfo |

## 目录结构

```
swiftshare/
├── rust-core/                  # Rust crate（已通过 cargo check + test）
│   ├── Cargo.toml
│   ├── uniffi.toml
│   ├── src/lib.rs              # TransferEngine + BleAdapter/ProgressCallback 回调 + HTTP 收/发 + SHA256
│   └── src/bin/demo.rs         # PC 端可运行的完整传输演示（无需手机）
├── native-core/                # UniFFI TurboModule 库（app 通过 file: 依赖）
│   ├── ubrn.config.yaml        # 指向 ../rust-core 的本地配置
│   ├── package.json
│   └── src/index.ts            # 生成的绑定入口占位（生成后由 ubrn 覆盖）
├── app/                        # React Native 应用
│   ├── index.js                # uniffiInitAsync() 初始化
│   ├── App.tsx                 # 角色编排与状态机
│   └── src/
│       ├── types.ts
│       ├── services/
│       │   ├── connection.ts   # 连接码编解码 + 剪贴板复制/粘贴
│       │   ├── transfer.ts     # 调用 Rust engine 的门面
│       │   ├── permissions.ts  # 双端权限申请（无蓝牙）
│       │   └── network.ts      # 局域网检测 / LAN IP / 保存目录获取
│       └── screens/            # 首页 / 接收 / 发送 / 结果
├── app/native-templates/       # 可直接复制的原生配置模板
│   ├── android/                # AndroidManifest.xml + network_security_config.xml
│   └── ios/Info.plist
└── docs/
    └── NATIVE_SETUP.md         # 原生工程配置（权限、ubrn 生成步骤）
```

## 快速开始

```bash
# 1. 验证 Rust 核心（无需手机/SDK）—— 4 项测试含真实 HTTP 端到端传输
cd swiftshare/rust-core
cargo test

# 1b. 在 PC 上跑一次完整传输演示（无需手机，验证核心逻辑）
cargo run --bin swiftshare-demo
#   会打印：启动 HTTP 服务 → 传 2 个文件 → 进度 → SHA256 校验 → 字节比对

# 2. 安装 App 依赖
cd ../app && npm install

# 3. 生成原生绑定（需 Android SDK / macOS+Xcode，详见 docs/NATIVE_SETUP.md）
cd ../native-core
npx ubrn build android --and-generate   # Android
npx ubrn build ios --and-generate       # iOS（仅 macOS）

# 4. 配置原生权限（见 docs/NATIVE_SETUP.md）

# 5. 两台真机运行
cd ../app
npm run android   # 或 npm run ios
```

## 使用流程

1. 接收方：选「接收文件」→ 授权 → 本机开热点（或连同一 WiFi）→ App 生成连接码并展示二维码。
2. 发送方：加入接收方热点 → 选「发送文件」→ 粘贴对方发来的连接码（或扫二维码）→ 连接成功。
3. 发送方：点「选择图片并发送」→ 选图 → WiFi 高速传输，双方显示进度。

## 状态

- [x] Rust 核心：HTTP 收/发、握手、token 校验、**SHA256 完整性校验**、动态端口、进度回调、QR 序列化
- [x] 端到端验证：`cargo test` **4/4 通过**（含真实 HTTP 传输 + 错误拒绝），`cargo run --bin swiftshare-demo` 实跑成功
- [x] UniFFI 导出接口与本地 ubrn 配置
- [x] TypeScript 应用层：UI、连接码握手、权限、传输门面（语法检查 0 错误）
- [x] **v0.2 移除蓝牙**：握手改为热点 + 连接码复制/粘贴，删去 BLE 依赖与权限
- [x] **Android/iOS 原生配置模板**（含 ⚠️ HTTP 明文传输的 ATS / cleartext 关键配置）
- [x] **Android 原生工程已生成**（RN 0.76 官方模板，含 gradlew、权限、明文网络配置）
- [x] **GitHub Actions 云端打包 APK**（`.github/workflows/build-android.yml`，push 即自动构建）
- [ ] 生成 iOS 原生工程（需 macOS + Xcode）
- [ ] 两台真机端到端联调

> 无需真机即可验证核心：上面第 1、1b 步。真机配置见 `docs/NATIVE_SETUP.md`，云端打包 APK 见 `docs/CI_BUILD.md`。

## 云端编译打包 APK

仓库已配置 GitHub Actions，push 后自动在云端完成 Rust 交叉编译 + UniFFI 绑定生成 + APK 打包并上传。
操作方法与前提（含 GitHub 授权步骤）见 **`docs/CI_BUILD.md`**。

## 本轮修复的真实问题

- **v0.2 去掉蓝牙**：移除 ble-plx / peripheral-manager 依赖、蓝牙运行时权限、Manifest 蓝牙声明；改用热点 + 连接码握手（详见 OFFLINE_FALLBACK.md）。
- **iOS 保存路径**：原来传空串会写到根目录 `/SwiftShare`（无权限），改为 App Documents 目录。
- **HTTP 明文被系统拦截**：Android 9+/iOS ATS 默认禁止明文，补了 `network_security_config.xml` 与 `NSAllowsLocalNetworking`，否则传输必失败。
- **Rust 编译错误**：修复了 `resp.text()` 消费 response 后又读 status 的 move 错误。
