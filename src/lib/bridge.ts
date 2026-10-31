import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Bootstrap, DesktopEvent, Json } from './types';

export const native = isTauri();
let previewPreferences: Bootstrap['preferences'] | undefined;

export async function request<T = any>(type: string, fields: Json = {}): Promise<T> {
  if (native) return invoke<T>('desktop_command', { request: { type, ...fields } });
  previewPreferences ??= { language: typeof navigator !== 'undefined' && navigator.language?.startsWith('zh') ? 'zh' : 'en', theme: 'system', motion: 'rich', asyncQuestions: true };
  if (type === 'bootstrap') return {
    dataRoot: '', runtime: null, projects: [],
    preferences: { ...previewPreferences },
  } as Bootstrap as T;
  if (type === 'preferences.set') { previewPreferences = { ...previewPreferences, ...fields.patch }; return { ...previewPreferences } as T; }
  if (type === 'session.list' || type === 'command.catalog') return [] as T;
  throw new Error('Open the desktop application to access local projects and the OMP runtime. / 请打开桌面应用以访问本地项目和 OMP 运行时。');
}

export const rpc = <T = any>(id: string, type: string, fields: Json = {}) => request<T>('session.rpc', { id, command: { type, ...fields } });

export async function onDesktopEvent(callback: (event: DesktopEvent) => void) {
  if (!native) return () => {};
  return listen<DesktopEvent>('desktop-event', ({ payload }) => callback(payload));
}

export async function pickPath(directory = true): Promise<string | null> {
  if (!native) throw new Error('Choose a folder from the desktop application. / 请在桌面应用中选择文件夹。');
  const { open } = await import('@tauri-apps/plugin-dialog');
  const result = await open({ directory, multiple: false });
  return typeof result === 'string' ? result : null;
}
