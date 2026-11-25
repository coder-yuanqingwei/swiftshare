/**
 * BLE transport layer.
 *
 * Two roles share one App:
 *  - Receiver advertises a GATT service carrying the handshake JSON.
 *  - Sender scans for that service, connects, and reads the handshake.
 *
 * BLE only carries the tiny control-plane payload (the Handshake, a few
 * dozen bytes). All file bytes go over WiFi via the Rust HTTP engine.
 *
 * Libraries (APIs verified against react-native-ble-peripheral-manager@0.3.0):
 *  - react-native-ble-plx                 -> Central (scan + connect + read)
 *  - react-native-ble-peripheral-manager  -> Peripheral (advertise + GATT server)
 *
 * This class calls `onPeerFound` / `onLog` which the TS glue forwards into the
 * Rust `BleAdapter` callback interface.
 */

import { BleManager, Device, State } from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import * as Peripheral from 'react-native-ble-peripheral-manager';
import {
  CharacteristicProperties,
  CharacteristicPermissions,
  ATTError,
  ManagerState,
} from 'react-native-ble-peripheral-manager';

// Must match the UUIDs in native setup docs. 128-bit UUIDs work on both OSes.
export const SERVICE_UUID = '0000fff0-0000-1000-8000-00805f9b34fb';
export const HANDSHAKE_CHAR_UUID = '0000fff1-0000-1000-8000-00805f9b34fb';
export const CONTROL_CHAR_UUID = '0000fff2-0000-1000-8000-00805f9b34fb';

export interface BleCallbacks {
  onPeerFound(deviceId: string, name: string): void;
  onLog(message: string): void;
  onHandshakeReceived(json: string): void;
}

const utf8ToBase64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64');
const base64ToUtf8 = (s: string): string => Buffer.from(s, 'base64').toString('utf8');

class BleService {
  private manager = new BleManager();
  private scanning = false;
  private advertising = false;
  private gattReady = false;
  private handshakeJson = '';
  private callbacks?: BleCallbacks;
  private readSub?: { remove(): void };
  private writeSub?: { remove(): void };

  setCallbacks(cb: BleCallbacks) {
    this.callbacks = cb;
  }

  async ensureBluetoothOn(): Promise<boolean> {
    const state = await this.manager.state();
    if (state === State.PoweredOn) return true;
    try {
      if (state === State.PoweredOff) await this.manager.enable();
    } catch {
      /* iOS has no enable() — surface a message in the UI instead. */
    }
    return (await this.manager.state()) === State.PoweredOn;
  }

  /**
   * Receiver: register the GATT service/characteristics and start advertising.
   *
   * The handshake characteristic is Read + Notify. When a sender reads it we
   * respond with the current handshake JSON via `respondToRequest` — this
   * guarantees the token is up to date even if the receiver rotated it.
   */
  async startAdvertising(deviceName: string): Promise<void> {
    try {
      const pmState = await Peripheral.getState();
      if (pmState !== ManagerState.PoweredOn) {
        this.callbacks?.onLog(`BLE peripheral state not powered on: ${pmState}`);
        // Do not throw: QR fallback still works without BLE advertising.
        return;
      }

      // One-time event wiring for dynamic read/write handling.
      if (!this.readSub) {
        this.readSub = Peripheral.onDidReceiveReadRequest((event: any) => {
          const isHandshakeChar =
            String(event.characteristicUUID).toLowerCase() === HANDSHAKE_CHAR_UUID;
          if (isHandshakeChar && this.handshakeJson) {
            Peripheral.respondToRequest(event.requestId, ATTError.Success, this.handshakeJson);
            this.callbacks?.onLog('BLE: served handshake read request');
          } else {
            Peripheral.respondToRequest(event.requestId, ATTError.AttributeNotFound);
          }
        });
      }
      if (!this.writeSub) {
        this.writeSub = Peripheral.onDidReceiveWriteRequests((event: any) => {
          // Control plane: sender may write "ACK <name>" etc.
          for (const req of event.requests || []) {
            try {
              const text = base64ToUtf8(req.value);
              this.callbacks?.onLog(`BLE control rx: ${text}`);
            } catch {
              /* ignore malformed control writes */
            }
          }
          Peripheral.respondToRequest(event.requestId, ATTError.Success);
        });
      }

      if (!this.gattReady) {
        Peripheral.removeAllServices();
        Peripheral.addService(SERVICE_UUID, true);
        Peripheral.addCharacteristicToService(
          SERVICE_UUID,
          HANDSHAKE_CHAR_UUID,
          CharacteristicProperties.Read | CharacteristicProperties.Notify,
          CharacteristicPermissions.Readable,
          this.handshakeJson || '',
        );
        Peripheral.addCharacteristicToService(
          SERVICE_UUID,
          CONTROL_CHAR_UUID,
          CharacteristicProperties.WriteWithoutResponse | CharacteristicProperties.Write,
          CharacteristicPermissions.Writeable,
          '',
        );
        this.gattReady = true;
      }

      Peripheral.setName(deviceName || 'SwiftShare');
      await Peripheral.startAdvertising({
        localName: deviceName || 'SwiftShare',
        serviceUUIDs: [SERVICE_UUID],
      });
      this.advertising = true;
      this.callbacks?.onLog(`BLE advertising started as "${deviceName || 'SwiftShare'}"`);
    } catch (e: any) {
      this.callbacks?.onLog(`BLE startAdvertising failed: ${e?.message ?? e}`);
    }
  }

  async stopAdvertising(): Promise<void> {
    try {
      if (this.advertising) {
        Peripheral.stopAdvertising();
        this.advertising = false;
      }
      this.readSub?.remove();
      this.writeSub?.remove();
      this.readSub = undefined;
      this.writeSub = undefined;
      this.callbacks?.onLog('BLE advertising stopped');
    } catch (e: any) {
      this.callbacks?.onLog(`BLE stopAdvertising failed: ${e?.message ?? e}`);
    }
  }

  /**
   * Receiver: update the handshake JSON exposed by the GATT characteristic.
   * Call this whenever a new receiver handshake is generated, before or
   * during advertising — reads are answered with the latest value.
   */
  async publishHandshake(json: string): Promise<void> {
    this.handshakeJson = json;
    try {
      if (this.gattReady) {
        await Peripheral.updateValueBase64(SERVICE_UUID, HANDSHAKE_CHAR_UUID, utf8ToBase64(json));
      }
      this.callbacks?.onLog(`BLE handshake published (${json.length} bytes)`);
    } catch (e: any) {
      this.callbacks?.onLog(`BLE publishHandshake failed: ${e?.message ?? e}`);
    }
  }

  /** Sender: scan for advertisers of our service. */
  startScanning(): void {
    if (this.scanning) return;
    this.scanning = true;
    this.manager.startDeviceScan([SERVICE_UUID], null, (error, device: Device | null) => {
      if (error) {
        this.callbacks?.onLog(`scan error: ${error.message}`);
        return;
      }
      if (device && device.name) {
        this.callbacks?.onPeerFound(device.id, device.name);
      }
    });
  }

  stopScanning(): void {
    if (this.scanning) {
      this.manager.stopDeviceScan();
      this.scanning = false;
    }
  }

  /** Sender: connect to a peer and read the handshake characteristic. */
  async readHandshake(deviceId: string): Promise<string | null> {
    try {
      let device = await this.manager.connectToDevice(deviceId);
      device = await device.discoverAllServicesAndCharacteristics();
      const char = await device.readCharacteristicForService(SERVICE_UUID, HANDSHAKE_CHAR_UUID);
      const json = char.value ? base64ToUtf8(char.value) : null;
      await this.manager.cancelDeviceConnection(deviceId);
      if (json) this.callbacks?.onHandshakeReceived(json);
      return json;
    } catch (e: any) {
      this.callbacks?.onLog(`readHandshake failed: ${e?.message ?? e}`);
      return null;
    }
  }

  /** Send a short control command to the receiver over BLE (e.g. "ACK"). */
  async sendControl(deviceId: string, command: string): Promise<void> {
    try {
      const device = await this.manager.connectToDevice(deviceId);
      await device.writeCharacteristicWithResponseForService(
        SERVICE_UUID,
        CONTROL_CHAR_UUID,
        utf8ToBase64(command),
      );
      await this.manager.cancelDeviceConnection(deviceId);
    } catch (e: any) {
      this.callbacks?.onLog(`sendControl failed: ${e?.message ?? e}`);
    }
  }

  destroy(): void {
    this.stopScanning();
    this.stopAdvertising();
    this.manager.destroy();
  }
}

export const ble = new BleService();
