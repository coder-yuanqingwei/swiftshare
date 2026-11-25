/**
 * 连接码（v0.2）— 替代原来的 BLE 扫描/广播握手。
 *
 * 接收方开热点并启动 HTTP 服务后，把 {ip, port, token, device_name}
 * 编码成一段可复制的短文本「连接码」。发送方加入热点后粘贴该连接码，
 * 即可还原握手信息并通过 WiFi HTTP 高速传输文件。
 *
 * 剪贴板使用 RN 0.76 核心自带的 Clipboard（无需新增原生依赖），
 * 保证 GitHub Actions 现有构建流程不受影响。
 */
import { Clipboard } from 'react-native';
import type { Handshake } from '../types';

const CODE_PREFIX = 'SwiftShare1:';

/** 把握手信息编码成可复制的连接码。 */
export function makeConnectionCode(hs: Handshake): string {
  const body = JSON.stringify({
    ip: hs.ip,
    port: hs.port,
    token: hs.token,
    device_name: hs.device_name || 'SwiftShare',
  });
  return CODE_PREFIX + body;
}

/** 解析连接码；格式或字段非法时抛出可读错误。 */
export function parseConnectionCode(code: string): Handshake {
  const trimmed = (code || '').trim();
  if (!trimmed.startsWith(CODE_PREFIX)) {
    throw new Error('连接码格式不正确，请复制接收方显示的完整连接码');
  }
  const body = trimmed.slice(CODE_PREFIX.length);
  let obj: any;
  try {
    obj = JSON.parse(body);
  } catch {
    throw new Error('连接码内容已损坏，请让接收方重新生成');
  }
  if (
    !obj ||
    typeof obj.ip !== 'string' ||
    !obj.ip ||
    typeof obj.port !== 'number' ||
    typeof obj.token !== 'string' ||
    !obj.token
  ) {
    throw new Error('连接码缺少必要信息（IP / 端口 / 配对码）');
  }
  return {
    ip: obj.ip,
    port: obj.port,
    token: obj.token,
    device_name: typeof obj.device_name === 'string' ? obj.device_name : 'SwiftShare',
  };
}

/** 复制连接码到系统剪贴板。 */
export function copyConnectionCode(code: string): void {
  Clipboard.setString(code);
}

/** 从系统剪贴板读取文本（可能为 null）。 */
export async function pasteFromClipboard(): Promise<string | null> {
  try {
    return await Clipboard.getString();
  } catch {
    return null;
  }
}
