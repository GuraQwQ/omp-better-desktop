export const shortcuts = {
  search: { label: '搜索会话标题', enLabel: 'Search conversation titles', value: 'Mod+Shift+F' },
  library: { label: '搜索会话正文', enLabel: 'Search messages', value: 'Mod+Shift+L' },
  workspace: { label: '工作区工具', enLabel: 'Workspace tools', value: 'Mod+Shift+G' },
  commands: { label: '命令面板', enLabel: 'Command palette', value: 'Mod+K' },
  new: { label: '新建会话', enLabel: 'New conversation', value: 'Mod+N' },
  settings: { label: '应用设置', enLabel: 'Application settings', value: 'Mod+,' },
  sidebar: { label: '切换侧栏', enLabel: 'Toggle sidebar', value: 'Mod+B' },
} as const;
export const optionalFeatures = {
  reviews: { label: '结构化评审与逐项修复', enLabel: 'Structured review and fixes', hint: '把问题、证据与修复进度整理到评审面板。', enHint: 'Track findings, evidence and fixes in the review panel.' },
  browser: { label: '浏览器工作区入口', enLabel: 'Browser workspace', hint: '保存网址并用设备上的默认浏览器打开。', enHint: 'Save links and open them in the default browser.' },
  cards: { label: '浮动桌面任务卡', enLabel: 'Floating task cards', hint: '在独立小窗口跟踪会话，点击返回任务。', enHint: 'Track a conversation in a small window and return to it.' },
  externalSessions: { label: '外部助手会话查看', enLabel: 'External assistant conversations', hint: '按需读取 Codex 和 ZCode 的本机会话。', enHint: 'Read local Codex and ZCode conversations on demand.' },
} as const;
export function shortcutValue(id: keyof typeof shortcuts, custom?: Record<string, string>) { return custom?.[id] ?? shortcuts[id].value; }
export function matchesShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>, value: string) {
  const parts = value.toLowerCase().split('+').map(part => part.trim());
  const key = parts.pop();
  if (!key || parts.some(part => !['mod', 'ctrl', 'meta', 'alt', 'shift'].includes(part))) return false;
  const mod = parts.includes('mod');
  return event.key.toLowerCase() === key && (mod ? event.ctrlKey || event.metaKey : event.ctrlKey === parts.includes('ctrl') && event.metaKey === parts.includes('meta')) && event.shiftKey === parts.includes('shift') && event.altKey === parts.includes('alt');
}
