/**
 * Obtain the device's LAN IPv4 address, which the receiver advertises so the
 * sender knows where to point its HTTP upload. `react-native-fs` / NetInfo
 * return the active interface address; we filter out loopback and link-local.
 */
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import RNFS from 'react-native-fs';

/** Platform-correct directory where the Rust receiver writes incoming files. */
export function getSaveDir(): string {
  // iOS: app sandbox Documents dir (never "/" — no write permission there).
  // Android: public external storage so files show up in the gallery app.
  return Platform.OS === 'ios'
    ? `${RNFS.DocumentDirectoryPath}/SwiftShare`
    : `${RNFS.ExternalStorageDirectoryPath}/SwiftShare`;
}

export async function getLocalIp(): Promise<string> {
  const state = await NetInfo.fetch();
  const details = (state as any).details || {};
  const candidates: (string | undefined)[] = [
    details.ipAddress,
    (details as any).localIpAddress,
  ];
  // react-native-fs exposes the WiFi address on some Android versions where
  // NetInfo reports 0.0.0.0 (e.g. when the phone is the hotspot host).
  try {
    candidates.push((RNFS as any).getIPAddress?.() as string | undefined);
  } catch {
    /* optional API — ignore */
  }
  for (const address of candidates) {
    if (address && isValidLanIp(address)) return address;
  }
  throw new Error('未能获取局域网 IP，请确认已连接 WiFi 而非蜂窝数据');
}

function isValidLanIp(ip: string): boolean {
  if (!ip || ip === '0.0.0.0' || ip.startsWith('127.')) return false;
  if (ip.startsWith('169.254.')) return false; // link-local
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip);
}
