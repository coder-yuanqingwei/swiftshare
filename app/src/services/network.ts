/**
 * Obtain the device's LAN IPv4 address, which the receiver advertises so the
 * sender knows where to point its HTTP upload. `react-native-fs` / NetInfo
 * return the active interface address; we filter out loopback and link-local.
 *
 * v0.2: 去掉蓝牙，改用「热点组网」。本文件负责：
 *  - 判断当前是否处在可用局域网（WiFi 或个人热点）；
 *  - 拿不到 IP 时抛出面向用户的热点引导提示。
 */
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import RNFS from 'react-native-fs';

/** Platform-correct directory where the Rust receiver writes incoming files. */
export function getSaveDir(): string {
  // iOS: app sandbox Documents dir (never "/" — no write permission there).
  if (Platform.OS === 'ios') {
    return `${RNFS.DocumentDirectoryPath}/SwiftShare`;
  }
  // Android 11+ (API 30+) 强制分区存储：App 无权写外部存储根目录
  // (/storage/emulated/0)，否则 Rust 的 create_dir_all 会 Permission denied
  // 并抛错。必须写 App 专属外部目录（无需 WRITE_EXTERNAL_STORAGE 权限）。
  const base: string =
    (RNFS as any).ExternalDirectoryPath || RNFS.DocumentDirectoryPath;
  return `${base}/SwiftShare`;
}

/** 网络可用性快照，供 UI 决定是否展示热点引导。 */
export interface LanStatus {
  connected: boolean;       // 是否有网络连接（WiFi / 以太网 / 热点）
  isLan: boolean;           // 是否处在可用局域网并有有效 IP
  ip: string | null;
  type: string;             // NetInfo 的 type，如 'wifi' / 'cellular' / 'none'
}

/**
 * 读取当前局域网状态。不抛异常，全部以字段返回，方便 UI 判断。
 * 热点宿主模式下 NetInfo 常报 0.0.0.0，此时用 RNFS.getIPAddress() 兜底。
 */
export async function inspectLan(): Promise<LanStatus> {
  const state = await NetInfo.fetch();
  const type = String((state as any).type ?? 'unknown');
  const details = (state as any).details || {};
  const candidates: (string | undefined)[] = [
    details.ipAddress,
    (details as any).localIpAddress,
  ];
  try {
    candidates.push((RNFS as any).getIPAddress?.() as string | undefined);
  } catch {
    /* optional API — ignore */
  }
  let ip: string | null = null;
  for (const address of candidates) {
    if (address && isValidLanIp(address)) {
      ip = address;
      break;
    }
  }
  // 蜂窝网络下即使拿到 IP 也不是局域网地址，不能用于设备间直连。
  const connected = state.isConnected === true;
  const isLan = connected && type !== 'cellular' && ip !== null;
  return { connected, isLan, ip, type };
}

export async function getLocalIp(): Promise<string> {
  const status = await inspectLan();
  if (status.isLan && status.ip) return status.ip;

  if (!status.connected || status.type === 'none') {
    throw new Error(NO_NETWORK_MSG);
  }
  if (status.type === 'cellular') {
    throw new Error(CELLULAR_MSG);
  }
  throw new Error(NO_LAN_IP_MSG);
}

export const NO_NETWORK_MSG =
  '当前没有网络连接。请由一方打开个人热点，另一方加入该热点后重试。';
export const CELLULAR_MSG =
  '当前使用的是蜂窝数据，设备间无法直连。请连接同一 WiFi，或由一方开热点另一方加入。';
export const NO_LAN_IP_MSG =
  '未能获取局域网 IP。请确认两台设备在同一 WiFi 或同一热点下。';

function isValidLanIp(ip: string): boolean {
  if (!ip || ip === '0.0.0.0' || ip.startsWith('127.')) return false;
  if (ip.startsWith('169.254.')) return false; // link-local
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip);
}
