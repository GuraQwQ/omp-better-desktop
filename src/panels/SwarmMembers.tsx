import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, MessageSquare, Play, Plus, RefreshCw, Search, Square } from 'lucide-react';
import { request } from '../lib/bridge';
import { agentStatus, mergeAgentMessages, type SwarmSnapshot } from '../lib/agents-state';
import { copy } from '../lib/i18n';
import { normalizeHistoryMessages } from '../lib/session-state';
import type { Json, Language, Message, SessionView } from '../lib/types';
import Select from '../components/Select';
import AgentTranscript from './AgentTranscript';
import { postSummary, roleLabel } from './swarm-view';

type Props = { snapshot: SwarmSnapshot; session: SessionView; language: Language; busy: string; adding: boolean; onAdding: (value: boolean) => void; control: (action: 'add' | 'stop' | 'resume', args?: Json) => Promise<boolean>; onReply: (name: string) => void; onError: (message: string) => void; active: boolean };
export default function SwarmMembers({ snapshot, session, language, busy, adding, onAdding, control, onReply, onError, active }: Props) {
  const zh = language === 'zh', live = !session.historyOnly;
  const [query, setQuery] = useState(''), [selected, setSelected] = useState('');
  const [messages, setMessages] = useState<Message[]>([]), [nextCursor, setNextCursor] = useState<string>(), [reading, setReading] = useState(false);
  const generation = useRef(0), inFlight = useRef<number | undefined>(undefined), mounted = useRef(true);
  const member = snapshot.members.find(value => value.id === selected);
  async function read(earlier = false) {
    if (!member?.sessionFile || inFlight.current === generation.current) return;
    const token = generation.current;
    inFlight.current = token; setReading(true);
    try {
      const page = await request('session.history', { path: member.sessionFile, ...(earlier && nextCursor ? { cursor: nextCursor } : {}), limit: 100 });
      if (!mounted.current || token !== generation.current) return;
      const incoming = normalizeHistoryMessages(page.messages, `swarm-${selected}-${earlier ? nextCursor : 'tail'}`);
      setMessages(previous => earlier ? mergeAgentMessages(incoming, previous) : mergeAgentMessages(previous, incoming));
      if (earlier || !messages.length) setNextCursor(page.nextCursor ?? undefined);
    } catch (value) { if (mounted.current && token === generation.current) onError(value instanceof Error ? value.message : String(value)); }
    finally { if (inFlight.current === token) inFlight.current = undefined; if (mounted.current && token === generation.current) setReading(false); }
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
  useEffect(() => { generation.current++; setMessages([]); setNextCursor(undefined); if (member?.sessionFile) void read(); return () => { generation.current++; }; }, [selected, member?.sessionFile]);
  useEffect(() => { if (!active || !member?.sessionFile) return; const timer = setTimeout(() => void read(), 300); return () => clearTimeout(timer); }, [snapshot.revision, active]);
  useEffect(() => { if (adding) setSelected(''); }, [adding]);
  if (member) return <section className="swarm-member-detail">
    <div className="agent-detail-heading"><button className="quiet-button" onClick={() => setSelected('')}><ArrowLeft size={13} />{zh ? '全部成员' : 'All members'}</button><span className={`agent-status ${member.status}`}>{agentStatus(member.status, zh)}</span></div>
    <h4>@{member.name}<span>{roleLabel(member.role, zh)}</span></h4><p className="swarm-goal">{member.task}</p>{member.error && <p className="agents-error" role="alert">{member.error}</p>}
    <div className="swarm-member-actions">{live && <button className="secondary-button" onClick={() => onReply(member.name)}><MessageSquare size={12} />{zh ? '发送消息' : 'Message'}</button>}{live && member.role !== 'coordinator' && <><button className="quiet-button" disabled={!!busy || member.status === 'working'} onClick={() => void control('resume', { name: member.name })}><Play size={12} />{zh ? '继续' : 'Resume'}</button><button className="quiet-button" disabled={!!busy || member.status === 'stopped'} onClick={() => void control('stop', { name: member.name })}><Square size={12} />{zh ? '停止' : 'Stop'}</button></>}</div>
    <details className="swarm-member-metadata"><summary>{zh ? '模型与工作目录' : 'Model and working directory'}</summary><p>{member.model}</p><code>{member.cwd}</code>{member.workspace === 'worktree' && <small>{zh ? '独立工作副本' : 'Independent worktree'}{member.baseRevision ? ` · ${member.baseRevision.slice(0, 8)}` : ''}</small>}<button className="quiet-button" onClick={() => void request('system.reveal_path', { path: member.cwd }).catch(value => onError(value instanceof Error ? value.message : String(value)))}>{zh ? '在文件管理器中查看' : 'Reveal in file manager'}</button></details>
    <div className="agent-detail-heading swarm-transcript-heading"><strong>{zh ? '成员对话' : 'Transcript'}</strong><button className="quiet-button" onClick={() => void read()} disabled={reading || !member.sessionFile}><RefreshCw size={13} />{zh ? '刷新' : 'Refresh'}</button></div>{nextCursor && <button className="quiet-button" disabled={reading} onClick={() => void read(true)}>{zh ? '加载更早消息' : 'Load earlier messages'}</button>}<div className="agent-transcript" aria-busy={reading}>{messages.length ? <AgentTranscript messages={messages} t={copy(language)} zh={zh} /> : <p className="agents-muted">{reading ? zh ? '读取中…' : 'Loading…' : zh ? '成员产生对话后会显示在这里。' : 'The transcript will appear when this member works.'}</p>}</div>
  </section>;
  const visible = snapshot.members.filter(value => `${value.name} ${value.role} ${value.task}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const groups = [{ label: zh ? '需要处理' : 'Needs attention', members: visible.filter(value => value.status === 'blocked') }, { label: zh ? '协作成员' : 'Team', members: visible.filter(value => !['blocked', 'stopped'].includes(value.status)) }, { label: zh ? '已停止' : 'Stopped', members: visible.filter(value => value.status === 'stopped') }];
  return <><div className="swarm-member-search"><label><Search size={14} /><input aria-label={zh ? '搜索成员' : 'Search members'} value={query} onChange={event => setQuery(event.target.value)} placeholder={zh ? '搜索成员或任务' : 'Search members or assignments'} /></label>{live && <button className="icon-button" aria-label={zh ? '添加成员' : 'Add member'} disabled={!!busy} onClick={() => onAdding(!adding)}><Plus size={15} /></button>}</div>
    {adding && live && <AddMember zh={zh} busy={!!busy} cwd={session.cwd} close={() => onAdding(false)} add={args => control('add', args)} />}
    <div className="swarm-member-groups">{groups.filter(group => group.members.length).map(group => <section key={group.label}><h4>{group.label}<span>{group.members.length}</span></h4><ul>{group.members.map(value => {
      const last = [...snapshot.messages].reverse().find(post => post.sender === value.name);
      return <li key={value.id}><button className="swarm-member-row" onClick={() => { onAdding(false); setSelected(value.id); }}><span className={`swarm-member-avatar ${value.role}`}>{value.name.slice(0, 1).toUpperCase()}</span><span className="swarm-member-copy"><span><strong>@{value.name}</strong><span>{roleLabel(value.role, zh)}</span></span><p>{postSummary(last?.text ?? value.task)}</p></span><span className="swarm-member-tail"><span className={`agent-status ${value.status}`}>{agentStatus(value.status, zh)}</span>{last && <small>#{last.seq}</small>}</span></button></li>;
    })}</ul></section>)}</div>{!visible.length && <p className="panel-empty">{zh ? '没有匹配的成员。' : 'No matching members.'}</p>}</>;
}

function AddMember({ zh, busy, cwd, close, add }: { zh: boolean; busy: boolean; cwd: string; close: () => void; add: (args: Json) => Promise<boolean> }) {
  const [name, setName] = useState(''), [role, setRole] = useState('worker'), [task, setTask] = useState(''), [model, setModel] = useState(''), [directory, setDirectory] = useState(''), [workspace, setWorkspace] = useState('inherit');
  return <form className="swarm-form swarm-add" onSubmit={async event => { event.preventDefault(); if (await add({ name: name.trim(), role, task: task.trim(), workspace, ...(model.trim() ? { model: model.trim() } : {}), ...(directory.trim() ? { cwd: directory.trim() } : {}) })) close(); }}><label>{zh ? '名称' : 'Name'}<input required value={name} disabled={busy} onChange={event => setName(event.target.value)} placeholder="reviewer" /></label><label>{zh ? '职责' : 'Role'}<Select label={zh ? '成员职责' : 'Member role'} value={role} onChange={setRole} disabled={busy} options={[{ value: 'worker', label: zh ? '执行者' : 'Worker' }, { value: 'verifier', label: zh ? '验证者' : 'Verifier' }]} /></label><label>{zh ? '任务' : 'Assignment'}<textarea rows={3} value={task} required disabled={busy} onChange={event => setTask(event.target.value)} /></label><details className="swarm-advanced"><summary>{zh ? '模型与工作目录' : 'Model and working directory'}</summary><label>{zh ? '工作区' : 'Workspace'}<Select label={zh ? '成员工作区' : 'Member workspace'} value={workspace} onChange={setWorkspace} disabled={busy} options={[{ value: 'inherit', label: zh ? '当前工作目录' : 'Current working directory' }, { value: 'worktree', label: zh ? '独立 Git 工作副本' : 'Independent Git worktree' }]} /></label>{workspace === 'worktree' && <p className="agents-muted">{zh ? '从已提交 HEAD 开始，工作副本会保留供审阅与合并。' : 'Starts from committed HEAD. The worktree remains available for review and merge.'}</p>}<label>{zh ? '模型（可选）' : 'Model (optional)'}<input value={model} disabled={busy} onChange={event => setModel(event.target.value)} placeholder={zh ? '沿用当前模型' : 'Use current model'} /></label><label>{zh ? '工作目录（可选）' : 'Working directory (optional)'}<input value={directory} disabled={busy} onChange={event => setDirectory(event.target.value)} placeholder={cwd} /></label></details><div className="swarm-form-actions"><button className="quiet-button" type="button" disabled={busy} onClick={close}>{zh ? '取消' : 'Cancel'}</button><button className="secondary-button" disabled={busy || !name.trim() || !task.trim()}>{busy ? zh ? '添加中…' : 'Adding…' : zh ? '添加成员' : 'Add member'}</button></div></form>;
}
