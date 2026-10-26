import { useEffect, useMemo, useRef, useState } from 'react';
import { File, RefreshCw, X } from 'lucide-react';
import { request, rpc } from '../lib/bridge';
import { statusText, type Copy } from '../lib/i18n';
import type { Json, SessionView } from '../lib/types';
import { summarizeSessionUsage } from '../lib/session-usage';
import { sessionKey } from '../lib/session-identity';
import { collectTurnChanges } from '../lib/turn-changes';
import { isSessionRunning } from '../lib/session-state';
import Select from '../components/Select';
import ToolResult from '../components/ToolResult';
import './turn-changes.css';

export type InspectorTab = 'review' | 'files' | 'context' | 'agents' | 'tasks' | 'tree';
export default function Inspector({ tab, session, cwd, t, onError, close, send, onSessionChanged }: { tab: InspectorTab; session?: SessionView; cwd: string; t: Copy; onError: (error: unknown) => void; close: () => void; send: (text: string) => void; onSessionChanged: () => Promise<void> }) {
  const [data, setData] = useState<any>(null);
  const [file, setFile] = useState('');
  const [content, setContent] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState({ key: '', value: 'workspace' });
  const scopeKey = session ? sessionKey(session) : cwd;
  const turns = useMemo(() => tab === 'review' ? collectTurnChanges(session?.messages ?? []) : [], [tab, session?.messages]);
  const selectedTurn = selection.key === scopeKey ? turns.find(turn => turn.id === selection.value) : undefined;
  const loadRevision = useRef(0);
  const load = async () => {
    const revision = ++loadRevision.current;
    setLoading(true); setData(null);
    try {
      let value: Json | string[] | undefined;
      if (tab === 'review' && !selectedTurn) value = await request('workspace.diff', { cwd });
      else if (tab === 'files') value = await request('workspace.files', { cwd });
      else if (tab === 'context' && session) {
        const [stats, state] = await Promise.all([
          session.historyOnly ? session.path ? request('session.stats', { path: session.path }) : null : rpc(session.id, 'get_session_stats'),
          session.historyOnly ? session.state : rpc(session.id, 'get_state'),
        ]);
        value = { ...state, stats, contextUsage: stats?.contextUsage };
      } else if (tab !== 'review' && session && !session.historyOnly) value = await rpc(session.id, tab === 'agents' ? 'get_subagents' : tab === 'tree' ? 'get_tree' : 'get_state');
      if (loadRevision.current === revision) setData(value ?? null);
    } catch (error) { if (loadRevision.current === revision) onError(error); } finally { if (loadRevision.current === revision) setLoading(false); }
  };
  useEffect(() => { void load(); setFile(''); return () => { loadRevision.current++; }; }, [tab, cwd, session?.id, session?.path, session?.historyOnly, selectedTurn?.id]);
  const stats = data?.stats?.tokens ?? {};
  const usage = summarizeSessionUsage(data?.stats);
  const treeAction = async (type: 'branch' | 'fork', entryId: string) => {
    if (!session) return;
    try { await rpc(session.id, type, { entryId }); await onSessionChanged(); await load(); } catch (error) { onError(error); }
  };
  return <aside className="inspector"><header><h2>{t[tab]}</h2><div><button className="icon-button" title={t.refresh} onClick={load}><RefreshCw size={14} /></button><button className="icon-button" title={t.close} onClick={close}><X size={17} /></button></div></header><div className="inspector-body">
    {tab === 'review' ? <>
      <div className="review-scope"><span>{t.reviewScope}</span><Select label={t.reviewScope} value={selectedTurn?.id ?? 'workspace'} options={[{ value: 'workspace', label: t.workspaceChanges }, ...turns.slice().reverse().map(turn => ({ value: turn.id, label: turn.ordinal === null ? t.earlierTurn : `${t.turnLabel} · ${turn.title.slice(0, 60) || turn.ordinal}` }))]} onChange={value => setSelection({ key: scopeKey, value })} /></div>
      {selectedTurn ? <div className="turn-review" key={`${scopeKey}:${selectedTurn.id}`}><p className="turn-review-caption">{t.turnChanges}</p>{selectedTurn.messages.length ? selectedTurn.messages.map(message => {
        const details = message.result?.details ?? message.partialResult?.details ?? message.details;
        const note = message.toolName === 'write' ? t.changeRecord : message.toolName === 'ast_edit' && details?.applied === false ? t.proposedChange : '';
        return <section key={message.toolCallId ?? message.id}>{note && <p className="turn-record-note">{note}</p>}<ToolResult message={message} t={t} active={!session?.historyOnly && isSessionRunning(session)} /></section>;
      }) : <p className="panel-empty">{t.noTurnChanges}</p>}</div> : loading ? <p className="muted">{t.loading}</p> : data?.diff ? <><div className="diff-summary"><code>{data.status}</code><button className="quiet-button" onClick={() => send('/review')}>{t.reviewAction}</button></div><pre className="diff">{data.diff.split('\n').map((line: string, i: number) => <span key={i} className={line.startsWith('+') && !line.startsWith('+++') ? 'added' : line.startsWith('-') && !line.startsWith('---') ? 'removed' : line.startsWith('@@') ? 'hunk' : ''}>{line}</span>)}</pre></> : <p className="panel-empty">{t.noChanges}</p>}
    </> : loading ? <p className="muted">{t.loading}</p> : tab === 'files' ? <><input placeholder={t.search} value={query} onChange={e => setQuery(e.target.value)} />{file ? <><button className="quiet-button file-back" onClick={() => setFile('')}>← {t.files}</button><code className="file-title">{file}</code><button className="quiet-button" onClick={() => send(`@${file} `)}>{t.include}</button><pre className="file-content">{content}</pre></> : <div className="file-list">{(Array.isArray(data) ? data : []).filter((name: string) => name.toLowerCase().includes(query.toLowerCase())).map((name: string) => <button key={name} onClick={async () => { try { setContent(await request<string>('workspace.read', { cwd, path: name })); setFile(name); } catch (error) { onError(error); } }}><File size={14} /><span>{name}</span></button>)}</div>}</> : tab === 'context' ? <><h3>{t.usage}</h3><dl className="usage-grid">{[['total', t.totalTokens], ['input', t.inputTokens], ['output', t.outputTokens], ['cacheRead', t.cacheRead], ['cacheWrite', t.cacheWrite]].map(([key, title]) => <div key={key}><dt>{title}</dt><dd>{stats[key]?.toLocaleString() ?? t.unknown}</dd></div>)}<div><dt>{t.cacheHitRate}</dt><dd>{usage.cacheHitPercent === null ? t.unknown : `${usage.cacheHitPercent.toFixed(1)}%`}</dd></div></dl>{data?.contextUsage && <div className="context-meter"><label>{t.context}<span>{data.contextUsage.tokens?.toLocaleString()} / {data.contextUsage.contextWindow?.toLocaleString()}</span></label><progress max={100} value={data.contextUsage.percent ?? 0} /></div>}<h3>{t.model}</h3><p>{data?.model?.name ?? data?.model?.id ?? t.unknown}</p><div className="settings-actions"><button className="secondary-button" disabled={!session || session.historyOnly} onClick={() => { if (session) rpc(session.id, 'compact').then(load).catch(onError); }}>{t.compactContext}</button><button className="quiet-button" onClick={() => send('/shake')}>{t.shakeContext}</button></div><h3>{t.systemPrompt}</h3><pre className="context-prompt">{Array.isArray(data?.systemPrompt) ? data.systemPrompt.join('\n\n') : data?.systemPrompt ?? t.unknown}</pre><h3>{t.tools}</h3>{data?.dumpTools?.map((tool: Json) => <details className="tool-description" key={tool.name}><summary>{tool.name}</summary><p>{tool.description}</p></details>)}</> : tab === 'agents' ? (data?.subagents ?? []).length ? data.subagents.map((agent: Json) => <div className="agent-row" key={agent.id ?? agent.agentId}><strong>{agent.name ?? agent.agentName ?? agent.id}</strong><p>{agent.task ?? statusText(agent.status, t)}</p><span className="badge">{statusText(agent.status, t)}</span><button className="quiet-button" onClick={() => { if (session) rpc(session.id, 'cancel_subagent', { subagentId: agent.id ?? agent.agentId }).then(load).catch(onError); }}>{t.taskCancel}</button></div>) : <p className="panel-empty">{t.noAgents}</p> : tab === 'tasks' ? (data?.todoPhases ?? []).length ? data.todoPhases.map((phase: Json, index: number) => <section key={index}><h3>{phase.name}</h3>{phase.tasks.map((task: Json, i: number) => <div className="task-row" key={i}><span className={`task-marker ${task.status}`} /><span>{task.content}</span></div>)}</section>) : <p className="panel-empty">{t.noTasks}</p> : <TreeNodes nodes={data?.tree ?? []} leafId={data?.leafId} t={t} act={treeAction} />}
  </div></aside>;
}

function TreeNodes({ nodes, leafId, t, act }: { nodes: Json[]; leafId?: string; t: Copy; act: (type: 'branch' | 'fork', id: string) => Promise<void> }) {
  return <div className="tree-nodes">{nodes.map(node => {
    const entry = node.entry ?? node;
    const message = entry.message;
    const text = typeof message?.content === 'string' ? message.content : message?.content?.map((block: Json) => block.text ?? '').join(' ');
    return <div className="tree-node" key={entry.id}><details open={entry.id === leafId || !node.children?.length}><summary><span className={entry.id === leafId ? 'current' : ''}>{node.label ?? (text ? text.slice(0, 110) : entry.type ?? entry.id)}</span></summary><div className="tree-node-actions"><code>{entry.id}</code><button className="quiet-button" onClick={() => act('branch', entry.id)}>{t.branch}</button><button className="quiet-button" onClick={() => act('fork', entry.id)}>{t.fork}</button></div></details>{node.children?.length > 0 && <TreeNodes nodes={node.children} leafId={leafId} t={t} act={act} />}</div>;
  })}</div>;
}
