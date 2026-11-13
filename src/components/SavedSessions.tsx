import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Archive, ArchiveRestore, ChevronRight, GripVertical, MessageSquare, MoreHorizontal, Pin, PinOff, Trash2 } from 'lucide-react';
import { groupSessions } from '../lib/session-groups';
import { sessionKey } from '../lib/session-identity';
import type { Copy } from '../lib/i18n';
import type { Language, SessionSummary } from '../lib/types';
import './select.css';
import './saved-sessions.css';

export type SessionListEntry = SessionSummary & { pinned?: boolean; pinOrder?: number | null; archived?: boolean };
export type SessionAction = 'archive' | 'restore' | 'delete' | 'pin' | 'unpin';
type Act = (value: SessionListEntry, action: SessionAction) => void | Promise<void>;
const dragType = 'application/x-omp-session';

export function SessionRow({ value, active, title, icon, trailing, language = 'zh', open, onAction, disabled = false, onMove, canMoveUp, canMoveDown, onDrop }: {
  value: SessionListEntry; active?: boolean; title?: string; icon?: ReactNode; trailing?: ReactNode; language?: Language;
  open: () => void; onAction?: Act; disabled?: boolean; onMove?: (direction: -1 | 1) => void | Promise<void>;
  canMoveUp?: boolean; canMoveDown?: boolean; onDrop?: (path: string) => void;
}) {
  const zh = language === 'zh';
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null), row = useRef<HTMLDivElement>(null), menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number }>();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [dropTarget, setDropTarget] = useState(false);
  const available = !!value.path && !!onAction;
  const close = (restore = false) => { setPosition(undefined); if (restore) trigger.current?.focus({ preventScroll: true }); };
  const show = (x?: number, y?: number) => {
    if (!available || disabled || busy) return;
    const rect = trigger.current!.getBoundingClientRect();
    setError(''); setPosition({ left: Math.max(8, Math.min(x ?? rect.left, innerWidth - 228)), top: Math.max(8, Math.min(y ?? rect.bottom + 4, innerHeight - (onMove ? 250 : 180))) });
  };
  useEffect(() => {
    if (!position) return;
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !row.current?.contains(event.target as Node)) close(); };
    const scroll = (event: Event) => { if (!menu.current?.contains(event.target as Node)) close(); };
    const resize = () => close();
    document.addEventListener('pointerdown', outside); document.addEventListener('scroll', scroll, true); window.addEventListener('resize', resize);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', resize); };
  }, [position]);
  const run = async (action: () => void | Promise<void>) => {
    if (busy || disabled) return;
    setBusy(true); setError('');
    try { await action(); close(true); } catch (value) { setError(value instanceof Error ? value.message : String(value)); } finally { setBusy(false); }
  };
  const acceptDrag = (event: DragEvent) => !!onDrop && !disabled && event.dataTransfer.types.includes(dragType);
  return <div ref={row} className={`session-row${active ? ' active' : ''}${dropTarget ? ' is-drop-target' : ''}`} onContextMenu={event => { if (available) { event.preventDefault(); show(event.clientX, event.clientY); } }}
    onKeyDown={event => { if (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') { event.preventDefault(); show(); } }}
    onDragOver={event => { if (acceptDrag(event)) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget(true); } }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(false); }}
    onDrop={event => { setDropTarget(false); if (acceptDrag(event)) { event.preventDefault(); const path = event.dataTransfer.getData(dragType); if (path && path !== value.path) onDrop?.(path); } }}>
    {value.pinned && onDrop && <button type="button" className="session-drag icon-button" draggable={!disabled && !busy} aria-label={zh ? '拖动置顶会话排序' : 'Drag to reorder pinned conversation'} title={zh ? '拖动排序，也可在菜单中上移或下移' : 'Drag to reorder, or move up or down in the menu'} disabled={disabled || busy} onDragStart={event => { event.dataTransfer.setData(dragType, value.path); event.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => setDropTarget(false)}><GripVertical size={12} /></button>}
    <button type="button" className={`session-item${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined} title={title} onClick={() => { close(); open(); }}>{icon ?? <MessageSquare size={12} />}<span>{value.title || title}</span>{trailing}</button>
    {available && <button ref={trigger} type="button" className="session-row-menu icon-button" disabled={disabled || busy} aria-label={zh ? '会话操作' : 'Conversation actions'} title={zh ? '会话操作' : 'Conversation actions'} aria-haspopup="menu" aria-controls={position ? id : undefined} aria-expanded={!!position} onClick={() => position ? close() : show()}><MoreHorizontal size={14} /></button>}
    {position && createPortal(<div id={id} ref={menu} role="menu" aria-label={zh ? '会话操作' : 'Conversation actions'} className="session-action-menu ui-menu" style={{ ...position, maxHeight: innerHeight - position.top - 8 }} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
      else if (event.key === 'Tab') close();
      else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const items = [...menu.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]; const index = items.indexOf(document.activeElement as HTMLButtonElement); items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length]?.focus(); }
    }}>
      <button type="button" role="menuitem" disabled={busy || disabled} onClick={() => void run(() => onAction!(value, value.pinned ? 'unpin' : 'pin'))}>{value.pinned ? <PinOff size={14} /> : <Pin size={14} />}{value.pinned ? zh ? '取消置顶' : 'Unpin' : zh ? '置顶' : 'Pin'}</button>
      {value.pinned && onMove && <><button type="button" role="menuitem" disabled={busy || disabled || !canMoveUp} onClick={() => void run(() => onMove(-1))}>{zh ? '上移' : 'Move up'}</button><button type="button" role="menuitem" disabled={busy || disabled || !canMoveDown} onClick={() => void run(() => onMove(1))}>{zh ? '下移' : 'Move down'}</button></>}
      <button type="button" role="menuitem" disabled={busy || disabled} onClick={() => void run(() => onAction!(value, value.archived ? 'restore' : 'archive'))}>{value.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}{value.archived ? zh ? '取消归档' : 'Unarchive' : zh ? '归档' : 'Archive'}</button>
      <div className="menu-separator" />
      <button type="button" role="menuitem" className="is-danger" disabled={busy || disabled} onClick={() => void run(() => onAction!(value, 'delete'))}><Trash2 size={14} />{zh ? '移入回收站' : 'Move to Recycle Bin'}</button>
      {error && <p role="alert">{error}</p>}
    </div>, document.body)}
  </div>;
}

export default function SavedSessions({ sessions, activeKey, t, open, language = 'zh', onAction, onReorder, disabled, icon, trailing }: {
  sessions: SessionListEntry[]; activeKey: string; t: Copy; open: (value: SessionListEntry) => void; language?: Language;
  icon?: (value: SessionListEntry) => ReactNode; trailing?: (value: SessionListEntry) => ReactNode;
  onAction?: Act; onReorder?: (paths: string[]) => void | Promise<void>; disabled?: (path: string) => boolean;
}) {
  const [reordering, setReordering] = useState(false), [orderError, setOrderError] = useState('');
  const pinned = sessions.filter(value => value.pinned).sort((a, b) => (a.pinOrder ?? 0) - (b.pinOrder ?? 0));
  const groups = groupSessions(sessions.filter(value => !value.pinned).sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0)));
  const reorder = async (from: number, to: number) => { if (!onReorder || reordering || to < 0 || to >= pinned.length) return; const next = [...pinned]; next.splice(to, 0, next.splice(from, 1)[0]); setReordering(true); setOrderError(''); try { await onReorder(next.map(value => value.path)); } catch (value) { setOrderError(value instanceof Error ? value.message : String(value)); } finally { setReordering(false); } };
  const row = (value: SessionListEntry) => { const index = pinned.indexOf(value); return <SessionRow key={sessionKey(value)} value={value} active={activeKey === sessionKey(value)} title={value.title || t.newTitle} icon={icon?.(value)} trailing={trailing?.(value)} language={language} open={() => open(value)} onAction={onAction} disabled={reordering || disabled?.(value.path)} onMove={index >= 0 && onReorder ? direction => reorder(index, index + direction) : undefined} canMoveUp={index > 0} canMoveDown={index >= 0 && index < pinned.length - 1} onDrop={index >= 0 && onReorder ? path => { const from = pinned.findIndex(value => value.path === path); if (from >= 0) void reorder(from, index); } : undefined} />; };
  const label = { today: t.groupToday, yesterday: t.groupYesterday, week: t.groupWeek, older: t.groupEarlier };
  return <>{orderError && <p className="session-reorder-error" role="alert">{orderError}</p>}{pinned.length > 0 && <section className="session-group session-pinned" aria-label={language === 'zh' ? '置顶会话' : 'Pinned conversations'}><p className="session-group-title"><Pin size={11} aria-hidden="true" />{language === 'zh' ? '置顶' : 'Pinned'}</p>{pinned.map(row)}</section>}{groups.length < 2 ? groups.flatMap(group => group.items.map(row)) : groups.map(group => group.id === 'older'
    ? <details className="session-group" key={group.id} open={group.items.some(value => activeKey === sessionKey(value))}><summary><ChevronRight size={11} aria-hidden="true" />{label.older}<small>{group.items.length}</small></summary>{group.items.map(row)}</details>
    : <section className="session-group" key={group.id} aria-label={label[group.id]}><p className="session-group-title" aria-hidden="true">{label[group.id]}</p>{group.items.map(row)}</section>)}</>;
}
