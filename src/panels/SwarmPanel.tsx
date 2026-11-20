import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUp, ChevronDown, RefreshCw } from 'lucide-react';
import { request } from '../lib/bridge';
import { mergeSwarmSnapshot, type SessionUpdater, type SwarmSnapshot } from '../lib/agents-state';
import type { Json, Language, SessionView } from '../lib/types';
import type { DesktopCommands } from '../lib/desktop-commands';
import Select from '../components/Select';
import SwarmBoard from './SwarmBoard';
import SwarmGraph from './SwarmGraph';
import SwarmMembers from './SwarmMembers';

type SwarmTab = 'board' | 'members' | 'graph';
export default function SwarmPanel({ session, language, onSessionUpdate }: { session: SessionView; language: Language; onSessionUpdate?: SessionUpdater }) {
  const zh = language === 'zh', tabId = useId();
  const [snapshot, setSnapshot] = useState<SwarmSnapshot | undefined>(session.swarm), [tab, setTab] = useState<SwarmTab>('board');
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [title, setTitle] = useState(''), [task, setTask] = useState(''), [adding, setAdding] = useState(false);
  const [recipient, setRecipient] = useState(''), [text, setText] = useState(''), [boardMember, setBoardMember] = useState('');
  const [boardSequence, setBoardSequence] = useState<number>();
  const [delivery, setDelivery] = useState('note');
  const operation = useRef(false), mounted = useRef(true), requestSequence = useRef(0), composer = useRef<HTMLTextAreaElement>(null);
  const current = mergeSwarmSnapshot(session.swarm, snapshot, session.state.sessionId);
  const live = !session.historyOnly;
  async function control(action: DesktopCommands['swarm.control']['input']['action'], args: Json = {}) {
    if (!live || operation.current) return false;
    operation.current = true; setBusy(action); setError(''); setNotice('');
    const sequence = ++requestSequence.current;
    try {
      const value = await request('swarm.control', { id: session.id, action, args }) as SwarmSnapshot;
      if (!mounted.current || sequence !== requestSequence.current) return false;
      setSnapshot(previous => mergeSwarmSnapshot(value, previous, session.state.sessionId));
      onSessionUpdate?.(session.id, previous => previous.state.sessionId !== session.state.sessionId ? previous : { ...previous, swarm: mergeSwarmSnapshot(value, previous.swarm, previous.state.sessionId) });
      if (action !== 'status') setNotice(zh ? '操作已完成。' : 'Action completed.');
      return true;
    } catch (value) { if (mounted.current) setError(value instanceof Error ? value.message : String(value)); return false; }
    finally { operation.current = false; if (mounted.current) setBusy(''); }
  }
  useEffect(() => { mounted.current = true; if (live) void control('status'); return () => { mounted.current = false; requestSequence.current++; }; }, [session.id, session.historyOnly]);
  function reply(member: string, sequence?: number) {
    setTab('board'); setRecipient(member); setText(previous => previous || `@${member}${sequence ? ` #${sequence}` : ''} `);
    requestAnimationFrame(() => composer.current?.focus());
  }
  const initialized = !!current?.title, blocked = current?.members.filter(member => member.status === 'blocked').length ?? 0;
  const state = !current?.enabled ? 'paused' : blocked ? 'blocked' : 'live';
  const tabs: { id: SwarmTab; label: string; count?: number }[] = [{ id: 'board', label: zh ? '看板' : 'Board', count: current?.messages.length ?? 0 }, { id: 'members', label: zh ? '成员' : 'Members', count: current?.members.length ?? 0 }, { id: 'graph', label: zh ? '关系图' : 'Graph' }];
  return <section className={`swarm-panel swarm-tab-${tab}${initialized ? ' is-initialized' : ''}`}>
    <header className="swarm-heading"><h3>{current?.title || (zh ? 'Swarm 协作' : 'Swarm collaboration')}</h3>{initialized && <span className={`swarm-live ${state}`}><i />{state === 'paused' ? zh ? '已暂停' : 'Paused' : state === 'blocked' ? zh ? `${blocked} 项受阻` : `${blocked} blocked` : zh ? '实时' : 'Live'}</span>}{live && <button className="icon-button" aria-label={zh ? '刷新协作状态' : 'Refresh collaboration'} disabled={!!busy} onClick={() => void control('status')}><RefreshCw size={13} /></button>}</header>
    {error && <div className="agents-error" role="alert"><p>{error}</p><button className="quiet-button" disabled={!!busy || !live} onClick={() => void control('status')}>{zh ? '重新连接' : 'Retry connection'}</button></div>}
    {notice && <p className="agents-notice swarm-action-notice" role="status">{notice}</p>}
    {!initialized ? live ? <form className="swarm-form" onSubmit={async event => { event.preventDefault(); await control('create', { title: title.trim(), task: task.trim() }); }}><label>{zh ? '协作目标' : 'Collaboration goal'}<input value={title} onChange={event => setTitle(event.target.value)} placeholder={zh ? '这次协作要完成什么' : 'What should the team deliver?'} required disabled={!!busy} /></label><label>{zh ? '任务说明' : 'Task brief'}<textarea value={task} onChange={event => setTask(event.target.value)} rows={3} disabled={!!busy} placeholder={zh ? '说明范围、成员分工和验收要求…' : 'Describe scope, ownership and acceptance…'} /></label><button className="secondary-button" disabled={!!busy || !title.trim()}>{busy ? zh ? '连接中…' : 'Connecting…' : zh ? '建立协作' : 'Create collaboration'}</button></form> : <p className="panel-empty">{zh ? '该会话没有协作记录。' : 'No collaboration was recorded for this conversation.'}</p> : current && <>
      <div className="swarm-overview-line"><span>{zh ? `${current.running} 个工作中` : `${current.running} working`}{current.pending > 0 ? zh ? ` · ${current.pending} 条待处理` : ` · ${current.pending} pending` : ''}</span>{live && <details className="swarm-actions"><summary aria-label={zh ? '协作操作' : 'Collaboration actions'}>{zh ? '操作' : 'Actions'}<ChevronDown size={12} /></summary><div onClick={event => { (event.currentTarget.parentElement as HTMLDetailsElement).open = false; }}><button disabled={!!busy} onClick={() => { setTab('members'); setAdding(true); }}>{zh ? '添加成员' : 'Add member'}</button><button disabled={!!busy} onClick={() => void control(current.enabled ? 'disable' : 'enable')}>{current.enabled ? zh ? '暂停协作' : 'Pause collaboration' : zh ? '启用协作' : 'Enable collaboration'}</button><button disabled={!!busy} onClick={() => void control('stop')}>{zh ? '停止全部成员' : 'Stop all members'}</button></div></details>}</div>
      <div className="swarm-tabs" role="tablist" aria-label={zh ? 'Swarm 视图' : 'Swarm views'}>{tabs.map((item, index) => <button key={item.id} role="tab" id={`${tabId}-${item.id}-tab`} aria-controls={`${tabId}-${item.id}`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; setTab(next.id); document.getElementById(`${tabId}-${next.id}-tab`)?.focus(); } }}>{item.label}{item.count !== undefined && <span>{item.count}</span>}</button>)}</div>
      <div role="tabpanel" id={`${tabId}-board`} aria-labelledby={`${tabId}-board-tab`} hidden={tab !== 'board'}><SwarmBoard posts={current.messages} memberNames={current.members.map(member => member.name)} zh={zh} memberFilter={boardMember} onMemberFilter={setBoardMember} onReply={reply} active={tab === 'board'} directory={session.cwd} sequence={boardSequence} onSequenceLocated={() => setBoardSequence(undefined)} />
        {live && <form className="swarm-form swarm-post" onSubmit={async event => { event.preventDefault(); const args = { text: text.trim(), delivery, ...(recipient ? { recipients: [recipient] } : {}) }; if (await control('post', args)) setText(''); }}><div className="swarm-compose-heading"><label>{zh ? '发送给' : 'To'}<Select label={zh ? '消息接收者' : 'Message recipient'} value={recipient} onChange={setRecipient} disabled={!!busy} options={[{ value: '', label: zh ? '按 @提及' : 'Use @mentions' }, { value: 'coordinator', label: zh ? '协调者' : 'Coordinator' }, ...current.members.filter(member => member.role !== 'coordinator').map(member => ({ value: member.name, label: member.name })), { value: 'all', label: zh ? '全部成员' : 'All members' }]} /></label><span>{zh ? '可使用 @成员 和 #序号' : 'Use @member and #sequence'}</span></div><div className="swarm-compose-mode"><button type="button" aria-pressed={delivery === 'note'} disabled={!!busy} onClick={() => setDelivery('note')}>{zh ? '留言' : 'Note'}</button><button type="button" aria-pressed={delivery === 'nudge'} disabled={!!busy} onClick={() => setDelivery('nudge')}>{zh ? '提醒 / 纠偏' : 'Nudge / steer'}</button><span>{delivery === 'note' ? zh ? '仅记录' : 'Record only' : zh ? '在安全边界处理' : 'Handled at a safe boundary'}</span></div><textarea aria-label={zh ? '发布消息' : 'Post a message'} ref={composer} value={text} rows={2} disabled={!!busy} onChange={event => setText(event.target.value)} placeholder={zh ? '发布更新、讨论或补充指令…' : 'Post an update, discuss, or add guidance…'} /><button className="secondary-button" disabled={!!busy || !text.trim()}><ArrowUp size={13} />{busy === 'post' ? zh ? '发送中…' : 'Sending…' : zh ? '发布消息' : 'Post message'}</button></form>}
      </div>
      <div role="tabpanel" id={`${tabId}-members`} aria-labelledby={`${tabId}-members-tab`} hidden={tab !== 'members'}><SwarmMembers snapshot={current} session={session} language={language} busy={busy} adding={adding} onAdding={setAdding} control={control} onReply={reply} onError={setError} active={tab === 'members'} /></div>
      <div role="tabpanel" id={`${tabId}-graph`} aria-labelledby={`${tabId}-graph-tab`} hidden={tab !== 'graph'}><SwarmGraph key={session.state.sessionId ?? session.id} snapshot={current} zh={zh} directory={session.cwd} onSequence={sequence => { setBoardSequence(sequence); setTab('board'); }} onBoard={member => { setBoardMember(member); setTab('board'); }} /></div>
    </>}
  </section>;
}
