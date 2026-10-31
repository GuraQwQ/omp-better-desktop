import { invoke } from '@tauri-apps/api/core';
import { isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';

// 超过这个时长的任务完成，才值得弹系统通知；更短的回复只闪任务栏。
export const NOTIFY_AFTER_MS = 15_000;

// 首次需要时才请求权限并缓存结果；被拒绝或插件不可用时返回 false，调用方回退到任务栏闪烁。
let permission: Promise<boolean> | undefined;
const allowed = () => permission ??= isPermissionGranted().then(ok => ok || requestPermission().then(result => result === 'granted')).catch(() => false);

export async function notify(title: string, body: string): Promise<boolean> {
  if (!await allowed()) return false;
  // 插件的 sendNotification 不返回发送 Promise；等待原生命令才能在失败时回退。
  try { await invoke('plugin:notification|notify', { options: { title, body } }); return true; } catch { return false; }
}
