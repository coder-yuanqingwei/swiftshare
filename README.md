# SwiftShare

安卓 ↔ iPhone 图片/文件互传 App。**蓝牙发现握手 + WiFi 高速传输**，一套 TypeScript + React Native + Rust 代码覆盖两端。

## 为什么这样设计

AirDrop / Quick Share 不能跨端，跨端互传必须自己实现。iOS 对蓝牙传大文件限制极严（经典蓝牙需 MFi，BLE 实际吞吐约 100 KB/s），所以本项目采用 AirDrop 同款思路：

```
① BLE 广播/扫描 —— 发现附近设备（不传文件）
② BLE 握手 —— 仅传一个几十字节的 Handshake（IP + 端口 + token）
③ WiFi HTTP —— 图片/文件走高速通道（Rust axum 服务端 + reqwest 客户端）
```

Rust 承担"硬核"部分（HTTP 服务、流式上传、进度记帐、token 校验、**SHA256 完整性校验**），React Native 只做 UI 和编排，二者通过 UniFFI 生成的 TurboModule 通信（**无 JSON 桥接开销**）。

接收方 HTTP 服务用 `port: 0` 让系统自动分配空闲端口，避免多 App 抢 8787 端口冲突；每个文件传完接收方会校验 SHA256，不一致直接拒绝，保证图片不损坏。

## 技术栈

| 层 | 技术 |
|---|---|
| UI | TypeScript + React Native 0.76 |
| 跨语言桥 | uniffi-bindgen-react-native（UniFFI → TurboModule/JSI） |
| 核心逻辑 | Rust 2021（axum + reqwest + tokio） |
| BLE | react-native-ble-plx（扫描）+ react-native-ble-peripheral-manager（广播） |
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
│       │   ├── ble.ts          # BLE Central/Peripheral 封装
│       │   ├── transfer.ts     # 调用 Rust engine 的门面
│       │   ├── permissions.ts  # 双端权限申请
│       │   └── network.ts      # 本机 LAN IP / 保存目录获取
│       └── screens/            # 首页 / 接收 / 发送 / 结果
├── app/native-templates/       # 可直接复制的原生配置模板
│   ├── android/                # AndroidManifest.xml + network_security_config.xml
│   └── ios/Info.plist
└── docs/
    └── NATIVE_SETUP.md         # 原生工程配置（权限、BLE、ubrn 生成步骤）
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

# 4. 配置原生权限与 BLE Peripheral（见 docs/NATIVE_SETUP.md）

# 5. 两台真机运行
cd ../app
npm run android   # 或 npm run ios
```

## 使用流程

1. 接收方：选「接收文件」→ 授权 → 展示二维码并广播蓝牙。
2. 发送方：选「发送文件」→ 授权 → 在附近设备列表选本机（或扫二维码）。
3. 发送方：点「选择图片并发送」→ 选图 → WiFi 高速传输，双方显示进度。

## 状态

- [x] Rust 核心：HTTP 收/发、握手、token 校验、**SHA256 完整性校验**、动态端口、进度回调、QR 序列化
- [x] 端到端验证：`cargo test` **4/4 通过**（含真实 HTTP 传输 + 错误拒绝），`cargo run --bin swiftshare-demo` 实跑成功
- [x] UniFFI 导出接口与本地 ubrn 配置
- [x] TypeScript 应用层：UI、BLE 服务、权限、传输门面（11 文件语法检查 0 错误）
- [x] **BLE Peripheral GATT server 真实落地**（按 peripheral-manager@0.3.0 实际 API 实现读请求动态应答、写请求监听）
- [x] **Android/iOS 原生配置模板**（含 ⚠️ HTTP 明文传输的 ATS / cleartext 关键配置）
- [ ] 原生工程搭建（`react-native init` 后套用 `app/native-templates/`，需 Android Studio / Xcode）
- [ ] 生成 UniFFI 原生绑定（`ubrn build --and-generate`，需 SDK）
- [ ] 两台真机端到端联调

> 无需真机即可验证核心：上面第 1、1b 步。剩下需在真机完成的步骤都写在 `docs/NATIVE_SETUP.md`。

## 本轮修复的真实问题

- **BLE Peripheral 从空壳变真实实现**：核对了 npm 包内 TypeScript 类型，按真实 API 用位掩码配置 GATT 特征、动态应答读请求。
- **iOS 保存路径**：原来传空串会写到根目录 `/SwiftShare`（无权限），改为 App Documents 目录。
- **HTTP 明文被系统拦截**：Android 9+/iOS ATS 默认禁止明文，补了 `network_security_config.xml` 与 `NSAllowsLocalNetworking`，否则传输必失败。
- **Rust 编译错误**：修复了 `resp.text()` 消费 response 后又读 status 的 move 错误。
