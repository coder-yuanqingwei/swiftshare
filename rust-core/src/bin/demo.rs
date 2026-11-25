//! SwiftShare core demo — runs the full WiFi transfer loop on a PC, no
//! Bluetooth or phone required. Useful to validate the Rust core before
//! wiring up the React Native app and real devices.
//!
//!   cargo run --bin swiftshare-demo

use std::error::Error;

use swiftshare_core::{ProgressCallback, TransferEngine, TransferProgress};

struct ConsoleProgress;

impl ProgressCallback for ConsoleProgress {
    fn on_progress(&self, p: TransferProgress) {
        println!(
            "  [progress] {}/{} bytes  (file {}/{})",
            p.current, p.total, p.file_index, p.file_count
        );
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    println!("== SwiftShare core demo ==");

    let root = std::env::temp_dir().join("swiftshare-demo");
    let src_dir = root.join("src");
    let dst_dir = root.join("received");
    tokio::fs::create_dir_all(&src_dir).await?;
    let _ = tokio::fs::remove_dir_all(&dst_dir).await;

    let file_a = src_dir.join("holiday_photo.jpg");
    let file_b = src_dir.join("notes.txt");
    let payload_a = b"fake JPEG bytes - SwiftShare WiFi transfer demo".repeat(256);
    let payload_b = b"hello from SwiftShare\n";
    tokio::fs::write(&file_a, &payload_a).await?;
    tokio::fs::write(&file_b, payload_b).await?;
    println!("prepared 2 files ({} + {} bytes)", payload_a.len(), payload_b.len());

    let engine = TransferEngine::new(None);
    let hs = engine
        .start_receiver("127.0.0.1".into(), dst_dir.to_str().unwrap().into(), 0)
        .await?;
    println!(
        "receiver ready at http://{}:{}/  token={}",
        hs.ip, hs.port, hs.token
    );
    println!("QR payload: {}", engine.make_qr_payload(hs.clone()));

    let paths = vec![
        file_a.to_str().unwrap().to_string(),
        file_b.to_str().unwrap().to_string(),
    ];
    let sent = engine
        .send_files(hs, paths, Box::new(ConsoleProgress))
        .await?;
    println!("sent {} bytes total", sent);

    let receipts = engine.received_files();
    println!("\nreceiver accepted {} file(s):", receipts.len());
    for r in &receipts {
        println!(
            "  - {}  {} bytes  sha256={}",
            r.name, r.size, r.sha256
        );
    }

    let got_a = tokio::fs::read(dst_dir.join("holiday_photo.jpg")).await?;
    let got_b = tokio::fs::read(dst_dir.join("notes.txt")).await?;
    assert_eq!(got_a, payload_a, "file A corrupted");
    assert_eq!(got_b, payload_b, "file B corrupted");
    println!("\nintegrity verified: received bytes match source exactly ✔");

    engine.stop_receiver();
    Ok(())
}
