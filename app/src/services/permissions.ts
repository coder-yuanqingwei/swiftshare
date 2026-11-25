/**
 * 运行时权限申请（v0.2：热点方案，已移除蓝牙权限）。
 *
 * 传输只需要：
 *  - Android：图片/文件读取权限（相册）；局域网传输不需额外运行时权限。
 *  - iOS：相册读取权限。个人热点需在系统设置中由用户手动开启，App 无法代开。
 *
 * 权限键必须在 Info.plist / AndroidManifest.xml 中声明（见 native-templates/）。
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
      const perms: string[] = api >= 33
        ? [PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES]
        : [PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE];
      const granted = await PermissionsAndroid.requestMultiple(perms as any);
      const denied = Object.entries(granted).filter(
        ([, v]) => v !== PermissionsAndroid.RESULTS.GRANTED,
      );
      if (denied.length) {
        return { ok: false, reason: `权限被拒绝: ${denied.map(([k]) => k).join(', ')}` };
      }
      return { ok: true };
    }

    // iOS: 只需相册权限；蓝牙/本地网络权限在热点方案下不再需要。
    const required = [PERMISSIONS.IOS.PHOTO_LIBRARY];
    for (const p of required) {
      const status = await check(p);
      if (status === RESULTS.DENIED || status === RESULTS.BLOCKED) {
        const res = await request(p);
        if (res !== RESULTS.GRANTED) {
          return { ok: false, reason: `权限被拒绝: ${p} (${res})` };
        }
      }
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? String(e) };
  }
}
