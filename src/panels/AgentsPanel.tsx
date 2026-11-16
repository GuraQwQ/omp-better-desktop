import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUp, ChevronRight, RefreshCw, Square, Users } from 'lucide-react';
import { request, rpc } from '../lib/bridge';
import { agentStatus, mergeAgentSnapshot, mergeAgentMessages, terminalAgent, visibleAgents, type AgentView, type SessionUpdater } from '../lib/agents-state';
import { enrichToolMessages, normalizeHistoryMessages } from '../lib/session-state';
import type { SubagentMessages, SubagentSnapshot } from '../generated/rpc-wire';
import type { Copy } from '../lib/i18n';
import type { Language, Message, SessionView } from '../lib/types';
import AgentTranscript from './AgentTranscript';
import SwarmPanel from './SwarmPanel';
import './agents.css';

const subscriptionOwners = new Map<string, symbol>();
const subscriptionTails = new Map<string, Promise<unknown>>();
function detailSubscription(id: string, onError: (error: unknown) => void): () => void {
  const owner = Symbol();
  subscriptionOwners.set(id, owner);
  const set = (level: 'events' | 'progress') => {
    const task = (subscriptionTails.get(id) ?? Promise.resolve()).catch(() => {}).then(() => rpc(id, 'set_subagent_subscription', { level }));
    subscriptionTails.set(id, task);
    void task.catch(onError).finally(() => { if (subscriptionTails.get(id) === task) subscriptionTails.delete(id); });
  };
  set('events');
  return () => {
    if (subscriptionOwners.get(id) !== owner) return;
    subscriptionOwners.delete(id);
    set('progress');
  };
}

type Props = { session?: SessionView; language: Language; t: Copy; swarmEnabled?: boolean; onSessionUpdate?: SessionUpdater; focusAgentId?: string; onAgentFocused?: () => void };
export default function AgentsPanel({ session, language, t, swarmEnabled = false, onSessionUpdate, focusAgentId, onAgentFocused }: Props) {
  const zh = language === 'zh';
  const [baseline, setBaseline] = useState<SubagentSnapshot[]>([]);
  const [selected, setSelected] = useState('');
  const [history, setHistory] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [steer, setSteer] = useState('');
  const [busy, setBusy] = useState(false);
  const [nativeOpen, setNativeOpen] = useState(false);
  const latest = useRef({ session, onSessionUpdate }); latest.current = { session, onSessionUpdate };
  const revision = useRef(0), transcriptRevision = useRef(0), cursor = useRef(0), operation = useRef(false), readingFor = useRef<number | undefined>(undefined);
  const agents = useMemo(() => visibleAgents(session ? { ...session, agents: mergeAgentSnapshot(session.agents, baseline) } : undefined), [session, baseline]);
  const member = agents.find(item => item.id === selected);
  const rawMember = session?.agents?.members[selected];
  const live = !!session && !session.historyOnly;
  const canControl = live && member?.status === 'running';
  const renderedMessages = useMemo(() => enrichToolMessages(mergeAgentMessages(history, rawMember?.messages ?? [])), [history, rawMember?.messages]);

  async function load() {
    const current = latest.current.session;
    if (!current || current.historyOnly) return;
    const generation = ++revision.current;
    setLoading(true); setError('');
    try {
      const result = await rpc<{ subagents: SubagentSnapshot[] }>(current.id, 'get_subagents');
      if (revision.current !== generation || latest.current.session?.state.sessionId !== current.state.sessionId) return;
      setBaseline(result.subagents);
      latest.current.onSessionUpdate?.(current.id, value => value.state.sessionId !== current.state.sessionId ? value : { ...value, agents: mergeAgentSnapshot(value.agents, result.subagents) });
    } catch (value) { if (revision.current === generation) setError(value instanceof Error ? value.message : String(value)); }
    finally { if (revision.current === generation) setLoading(false); }
  }
  useEffect(() => { setBaseline([]); setSelected(''); setHistory([]); setError(''); setNotice(''); void load(); return () => { revision.current++; transcriptRevision.current++; }; }, [session?.id, session?.state.sessionId, session?.historyOnly]);
  useEffect(() => { if (focusAgentId) { setSelected(focusAgentId); setNativeOpen(true); onAgentFocused?.(); } }, [focusAgentId, onAgentFocused]);
  useEffect(() => {
    if (!session || session.historyOnly || !selected) return;
    let active = true;
    const release = detailSubscription(session.id, value => { if (active) setError(value instanceof Error ? value.message : String(value)); });
    return () => { active = false; release(); };
  }, [session?.id, session?.state.sessionId, session?.historyOnly, !!selected]);

  async function readTranscript(generation = transcriptRevision.current) {
    const current = latest.current.session;
    const agent = visibleAgents(current ? { ...current, agents: mergeAgentSnapshot(current.agents, baseline) } : undefined).find(item => item.id === selected);
    if (!current || !agent || readingFor.current === generation) return;
    readingFor.current = generation; setReading(true);
    const rawAtStart = new Map((current.agents?.members[selected]?.messages ?? []).map(message => [message.id, message]));
    try {
      if (current.historyOnly) {
        if (!agent.sessionFile) return;
        const page = await request('session.history', { path: agent.sessionFile, limit: 100 });
        if (generation === transcriptRevision.current && latest.current.session?.state.sessionId === current.state.sessionId) setHistory(normalizeHistoryMessages(page.messages, `subhistory-${selected}`));
      } else {
        let page: SubagentMessages;
        try { page = await rpc(current.id, 'get_subagent_messages', { subagentId: selected, fromByte: cursor.current }); }
        catch (value) {
          if (!agent.sessionFile || !String(value).includes('Unknown subagent')) throw value;
          const stored = await request('session.history', { path: agent.sessionFile, limit: 100 });
          if (generation === transcriptRevision.current && latest.current.session?.state.sessionId === current.state.sessionId) setHistory(normalizeHistoryMessages(stored.messages, `subhistory-${selected}`));
          return;
        }
        if (generation !== transcriptRevision.current || latest.current.session?.state.sessionId !== current.state.sessionId) return;
        cursor.current = page.nextByte;
        const messages = normalizeHistoryMessages(page.messages, `subhistory-${selected}-${page.fromByte}`);
        setHistory(previous => mergeAgentMessages(page.reset ? [] : previous, messages));
        if (page.reset) latest.current.onSessionUpdate?.(current.id, value => {
          const member = value.agents?.members[selected];
          if (!member || !value.agents) return value;
          return { ...value, agents: { ...value.agents, members: { ...value.agents.members, [selected]: { ...member, messages: (member.messages ?? []).filter(message => rawAtStart.get(message.id) !== message) } } } };
        });
      }
    } catch (value) { if (generation === transcriptRevision.current) setError(value instanceof Error ? value.message : String(value)); }
    finally { if (readingFor.current === generation) readingFor.current = undefined; if (generation === transcriptRevision.current) setReading(false); }
  }
  useEffect(() => {
    const generation = ++transcriptRevision.current;
    cursor.current = 0; setHistory([]); setSteer(''); setNotice(''); setError('');
    void readTranscript(generation);
    return () => { transcriptRevision.current++; };
  }, [session?.id, session?.state.sessionId, selected, member?.sessionFile]);
  useEffect(() => {
    if (!selected || !live) return;
    const timer = setTimeout(() => void readTranscript(), 350);
    return () => clearTimeout(timer);
  }, [rawMember?.eventRevision, member?.status]);

  async function control(type: 'steer_subagent' | 'cancel_subagent') {
    if (!session || !canControl || operation.current || type === 'steer_subagent' && !steer.trim()) return;
    operation.current = true; setBusy(true); setError(''); setNotice('');
    const sessionId = session.id, agentId = selected, generation = transcriptRevision.current;
    try {
      const result = await rpc(sessionId, type, { subagentId: agentId, ...(type === 'steer_subagent' ? { message: steer.trim() } : {}) });
      if (generation !== transcriptRevision.current) return;
      setNotice(type === 'steer_subagent' ? zh ? '指令已接受。' : 'Instruction accepted.' : result.cancelled ? zh ? '已停止子代理。' : 'Agent stopped.' : zh ? '子代理已结束，无需停止。' : 'The agent has already finished.');
      if (type === 'steer_subagent') setSteer('');
      await load(); await readTranscript();
    } catch (value) { if (generation === transcriptRevision.current) setError(value instanceof Error ? value.message : String(value)); }
    finally { operation.current = false; setBusy(false); }
  }

  const activeCount = agents.filter(item => !terminalAgent(item.status)).length;
  return <div className={`agents-panel${swarmEnabled ? ' with-swarm' : ''}${nativeOpen ? ' native-open' : ''}`}>
    {swarmEnabled && session && <SwarmPanel key={`${session.id}:${session.state.sessionId ?? ''}`} session={session} language={language} onSessionUpdate={onSessionUpdate} />}
    <details className={`native-agents${swarmEnabled ? '' : ' standalone'}`} open={!swarmEnabled || nativeOpen} onToggle={event => { if (event.target === event.currentTarget) setNativeOpen(event.currentTarget.open); }}><summary hidden={!swarmEnabled}><ChevronRight size={13} />{zh ? 'OMP 子代理与通信' : 'OMP agents and messages'}<span>{agents.length}</span></summary><div className="native-agents-body"><div className="agents-heading"><h3><Users size={14} />{zh ? '子代理' : 'Subagents'}<span>{activeCount ? zh ? `${activeCount} 个运行中` : `${activeCount} active` : agents.length ? zh ? `${agents.length} 个已结束` : `${agents.length} finished` : ''}</span></h3>{live && <button className="icon-button" aria-label={zh ? '刷新子代理' : 'Refresh agents'} disabled={loading} onClick={() => void load()}><RefreshCw size={13} /></button>}</div>
    {error && <p className="agents-error" role="alert">{error}</p>}
    {notice && <p className="agents-notice" role="status">{notice}</p>}
    {selected ? <section className="agent-detail">
      <div className="agent-detail-heading"><button className="quiet-button" onClick={() => setSelected('')}><ArrowLeft size={13} />{zh ? '全部子代理' : 'All agents'}</button><button className="icon-button" aria-label={zh ? '刷新对话' : 'Refresh transcript'} disabled={reading || !member} onClick={() => void readTranscript()}><RefreshCw size={13} /></button></div>
      <h4>{member?.description || member?.agent || selected}</h4>
      {member && <div className="agent-meta"><span className={`agent-status ${member.status}`}>{agentStatus(member.status, zh)}</span><span>{member.id}</span>{member.progress?.resolvedModel && <span>{member.progress.resolvedModel}</span>}</div>}
      {member?.task && <p className="agent-assignment">{member.task}</p>}
      <div className="agent-transcript" aria-busy={reading}>
        {renderedMessages.length ? <AgentTranscript messages={renderedMessages} t={t} zh={zh} active={canControl} /> : <p className="panel-empty">{reading ? t.loading : member ? zh ? '对话将在产生记录后显示。' : 'The transcript will appear as the agent works.' : zh ? '当前会话没有这个子代理的记录。' : 'This agent is not in the current session.'}</p>}
      </div>
      {canControl && <form className="agent-steer" onSubmit={event => { event.preventDefault(); void control('steer_subagent'); }}><label htmlFor="agent-steer-message">{zh ? '补充指令' : 'Send an instruction'}</label><textarea id="agent-steer-message" rows={2} value={steer} disabled={busy} onChange={event => setSteer(event.target.value)} placeholder={zh ? '在下一步骤补充要求…' : 'Add guidance for the next step…'} /><div><button className="quiet-button" type="button" disabled={busy} onClick={() => void control('cancel_subagent')}><Square size={12} />{zh ? '停止子代理' : 'Stop agent'}</button><button className="secondary-button" disabled={busy || !steer.trim()}><ArrowUp size={13} />{busy ? t.loading : zh ? '发送' : 'Send'}</button></div></form>}
    </section> : loading && !agents.length ? <p className="panel-empty">{t.loading}</p> : agents.length ? <div className="agents-list">{agents.map(agent => <AgentRow key={`${agent.id}:${agent.parentToolCallId ?? ''}`} agent={agent} zh={zh} onOpen={() => setSelected(agent.id)} />)}</div> : <p className="panel-empty">{zh ? '子代理开始工作后，进度会显示在这里。' : 'Subagent progress will appear here when work starts.'}</p>}
    {!!session?.agents?.peers.length && <section className="peer-feed"><h3>{zh ? '协作消息' : 'Peer messages'}</h3><ol>{session.agents.peers.slice(-100).map(message => <li key={message.id}><div><strong>{message.from}</strong><span>→ {message.to}</span><time dateTime={new Date(message.timestamp).toISOString()}>{new Date(message.timestamp).toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en', { hour: '2-digit', minute: '2-digit' })}</time></div><p>{message.text}</p></li>)}</ol></section>}
    </div></details>
  </div>;
}

function AgentRow({ agent, zh, onOpen }: { agent: AgentView; zh: boolean; onOpen: () => void }) {
  const progress = agent.progress ?? {};
  const action = progress.currentTool ? `${progress.currentTool}${progress.currentToolArgs ? ` · ${progress.currentToolArgs}` : ''}` : progress.stage ?? progress.lastIntent;
  return <button className={`agent-list-row ${agent.status}`} onClick={onOpen}><div><strong>{agent.description || agent.agent || agent.id}</strong><span className={`agent-status ${agent.status}`}>{agentStatus(agent.status, zh)}</span></div><p>{action || agent.task || agent.assignment || agent.id}</p><small>{agent.id}{progress.durationMs ? ` · ${(progress.durationMs / 1000).toFixed(1)}s` : ''}{typeof progress.tokens === 'number' ? ` · ${progress.tokens.toLocaleString()} token` : ''}{progress.retryState && ` · ${zh ? '重试中' : 'Retrying'}`}</small></button>;
}
