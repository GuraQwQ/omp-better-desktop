import { ChevronRight, MessageSquare } from 'lucide-react';
import { groupSessions } from '../lib/session-groups';
import { sessionKey } from '../lib/session-identity';
import type { Copy } from '../lib/i18n';
import type { SessionSummary } from '../lib/types';

// 已保存的对话按最近活动分组。只有一个分组时平铺、不加标题；「更早」默认折叠，选中的对话在里面时自动展开。
export default function SavedSessions({ sessions, activeKey, t, open }: { sessions: SessionSummary[]; activeKey: string; t: Copy; open: (value: SessionSummary) => void }) {
  const groups = groupSessions(sessions);
  const row = (value: SessionSummary) => <button className={`session-item ${activeKey === sessionKey(value) ? 'active' : ''}`} key={sessionKey(value)} onClick={() => open(value)}><MessageSquare size={12} /><span>{value.title || t.newTitle}</span></button>;
  if (groups.length < 2) return <>{groups.flatMap(group => group.items.map(row))}</>;
  const label = { today: t.groupToday, yesterday: t.groupYesterday, week: t.groupWeek, older: t.groupEarlier };
  return <>{groups.map(group => group.id === 'older'
    ? <details className="session-group" key={group.id} open={group.items.some(value => activeKey === sessionKey(value))}><summary><ChevronRight size={11} aria-hidden="true" />{label.older}<small>{group.items.length}</small></summary>{group.items.map(row)}</details>
    : <section className="session-group" key={group.id} aria-label={label[group.id]}><p className="session-group-title" aria-hidden="true">{label[group.id]}</p>{group.items.map(row)}</section>)}</>;
}
