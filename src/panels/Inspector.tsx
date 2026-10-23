import { useEffect, useState } from 'react';
import { File, RefreshCw, X } from 'lucide-react';
import { request, rpc } from '../lib/bridge';
import type { Copy } from '../lib/i18n';
import type { Json, SessionView } from '../lib/types';

export type InspectorTab = 'review' | 'files' | 'context' | 'agents' | 'tasks' | 'tree';
export default function Inspector({ tab, session, cwd, t, onError, close, send, onSessionChanged }: { tab: InspectorTab; session?: SessionView; cwd: string; t: Copy; onError: (error: unknown) => void; close: () => void; send: (text: string) => void; onSessionChanged: () => Promise<void> }) {
  const [data, setData] = useState<any>(null);
  const [file, setFile] = useState('');
  const [content, setContent] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true); setData(null);
    try {
      if (tab === 'review') setData(await request('workspace.diff', { cwd }));
      else if (tab === 'files') setData(await request('workspace.files', { cwd }));
      else if (session && !session.historyOnly) setData(await rpc(session.id, tab === 'agents' ? 'get_subagents' : tab === 'tree' ? 'get_tree' : 'get_state'));
    } catch (error) { onError(error); } finally { setLoading(false); }
  };
  useEffect(() => { void load(); setFile(''); }, [tab, cwd, session?.id]);
  const stats = session?.messages.reduce((sum, message) => {
    const usage = message.usage;
    if (!usage) return sum;
    for (const key of ['input', 'output', 'cacheRead', 'cacheWrite']) if (typeof usage[key] === 'number') sum[key] = (sum[key] ?? 0) + usage[key];
    return sum;
  }, {} as Json) ?? {};
  const treeAction = async (type: 'branch' | 'fork', entryId: string) => {
    if (!session) return;
    try { await rpc(session.id, type, { entryId }); await onSessionChanged(); await load(); } catch (error) { onError(error); }
  };
  return <aside className="inspector"><header><h2>{t[tab]}</h2><div><button className="icon-button" title={t.refresh} onClick={load}><RefreshCw size={14} /></button><button className="icon-button" title={t.close} onClick={close}><X size={17} /></button></div></header><div className="inspector-body">
    {loading ? <p className="muted">{t.loading}</p> : tab === 'review' ? data?.diff ? <><div className="diff-summary"><code>{data.status}</code><button className="quiet-button" onClick={() => send('/review')}>{t.reviewAction}</button></div><pre className="diff">{data.diff.split('\n').map((line: string, i: number) => <span key={i} className={line.startsWith('+') && !line.startsWith('+++') ? 'added' : line.startsWith('-') && !line.startsWith('---') ? 'removed' : line.startsWith('@@') ? 'hunk' : ''}>{line}{'\n'}</span>)}</pre></> : <p className="panel-empty">{t.noChanges}</p> : tab === 'files' ? <><input placeholder={t.search} value={query} onChange={e => setQuery(e.target.value)} />{file ? <><button className="quiet-button file-back" onClick={() => setFile('')}>← {t.files}</button><code className="file-title">{file}</code><button className="quiet-button" onClick={() => send(`@${file} `)}>{t.include}</button><pre className="file-content">{content}</pre></> : <div className="file-list">{(Array.isArray(data) ? data : []).filter((name: string) => name.toLowerCase().includes(query.toLowerCase())).map((name: string) => <button key={name} onClick={async () => { try { setContent(await request<string>('workspace.read', { cwd, path: name })); setFile(name); } catch (error) { onError(error); } }}><File size={14} /><span>{name}</span></button>)}</div>}</> : tab === 'context' ? <><h3>{t.usage}</h3><dl className="usage-grid">{[['input', t.inputTokens], ['output', t.outputTokens], ['cacheRead', t.cacheRead], ['cacheWrite', t.cacheWrite]].map(([key, title]) => <div key={key}><dt>{title}</dt><dd>{stats[key]?.toLocaleString() ?? t.unknown}</dd></div>)}</dl>{data?.contextUsage && <div className="context-meter"><label>{t.context}<span>{data.contextUsage.tokens?.toLocaleString()} / {data.contextUsage.contextWindow?.toLocaleString()}</span></label><progress max={100} value={data.contextUsage.percent ?? 0} /></div>}<h3>{t.model}</h3><p>{data?.model?.name ?? data?.model?.id ?? t.unknown}</p><div className="settings-actions"><button className="secondary-button" disabled={!session || session.historyOnly} onClick={() => { if (session) rpc(session.id, 'compact').then(load).catch(onError); }}>Compact</button><button className="quiet-button" onClick={() => send('/shake')}>Shake</button></div><h3>System prompt</h3><pre className="context-prompt">{Array.isArray(data?.systemPrompt) ? data.systemPrompt.join('\n\n') : data?.systemPrompt ?? t.unknown}</pre><h3>Tools</h3>{data?.dumpTools?.map((tool: Json) => <details className="tool-description" key={tool.name}><summary>{tool.name}</summary><p>{tool.description}</p></details>)}</> : tab === 'agents' ? (data?.subagents ?? []).length ? data.subagents.map((agent: Json) => <div className="agent-row" key={agent.id ?? agent.agentId}><strong>{agent.name ?? agent.agentName ?? agent.id}</strong><p>{agent.task ?? agent.status}</p><span className="badge">{agent.status}</span><button className="quiet-button" onClick={() => { if (session) rpc(session.id, 'cancel_subagent', { subagentId: agent.id ?? agent.agentId }).then(load).catch(onError); }}>{t.taskCancel}</button></div>) : <p className="panel-empty">{t.noAgents}</p> : tab === 'tasks' ? (data?.todoPhases ?? []).length ? data.todoPhases.map((phase: Json, index: number) => <section key={index}><h3>{phase.name}</h3>{phase.tasks.map((task: Json, i: number) => <div className="task-row" key={i}><span className={`task-marker ${task.status}`} /><span>{task.content}</span></div>)}</section>) : <p className="panel-empty">{t.noTasks}</p> : <TreeNodes nodes={data?.tree ?? []} leafId={data?.leafId} t={t} act={treeAction} />}
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
