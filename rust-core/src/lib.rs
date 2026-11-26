//! SwiftShare core — cross-platform transfer engine.
//!
//! Design goal: keep the "hard" parts (HTTP file server, chunked upload,
//! progress accounting, token handshake, integrity check) in one Rust crate
//! that is compiled for Android (.so), iOS (.a / xcframework) and driven from
//! TypeScript via UniFFI-generated bindings. Bluetooth advertisement/scanning
//! stays in the native layer (Swift/Kotlin) and is injected through the
//! `BleAdapter` callback interface; this crate only deals with the WiFi
//! high-throughput leg and the tiny control-plane handshake.

uniffi::setup_scaffolding!();

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

use base64::Engine as _;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::io::AsyncReadExt;

// ---------------------------------------------------------------------------
// Data model exposed to TypeScript
// ---------------------------------------------------------------------------

/// The tiny payload exchanged over BLE to bootstrap a WiFi transfer.
#[derive(Debug, Clone, Serialize, Deserialize, uniffi::Record)]
pub struct Handshake {
    /// LAN address of the receiver, e.g. "192.168.1.23"
    pub ip: String,
    /// Port the temporary HTTP server listens on, e.g. 8787
    pub port: u16,
    /// One-time token the sender must present (prevents stray connections)
    pub token: String,
    /// Human-friendly device name shown in the picker
    pub device_name: String,
}

/// A discovered nearby peer (filled by the native BLE layer).
#[derive(Debug, Clone, uniffi::Record)]
pub struct PeerInfo {
    pub device_id: String,
    pub name: String,
}

/// Progress snapshot pushed to the UI during a transfer.
#[derive(Debug, Clone, Copy, uniffi::Record)]
pub struct TransferProgress {
    pub current: u64,
    pub total: u64,
    pub file_index: u32,
    pub file_count: u32,
}

/// Confirmed receipt for one successfully received file.
#[derive(Debug, Clone, Serialize, Deserialize, uniffi::Record)]
pub struct FileReceipt {
    pub name: String,
    pub size: u64,
    pub sha256: String,
}

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum TransferError {
    #[error("socket/network failure: {0}")]
    Network(String),
    #[error("filesystem failure: {0}")]
    Io(String),
    #[error("invalid state or argument: {0}")]
    InvalidState(String),
    #[error("remote rejected the transfer: {0}")]
    Rejected(String),
}

impl From<std::io::Error> for TransferError {
    fn from(e: std::io::Error) -> Self {
        TransferError::Io(e.to_string())
    }
}

impl From<reqwest::Error> for TransferError {
    fn from(e: reqwest::Error) -> Self {
        TransferError::Network(e.to_string())
    }
}

// ---------------------------------------------------------------------------
// Callbacks implemented by the native (Swift/Kotlin) and TS layers
// ---------------------------------------------------------------------------

/// Implemented in Kotlin/Swift. Rust calls into it to drive BLE advertisement
/// and discovery. Keeping this as a trait means Rust never needs to know the
/// platform BLE APIs, and swapping the flaky third-party peripheral library
/// only touches native code.
#[uniffi::export(callback_interface)]
pub trait BleAdapter: Send + Sync {
    fn on_peer_found(&self, device_id: String, name: String);
    fn on_log(&self, message: String);
}

/// Implemented in TypeScript to update progress bars.
#[uniffi::export(callback_interface)]
pub trait ProgressCallback: Send + Sync {
    fn on_progress(&self, progress: TransferProgress);
}

// ---------------------------------------------------------------------------
// Tokio runtime owner
// ---------------------------------------------------------------------------

/// UniFFI 导出的 async 方法由宿主（RN 的 JS executor）驱动，其 poll 上下
/// 文里**没有 Tokio reactor**，直接调用 tokio::fs / TcpListener::bind /
/// tokio::spawn 会抛 "there is no reactor running"。
///
/// 解决：自建一个常驻 multi-thread runtime，把所有需要 reactor 的实际工作
/// spawn 进去执行；对外 async 方法只 await 一个 oneshot（不依赖 reactor）。
/// 用 OnceLock 保证全进程只建一次，且线程安全。
fn runtime() -> &'static tokio::runtime::Runtime {
    static RT: OnceLock<tokio::runtime::Runtime> = OnceLock::new();
    RT.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .thread_name("swiftshare-tokio")
            .enable_all()
            .build()
            .expect("failed to build SwiftShare Tokio runtime")
    })
}

// ---------------------------------------------------------------------------
// Internal HTTP receiver
// ---------------------------------------------------------------------------

#[derive(Clone)]
struct ReceiverState {
    token: String,
    save_dir: PathBuf,
    received: Arc<Mutex<HashMap<String, FileReceipt>>>,
}

async fn upload_handler(
    axum::extract::Query(params): axum::extract::Query<HashMap<String, String>>,
    axum::extract::State(state): axum::extract::State<ReceiverState>,
    body: axum::body::Bytes,
) -> Result<String, (axum::http::StatusCode, String)> {
    // Token check — reject stray scanners on the LAN.
    let presented = params.get("token").map(String::as_str).unwrap_or("");
    if presented != state.token {
        return Err((axum::http::StatusCode::UNAUTHORIZED, "bad token".into()));
    }

    // Integrity check: sender supplies the SHA256 of the file in the query.
    let expected = params.get("sha256").map(String::as_str).unwrap_or("");
    let actual = hex::encode(Sha256::digest(&body));
    if !expected.is_empty() && expected != actual {
        return Err((
            axum::http::StatusCode::BAD_REQUEST,
            format!("checksum mismatch: expected {}, got {}", expected, actual),
        ));
    }

    let name = params.get("name").map(String::as_str).unwrap_or("file.bin");
    // Sanitize: keep only the file name component to avoid path traversal.
    let safe_name = PathBuf::from(name)
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "file.bin".to_string());
    let dest = state.save_dir.join(&safe_name);

    let len = body.len() as u64;
    tokio::fs::write(&dest, &body)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    state.received.lock().unwrap().insert(
        safe_name.clone(),
        FileReceipt {
            name: safe_name.clone(),
            size: len,
            sha256: actual,
        },
    );

    tracing::info!("received {} ({} bytes) -> {:?}", safe_name, len, dest);
    Ok(format!("ok:{}", len))
}

async fn health_handler() -> &'static str {
    "swiftshare-core alive"
}

async fn status_handler(
    axum::extract::State(state): axum::extract::State<ReceiverState>,
) -> String {
    let files: Vec<FileReceipt> = {
        let guard = state.received.lock().unwrap();
        guard.values().cloned().collect()
    };
    serde_json::to_string(&files).unwrap_or_else(|_| "[]".into())
}

// ---------------------------------------------------------------------------
// TransferEngine — the object TypeScript talks to
// ---------------------------------------------------------------------------

#[derive(uniffi::Object)]
pub struct TransferEngine {
    // Arc 而非 Box：需要把日志回调克隆进常驻 runtime 的任务里。
    // constructor 对外签名仍是 Option<Box<dyn BleAdapter>>，入口处转 Arc。
    ble: Option<Arc<dyn BleAdapter>>,
    server_handle: Arc<Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
    receiver_port: Arc<Mutex<u16>>,
    received: Arc<Mutex<HashMap<String, FileReceipt>>>,
}

#[uniffi::export]
impl TransferEngine {
    #[uniffi::constructor]
    pub fn new(ble: Option<Box<dyn BleAdapter>>) -> Self {
        let ble: Option<Arc<dyn BleAdapter>> = ble.map(|b| Arc::from(b));
        Self {
            ble,
            server_handle: Arc::new(Mutex::new(None)),
            receiver_port: Arc::new(Mutex::new(8787)),
            received: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Ask the native BLE layer to start advertising / discovering, then
    /// return the list of peers as they show up (via `BleAdapter.on_peer_found`).
    pub fn start_ble_discovery(&self) -> Result<(), TransferError> {
        match &self.ble {
            Some(adapter) => {
                adapter.on_log("Rust: BLE discovery requested".to_string());
                Ok(())
            }
            None => Err(TransferError::InvalidState(
                "no BleAdapter injected — pass one to TransferEngine.new()".into(),
            )),
        }
    }

    /// Receiver side: spin up the temporary HTTP server on `port`, write
    /// incoming files into `save_dir`, and return a Handshake object that the
    /// caller should broadcast over BLE (or encode into a QR code).
    ///
    /// Pass `port = 0` to let the OS pick a free port; the returned Handshake
    /// always carries the *actual* bound port.
    ///
    /// 注意：UniFFI 从 RN 驱动本 future 时没有 Tokio reactor，故实际工作
    /// spawn 到我们自带的常驻 runtime，本方法只 await 一个 oneshot。
    pub async fn start_receiver(
        &self,
        local_ip: String,
        save_dir: String,
        port: u16,
    ) -> Result<Handshake, TransferError> {
        let ble = self.ble.clone();
        let server_handle = self.server_handle.clone();
        let receiver_port = self.receiver_port.clone();
        let received = self.received.clone();

        let (tx, rx) = tokio::sync::oneshot::channel::<Result<Handshake, TransferError>>();
        runtime().spawn(async move {
            let result = start_receiver_inner(
                local_ip, save_dir, port, ble, server_handle, receiver_port, received,
            )
            .await;
            let _ = tx.send(result);
        });

        rx.await
            .map_err(|_| TransferError::InvalidState("receiver task cancelled".into()))?
    }

    /// Stop the receiver HTTP server.
    pub fn stop_receiver(&self) {
        if let Some(tx) = self.server_handle.lock().unwrap().take() {
            let _ = tx.send(());
        }
    }

    /// Query files the receiver has accepted so far (for UI confirmation).
    pub fn received_files(&self) -> Vec<FileReceipt> {
        let guard = self.received.lock().unwrap();
        let mut files: Vec<FileReceipt> = guard.values().cloned().collect();
        files.sort_by(|a, b| a.name.cmp(&b.name));
        files
    }

    /// Sender side: upload one or more local files to the receiver described
    /// by `handshake`. Streams each file with reqwest and reports progress.
    ///
    /// 与 start_receiver 同理：实际工作 spawn 到常驻 runtime，本方法只等 oneshot。
    pub async fn send_files(
        &self,
        handshake: Handshake,
        paths: Vec<String>,
        progress: Box<dyn ProgressCallback>,
    ) -> Result<u64, TransferError> {
        let ble = self.ble.clone();
        let (tx, rx) = tokio::sync::oneshot::channel::<Result<u64, TransferError>>();
        runtime().spawn(async move {
            let result = send_files_inner(handshake, paths, progress, ble).await;
            let _ = tx.send(result);
        });
        rx.await
            .map_err(|_| TransferError::InvalidState("send task cancelled".into()))?
    }

    /// Encode a handshake into a compact JSON string for the QR code.
    /// The sender scans this and reconstructs the Handshake in TS.
    pub fn make_qr_payload(&self, handshake: Handshake) -> String {
        serde_json::to_string(&handshake).unwrap_or_default()
    }

    /// Parse a QR payload back into a Handshake.
    pub fn parse_qr_payload(&self, json: String) -> Result<Handshake, TransferError> {
        serde_json::from_str(&json).map_err(|e| TransferError::InvalidState(e.to_string()))
    }
}

/// 真正执行发送的内部函数（运行在常驻 Tokio runtime 上，有 reactor）。
async fn send_files_inner(
    handshake: Handshake,
    paths: Vec<String>,
    progress: Box<dyn ProgressCallback>,
    ble: Option<Arc<dyn BleAdapter>>,
) -> Result<u64, TransferError> {
        if paths.is_empty() {
            return Err(TransferError::InvalidState("no files selected".into()));
        }

        let client = reqwest::Client::builder()
            .no_proxy()
            .build()
            .map_err(|e| TransferError::Network(e.to_string()))?;

        let total_files = paths.len() as u32;
        let mut grand_total = 0u64;
        let mut sizes = Vec::with_capacity(paths.len());
        for p in &paths {
            let meta = tokio::fs::metadata(p).await?;
            sizes.push(meta.len());
            grand_total += meta.len();
        }

        let mut sent = 0u64;
        for (idx, (path, size)) in paths.iter().zip(sizes.iter()).enumerate() {
            let name = PathBuf::from(path)
                .file_name()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_else(|| "file.bin".to_string());

            // Stream the file once to compute its checksum, then stream it
            // again for upload — constant memory even for large photos/videos.
            let digest = {
                let mut file = tokio::fs::File::open(path).await?;
                let mut hasher = Sha256::new();
                let mut buf = [0u8; 64 * 1024];
                loop {
                    let n = file.read(&mut buf).await?;
                    if n == 0 {
                        break;
                    }
                    hasher.update(&buf[..n]);
                }
                hex::encode(hasher.finalize())
            };

            let file = tokio::fs::File::open(path).await?;
            let reader = tokio_util::io::ReaderStream::new(file);
            let body = reqwest::Body::wrap_stream(reader);

            let url = format!(
                "http://{}:{}/upload?token={}&name={}&sha256={}",
                handshake.ip,
                handshake.port,
                url_encode(&handshake.token),
                url_encode(&name),
                url_encode(&digest),
            );

            let resp = client.post(&url).body(body).send().await?;
            if !resp.status().is_success() {
                let status = resp.status().as_u16();
                let text = resp.text().await.unwrap_or_default();
                return Err(TransferError::Rejected(format!(
                    "{} responded {}: {}",
                    name, status, text
                )));
            }

            sent += *size;
            progress.on_progress(TransferProgress {
                current: sent,
                total: grand_total,
                file_index: (idx + 1) as u32,
                file_count: total_files,
            });
        }

    if let Some(ble) = &ble {
        ble.on_log(format!("Rust: sent {} bytes across {} files", sent, total_files));
    }
    Ok(sent)
}

/// 真正启动接收服务并绑定端口的内部函数（运行在常驻 Tokio runtime 上，有 reactor）。
async fn start_receiver_inner(
    local_ip: String,
    save_dir: String,
    port: u16,
    ble: Option<Arc<dyn BleAdapter>>,
    server_handle: Arc<Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
    receiver_port: Arc<Mutex<u16>>,
    received: Arc<Mutex<HashMap<String, FileReceipt>>>,
) -> Result<Handshake, TransferError> {
    // Generate the token in a short scope: thread_rng() is !Send and must
    // be dropped before any .await so the future stays Send.
    let token = {
        let mut rng = rand::thread_rng();
        let mut bytes = [0u8; 12];
        rng.fill_bytes(&mut bytes);
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
    };

    tokio::fs::create_dir_all(&save_dir).await?;

    let state = ReceiverState {
        token: token.clone(),
        save_dir: PathBuf::from(&save_dir),
        received,
    };

    let app = axum::Router::new()
        .route("/", axum::routing::get(health_handler))
        .route("/upload", axum::routing::post(upload_handler))
        .route("/status", axum::routing::get(status_handler))
        .with_state(state);

    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .map_err(|e| TransferError::Network(format!("bind {}: {}", addr, e)))?;
    let bound_port = listener
        .local_addr()
        .map_err(|e| TransferError::Network(e.to_string()))?
        .port();

    let (tx, rx) = tokio::sync::oneshot::channel::<()>();
    *server_handle.lock().unwrap() = Some(tx);
    *receiver_port.lock().unwrap() = bound_port;

    let server = axum::serve(listener, app).with_graceful_shutdown(async move {
        let _ = rx.await;
    });

    tokio::spawn(async move {
        if let Err(e) = server.await {
            tracing::error!("HTTP receiver stopped with error: {}", e);
        }
    });

    if let Some(ble) = &ble {
        ble.on_log(format!("Rust: receiver listening on {}:{}", local_ip, bound_port));
    }

    Ok(Handshake {
        ip: local_ip,
        port: bound_port,
        token,
        device_name: String::new(),
    })
}

// Minimal percent-encoding for query values (tokens/filenames only).
fn url_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for b in input.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    struct NoProgress;
    impl ProgressCallback for NoProgress {
        fn on_progress(&self, _: TransferProgress) {}
    }

    #[test]
    fn qr_roundtrip() {
        let hs = Handshake {
            ip: "192.168.1.9".into(),
            port: 8787,
            token: "abcDEF123".into(),
            device_name: "Pixel".into(),
        };
        let engine = TransferEngine::new(None);
        let json = engine.make_qr_payload(hs.clone());
        let back = engine.parse_qr_payload(json).unwrap();
        assert_eq!(back.ip, hs.ip);
        assert_eq!(back.port, hs.port);
        assert_eq!(back.token, hs.token);
        assert_eq!(back.device_name, hs.device_name);
    }

    #[test]
    fn url_encoding() {
        assert_eq!(url_encode("a b/c"), "a%20b%2Fc");
        assert_eq!(url_encode("ABC-xyz_01.~"), "ABC-xyz_01.~");
        assert_eq!(url_encode("中文"), "%E4%B8%AD%E6%96%87");
    }

    /// 回归测试：模拟 RN/UniFFI 的驱动方式——用一个**没有 Tokio reactor**
    /// 的 executor 来 poll async 方法。修复前会抛 "there is no reactor
    /// running"，修复后应能正常拿到 Handshake。
    #[test]
    fn start_receiver_without_caller_tokio_runtime() {
        let dst = std::env::temp_dir().join(format!("ss-nort-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dst);
        let dst_str = dst.to_str().unwrap().to_string();

        let engine = TransferEngine::new(None);
        // block_on 只提供最小 future executor，没有 Tokio I/O driver。
        let hs = futures::executor::block_on(
            engine.start_receiver("127.0.0.1".into(), dst_str, 0),
        )
        .expect("start_receiver must work without caller Tokio runtime");
        assert_ne!(hs.port, 0, "bound port must be resolved");
        assert!(dst.join(".").exists(), "save dir must be created");
        engine.stop_receiver();
        let _ = std::fs::remove_dir_all(&dst);
    }

    #[tokio::test]
    async fn end_to_end_transfer_and_integrity() {
        let tag = format!("ss-test-{}", std::process::id());
        let root = std::env::temp_dir().join(tag);
        let src_dir = root.join("src");
        let dst_dir = root.join("dst");
        tokio::fs::create_dir_all(&src_dir).await.unwrap();
        let _ = tokio::fs::remove_dir_all(&dst_dir).await;

        let payload = b"SwiftShare end-to-end integrity payload";
        let src = src_dir.join("photo.jpg");
        tokio::fs::write(&src, payload).await.unwrap();

        let engine = TransferEngine::new(None);
        // port 0 -> OS picks a free port; Handshake must carry the real one.
        let hs = engine
            .start_receiver("127.0.0.1".into(), dst_dir.to_str().unwrap().into(), 0)
            .await
            .unwrap();
        assert_ne!(hs.port, 0, "bound port must be resolved");
        assert_eq!(hs.token.len(), 16, "URL-safe base64 of 12 bytes");

        let sent = engine
            .send_files(hs.clone(), vec![src.to_str().unwrap().into()], Box::new(NoProgress))
            .await
            .unwrap();
        assert_eq!(sent, payload.len() as u64);

        let got = tokio::fs::read(dst_dir.join("photo.jpg")).await.unwrap();
        assert_eq!(got, payload, "received bytes must match source");

        let receipts = engine.received_files();
        assert_eq!(receipts.len(), 1);
        assert_eq!(receipts[0].name, "photo.jpg");
        assert_eq!(receipts[0].size, payload.len() as u64);
        assert_eq!(receipts[0].sha256, hex::encode(Sha256::digest(payload)));

        engine.stop_receiver();
        let _ = tokio::fs::remove_dir_all(&root).await;
    }

    #[tokio::test]
    async fn rejects_bad_token_and_bad_checksum() {
        let tag = format!("ss-reject-{}", std::process::id());
        let root = std::env::temp_dir().join(tag);
        let dst = root.join("dst");
        let _ = tokio::fs::remove_dir_all(&root).await;

        let engine = TransferEngine::new(None);
        let hs = engine
            .start_receiver("127.0.0.1".into(), dst.to_str().unwrap().into(), 0)
            .await
            .unwrap();

        let client = reqwest::Client::new();
        let url = format!("http://127.0.0.1:{}/upload", hs.port);
        let bad_token = client
            .post(&url)
            .query(&[("token", "wrong"), ("name", "x.bin")])
            .body("data")
            .send()
            .await
            .unwrap();
        assert_eq!(bad_token.status(), axum::http::StatusCode::UNAUTHORIZED);

        let bad_sum = client
            .post(&url)
            .query(&[
                ("token", hs.token.as_str()),
                ("name", "x.bin"),
                ("sha256", "deadbeef"),
            ])
            .body("data")
            .send()
            .await
            .unwrap();
        assert_eq!(bad_sum.status(), axum::http::StatusCode::BAD_REQUEST);

        engine.stop_receiver();
        let _ = tokio::fs::remove_dir_all(&root).await;
    }
}
