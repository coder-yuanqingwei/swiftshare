/**
 * Shared TypeScript types mirroring the UniFFI-generated records.
 * Once `ubrn build ... --and-generate` runs, these structurally match the
 * generated types in native-core/src/generated and can be replaced by imports.
 */

export interface Handshake {
  ip: string;
  port: number;
  token: string;
  device_name: string;
}

export interface PeerInfo {
  device_id: string;
  name: string;
}

export interface TransferProgress {
  current: number;   // u64
  total: number;     // u64
  file_index: number;
  file_count: number;
}

export type Role = 'sender' | 'receiver';

export type AppPhase =
  | 'idle'
  | 'requesting-permissions'
  | 'discovering'
  | 'advertising'
  | 'connected'
  | 'transferring'
  | 'done'
  | 'error';

/** A file picked from the device gallery / file picker. */
export interface PickedFile {
  uri: string;
  name: string;
  size: number;
  mimeType?: string;
}
