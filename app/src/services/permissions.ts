/**
 * Centralized runtime permission requests. iOS and Android need different
 * keys; all of them must be declared in Info.plist / AndroidManifest.xml
 * (see docs/NATIVE_SETUP.md and app/native-templates/).
 */
import { Platform, PermissionsAndroid } from 'react-native';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';

export interface PermissionResult {
  ok: boolean;
  reason?: string;
}

export async function ensurePermissions(): Promise<PermissionResult> {
  try {
    if (Platform.OS === 'android') {
      const api = Number(Platform.Version);
      const perms: any[] = api >= 31
        ? [
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
          ]
        : [
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
          ];
      const granted = await PermissionsAndroid.requestMultiple(perms);
      const denied = Object.entries(granted).filter(
        ([, v]) => v !== PermissionsAndroid.RESULTS.GRANTED,
      );
      if (denied.length) {
        return { ok: false, reason: `权限被拒绝: ${denied.map(([k]) => k).join(', ')}` };
      }
      return { ok: true };
    }

    // iOS: Bluetooth + local network + photo library
    const required = [
      PERMISSIONS.IOS.BLUETOOTH,
      PERMISSIONS.IOS.PHOTO_LIBRARY,
    ];
    for (const p of required) {
      const status = await check(p);
      if (status === RESULTS.DENIED || status === RESULTS.BLOCKED) {
        const res = await request(p);
        if (res !== RESULTS.GRANTED) {
          return { ok: false, reason: `权限被拒绝: ${p} (${res})` };
        }
      }
    }
    // Local Network permission is triggered by first Bonjour/BLE use; the
    // Info.plist NSLocalNetworkUsageDescription text is what the user sees.
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? String(e) };
  }
}
