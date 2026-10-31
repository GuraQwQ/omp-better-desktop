import type { SessionSummary } from './types';

export type Bucket = 'today' | 'yesterday' | 'week' | 'older';

// 按本地日历日切分（updatedAt 是毫秒）。保持输入顺序：历史列表本身已按时间倒序。
export function groupSessions(sessions: SessionSummary[], now = Date.now()): { id: Bucket; items: SessionSummary[] }[] {
  const date = new Date(now);
  const today = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const yesterday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1).getTime();
  const week = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 6).getTime();
  const groups: Record<Bucket, SessionSummary[]> = { today: [], yesterday: [], week: [], older: [] };
  for (const value of sessions) {
    const time = Number(value.updatedAt) || 0;
    groups[time >= today ? 'today' : time >= yesterday ? 'yesterday' : time >= week ? 'week' : 'older'].push(value);
  }
  return (Object.keys(groups) as Bucket[]).map(id => ({ id, items: groups[id] })).filter(group => group.items.length);
}
