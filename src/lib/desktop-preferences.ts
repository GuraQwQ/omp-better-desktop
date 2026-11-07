export const shortcuts = {
  search: { label: '搜索会话标题', value: 'Mod+Shift+F' },
  library: { label: '搜索会话正文', value: 'Mod+Shift+L' },
  workspace: { label: '工作区工具', value: 'Mod+Shift+G' },
  commands: { label: '命令面板', value: 'Mod+K' },
  new: { label: '新建会话', value: 'Mod+N' },
  settings: { label: '应用设置', value: 'Mod+,' },
  sidebar: { label: '切换侧栏', value: 'Mod+B' },
} as const;
export const optionalFeatures = {
  reviews: { label: '结构化评审与逐项修复', hint: '把问题、证据与修复进度整理到评审面板。' },
  browser: { label: '浏览器工作区入口', hint: '保存网址并用设备上的默认浏览器打开。' },
  cards: { label: '浮动桌面任务卡', hint: '在独立小窗口跟踪会话，点击返回任务。' },
  externalSessions: { label: '外部助手会话查看', hint: '按需读取 Codex 和 ZCode 的本机会话。' },
} as const;
export function shortcutValue(id: keyof typeof shortcuts, custom?: Record<string, string>) { return custom?.[id] ?? shortcuts[id].value; }
export function matchesShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>, value: string) {
  const parts = value.toLowerCase().split('+').map(part => part.trim());
  const key = parts.pop();
  if (!key || parts.some(part => !['mod', 'ctrl', 'meta', 'alt', 'shift'].includes(part))) return false;
  const mod = parts.includes('mod');
  return event.key.toLowerCase() === key && (mod ? event.ctrlKey || event.metaKey : event.ctrlKey === parts.includes('ctrl') && event.metaKey === parts.includes('meta')) && event.shiftKey === parts.includes('shift') && event.altKey === parts.includes('alt');
}
