/**
 * Public entry for the `react-native-swiftshare-core` TurboModule library.
 *
 * During `ubrn build ios|android --and-generate`, the generator writes the
 * real bindings into ./generated and rewrites this file's exports. This stub
 * documents the expected surface so the app can be typechecked before a native
 * build, and mirrors exactly what UniFFI emits from rust-core/src/lib.rs.
 *
 * DO NOT hand-edit after generation — the generator owns this file.
 */

export interface Handshake {
  ip: string;
  port: number;
  token: string;
  device_name: string;
}

export interface TransferProgress {
  current: bigint;
  total: bigint;
  file_index: number;
  file_count: number;
}

export interface FileReceipt {
  name: string;
  size: bigint;
  sha256: string;
}

export interface BleAdapter {
  on_peer_found(device_id: string, name: string): void;
  on_log(message: string): void;
}

export interface ProgressCallback {
  on_progress(progress: TransferProgress): void;
}

export declare class TransferEngine {
  constructor(ble: BleAdapter | undefined);
  start_ble_discovery(): void;
  start_receiver(local_ip: string, save_dir: string, port: number): Promise<Handshake>;
  stop_receiver(): void;
  received_files(): FileReceipt[];
  send_files(handshake: Handshake, paths: string[], progress: ProgressCallback): Promise<bigint>;
  make_qr_payload(handshake: Handshake): string;
  parse_qr_payload(json: string): Handshake;
}

export declare function uniffiInitAsync(): Promise<void>;
