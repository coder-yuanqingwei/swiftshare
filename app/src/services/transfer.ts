/**
 * Bridge between the React UI and the Rust `TransferEngine` exposed via UniFFI.
 *
 * At build time `ubrn build <platform> --and-generate` emits TypeScript
 * bindings into native-core/src/generated and an entry module. These imports
 * point at the published library entry `react-native-swiftshare-core`, which
 * re-exports the generated types. If your generated names differ, adjust only
 * this file — the UI depends on the `TransferController` facade below.
 */
import {
  TransferEngine,
  BleAdapter,
  ProgressCallback,
  Handshake,
  TransferProgress as RustProgress,
} from 'react-native-swiftshare-core';

import type { Handshake as UiHandshake, TransferProgress } from '../types';

/** TS implementation of the Rust `BleAdapter` callback interface. */
class TsBleAdapter implements BleAdapter {
  constructor(private onPeer: (id: string, name: string) => void, private onMsg: (m: string) => void) {}

  on_peer_found(device_id: string, name: string): void {
    this.onPeer(device_id, name);
  }

  on_log(message: string): void {
    this.onMsg(message);
  }
}

/** TS implementation of the Rust `ProgressCallback` callback interface. */
class TsProgress implements ProgressCallback {
  constructor(private cb: (p: TransferProgress) => void) {}

  on_progress(progress: RustProgress): void {
    this.cb({
      current: Number(progress.current),
      total: Number(progress.total),
      file_index: progress.file_index,
      file_count: progress.file_count,
    });
  }
}

export interface TransferHooks {
  onPeerFound(id: string, name: string): void;
  onLog(message: string): void;
  onProgress(progress: TransferProgress): void;
}

class TransferController {
  private engine: TransferEngine | null = null;
  private hooks: TransferHooks = {
    onPeerFound: () => {},
    onLog: () => {},
    onProgress: () => {},
  };

  /** Must be called after `uniffiInitAsync()` resolves (see index.js). */
  init(hooks: TransferHooks): void {
    this.hooks = hooks;
    const adapter = new TsBleAdapter(
      (id, name) => {
        this.hooks.onPeerFound(id, name);
      },
      (m) => this.hooks.onLog(m),
    );
    // v0.2 热点方案：引擎仅负责 HTTP/校验/状态机。适配器只承载日志回调，
    // 不再驱动任何 BLE 硬件（构造函数签名由 UniFFI 固定，故仍传一个实例）。
    this.engine = new TransferEngine(adapter);
  }

  private require(): TransferEngine {
    if (!this.engine) throw new Error('TransferEngine not initialized — call init() first');
    return this.engine;
  }

  /** Receiver: start HTTP server, return the handshake to advertise/encode. */
  async startReceiver(localIp: string, saveDir: string, port = 8787): Promise<UiHandshake> {
    const rustHs: Handshake = await this.require().start_receiver(localIp, saveDir, port);
    return {
      ip: rustHs.ip,
      port: rustHs.port,
      token: rustHs.token,
      device_name: rustHs.device_name,
    };
  }

  stopReceiver(): void {
    this.require().stop_receiver();
  }

  /** Receiver: files accepted so far, for post-transfer confirmation. */
  getReceivedFiles(): Array<{ name: string; size: number; sha256: string }> {
    return this.require().received_files().map((f) => ({
      name: f.name,
      size: Number(f.size),
      sha256: f.sha256,
    }));
  }

  /** Receiver: serialize handshake for the QR code / BLE characteristic. */
  toQrPayload(hs: UiHandshake): string {
    return this.require().make_qr_payload({ ...hs } as Handshake);
  }

  /** Sender: parse a scanned QR/BLE handshake payload. */
  fromQrPayload(json: string): UiHandshake {
    const hs = this.require().parse_qr_payload(json);
    return { ip: hs.ip, port: hs.port, token: hs.token, device_name: hs.device_name };
  }

  /** Sender: upload files to the receiver, streaming progress to the UI. */
  async sendFiles(hs: UiHandshake, paths: string[]): Promise<number> {
    const progress = new TsProgress((p) => this.hooks.onProgress(p));
    const total = await this.require().send_files({ ...hs } as Handshake, paths, progress);
    return Number(total);
  }

  // v0.2 热点方案：设备发现改为手动输入连接码，以下方法保留为空以兼容调用点。
  startDiscovery(): void {
    /* no-op: 握手已改为连接码 */
  }

  stopDiscovery(): void {
    /* no-op */
  }
}

export const transfer = new TransferController();
