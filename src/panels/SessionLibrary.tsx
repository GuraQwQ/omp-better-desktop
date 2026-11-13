import { useEffect, useRef, useState } from 'react';
import { Archive, ArrowUpRight, BarChart3, FolderOpen, Quote, RefreshCw, Search, Undo2 } from 'lucide-react';
import Select from '../components/Select';
import { SessionRow, type SessionAction, type SessionListEntry } from '../components/SavedSessions';
import { pickPath, request } from '../lib/bridge';
import { displayPath } from '../lib/display-path';
import { localizeError } from '../lib/i18n';
import type { Language, Message, SessionSummary } from '../lib/types';
import { createMessageReference, type ConversationReference } from '../lib/references';
import './session-library.css';

type Props = {
  language: Language; cwd?: string; externalEnabled: boolean;
  onOpen: (session: SessionSummary, messageId?: string) => void;
  onReference: (value: string | ConversationReference[]) => void;
  onArchiveChange?: () => void;
};
type ArchivedSession = SessionSummary & { archived?: boolean; missing?: boolean };
type SearchItem = { session: ArchivedSession; messageId: string; role: string; snippet: string };
type Page<T> = { items: T[]; total: number; nextCursor: string | null; warnings?: { error: string; path?: string }[] };
type ExternalSession = SessionSummary & { source: 'codex' | 'zcode'; format: string };
type Usage = { tokens: { total: number; input: number; output: number; cacheRead: number; cacheWrite: number; reasoning: number }; cost: number; missingCost: number; messages: number; sessions: number };
type UsageSummary = { totals: Usage; models: { key: string; usage: Usage }[]; projects: { key: string; usage: Usage }[]; days: { key: string; usage: Usage }[]; warnings: { error: string; path: string }[] };
type Words = typeof zh;
const zh = {
  title: '会话资料库', hint: '查找历史内容、恢复归档，并了解会话用量。', search: '正文搜索', archives: '归档', usage: '用量趋势', external: '外部会话',
  all: '全部项目', project: '当前项目', scope: '查看范围', query: '搜索对话正文', searchHint: '输入关键词查找当前分支中的消息。', includeArchived: '包含归档会话',
  searching: '正在搜索…', loading: '正在读取…', more: '加载更多', earlier: '加载较早消息', empty: '未找到相关消息。', noArchives: '还没有归档会话。',
  open: '打开会话', locate: '定位消息', quote: '引用原文', archive: '归档', restore: '恢复', restored: '会话已恢复。', archived: '会话已归档。', refresh: '刷新',
  missing: '原会话文件暂不可用', clearArchive: '移除归档标记', user: '用户', assistant: '助手', matches: '条匹配', warnings: '部分记录未能读取',
  from: '开始日期', to: '结束日期', apply: '更新统计', tokens: 'Token 总量', cost: '已记录费用（USD）', missingCost: '次调用未记录费用', sessions: '个会话',
  models: '按模型', projects: '按项目', days: '每日用量（UTC）', emptyUsage: '该范围内还没有已记录的用量。', unknown: '未记录', count: '用量',
  source: '外部助手', directory: '数据目录', defaultDirectory: '使用默认数据目录', browse: '选择目录', read: '读取会话', noExternal: '此目录中没有可查看的会话。',
  externalHint: '查看 Codex 和 ZCode 的本地会话，选取正文引用到当前草稿。', preview: '会话正文', chooseExternal: '选择会话查看正文。', back: '返回列表',
};
const en: Words = {
  title: 'Session library', hint: 'Find past messages, restore archives, and inspect usage.', search: 'Message search', archives: 'Archives', usage: 'Usage trends', external: 'External sessions',
  all: 'All projects', project: 'Current project', scope: 'Scope', query: 'Search message text', searchHint: 'Enter a keyword to find messages in the current branch.', includeArchived: 'Include archived sessions',
  searching: 'Searching…', loading: 'Loading…', more: 'Load more', earlier: 'Load earlier messages', empty: 'No matching messages.', noArchives: 'No archived sessions yet.',
  open: 'Open session', locate: 'Go to message', quote: 'Quote message', archive: 'Archive', restore: 'Restore', restored: 'Session restored.', archived: 'Session archived.', refresh: 'Refresh',
  missing: 'Source session is unavailable', clearArchive: 'Remove archive marker', user: 'User', assistant: 'Assistant', matches: 'matches', warnings: 'Some records could not be read',
  from: 'Start date', to: 'End date', apply: 'Update usage', tokens: 'Total tokens', cost: 'Recorded cost (USD)', missingCost: 'calls without recorded cost', sessions: 'sessions',
  models: 'By model', projects: 'By project', days: 'Daily usage (UTC)', emptyUsage: 'No recorded usage in this range.', unknown: 'Not recorded', count: 'Usage',
  source: 'External assistant', directory: 'Data directory', defaultDirectory: 'Use default data directory', browse: 'Choose directory', read: 'Read sessions', noExternal: 'No readable sessions in this directory.',
  externalHint: 'View local Codex and ZCode conversations and quote text into the current draft.', preview: 'Conversation', chooseExternal: 'Choose a session to read its messages.', back: 'Back to list',
};

function failure(error: unknown, language: Language) { return localizeError(error instanceof Error ? error.message : String(error), language); }
function body(message: Message): string {
  if (typeof message.content === 'string') return message.content;
  return message.content.filter(part => part.type === 'text').map(part => String(part.text ?? '')).join('\n');
}
function title(session: SessionSummary) { return session.title || session.id; }
function reference(session: SessionSummary, message: Message) { return [createMessageReference({ sessionId: session.id, sessionPath: session.path, sessionTitle: title(session) }, message)]; }
function Warnings({ items, words }: { items?: { error: string; path?: string }[]; words: Words }) {
  if (!items?.length) return null;
  return <details className="library-warnings"><summary>{words.warnings} · {items.length}</summary>{items.map((item, index) => <p key={index}>{item.path && <small>{displayPath(item.path)} · </small>}{item.error}</p>)}</details>;
}

export default function SessionLibrary(props: Props) {
  const words = props.language === 'zh' ? zh : en;
  const [tab, setTab] = useState<'search' | 'archives' | 'usage' | 'external'>('search');
  const [scope, setScope] = useState(props.cwd ? 'project' : 'all');
  const cwd = scope === 'project' ? props.cwd : undefined;
  const activeTab = tab === 'external' && !props.externalEnabled ? 'search' : tab;
  const tabs = [{ id: 'search', label: words.search, icon: Search }, { id: 'archives', label: words.archives, icon: Archive }, { id: 'usage', label: words.usage, icon: BarChart3 }, ...(props.externalEnabled ? [{ id: 'external', label: words.external, icon: FolderOpen }] : [])];
  return <section className="session-library" aria-label={words.title}>
    <header className="library-header"><div><h2>{words.title}</h2><p>{words.hint}</p></div><Select label={words.scope} value={scope} onChange={setScope} options={[{ value: 'all', label: words.all }, { value: 'project', label: words.project, disabled: !props.cwd }]} /></header>
    <nav className="library-tabs" aria-label={words.title}>{tabs.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={`quiet-button ${activeTab === id ? 'active' : ''}`} aria-current={activeTab === id ? 'page' : undefined} onClick={() => setTab(id as typeof tab)}><Icon size={14} />{label}</button>)}</nav>
    <div className="library-content">
      {activeTab === 'search' && <MessageSearch key={cwd ?? 'all'} {...props} cwd={cwd} words={words} />}
      {activeTab === 'archives' && <Archives {...props} cwd={cwd} words={words} />}
      {activeTab === 'usage' && <UsageTrends key={cwd ?? 'all'} cwd={cwd} language={props.language} words={words} />}
      {activeTab === 'external' && <ExternalSessions key={cwd ?? 'all'} {...props} cwd={cwd} words={words} />}
    </div>
  </section>;
}

function MessageSearch({ language, cwd, onOpen, onReference, onArchiveChange, words }: Props & { words: Words }) {
  const [query, setQuery] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [submitted, setSubmitted] = useState({ query: '', includeArchived: false });
  const [result, setResult] = useState<Page<SearchItem>>();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const revision = useRef(0);
  useEffect(() => () => { revision.current++; }, []);
  const search = async (cursor?: string) => {
    const current = ++revision.current;
    const spec = cursor ? submitted : { query: query.trim(), includeArchived };
    if (!spec.query) { setResult(undefined); return; }
    setSubmitted(spec); setLoading(true); setError(''); setNotice('');
    try {
      const value = await request<Page<SearchItem>>('session.search', { ...spec, cwd, cursor });
      if (current === revision.current) setResult(previous => ({ ...value, items: cursor ? [...(previous?.items ?? []), ...value.items] : value.items }));
    } catch (error) { if (current === revision.current) setError(failure(error, language)); }
    finally { if (current === revision.current) setLoading(false); }
  };
  const act = async (item: SearchItem, action: 'quote' | 'archive') => {
    const current = revision.current; setBusy(`${item.session.path}:${item.messageId}`); setError('');
    try {
      if (action === 'quote') {
        const page = await request<{ messages: Message[] }>('session.locate', { path: item.session.path, messageId: item.messageId, limit: 1 });
        const message = page.messages.find(message => message.id === item.messageId);
        if (message && current === revision.current) onReference(reference(item.session, message));
      } else {
        await request('session.archive', { path: item.session.path, archived: !item.session.archived });
        if (current !== revision.current) return;
        onArchiveChange?.(); setNotice(item.session.archived ? words.restored : words.archived);
        setResult(previous => previous ? { ...previous, items: previous.items.map(hit => hit.session.path === item.session.path ? { ...hit, session: { ...hit.session, archived: !item.session.archived } } : hit) } : previous);
      }
    } catch (error) { if (current === revision.current) setError(failure(error, language)); }
    finally { if (current === revision.current) setBusy(''); }
  };
  return <div aria-busy={loading}>
    <form className="library-search-form" onSubmit={event => { event.preventDefault(); void search(); }}><label className="library-query"><span>{words.query}</span><input type="search" value={query} disabled={loading || !!busy} onChange={event => setQuery(event.target.value)} placeholder={words.searchHint} /></label><button type="submit" className="primary-button" disabled={loading || !!busy || !query.trim()}><Search size={14} />{loading ? words.searching : words.search}</button><label className="library-checkbox"><input type="checkbox" checked={includeArchived} disabled={loading || !!busy} onChange={event => setIncludeArchived(event.target.checked)} />{words.includeArchived}</label></form>
    {error && <p role="alert" className="library-error">{error}</p>}{notice && <p role="status" className="library-notice">{notice}</p>}
    {result && <p className="library-result-count" role="status">{result.total} {words.matches}</p>}
    {!result && !loading && <p className="library-empty">{words.searchHint}</p>}
    {result?.items.length === 0 && !loading && <p className="library-empty">{words.empty}</p>}
    <div className="library-results">{result?.items.map(item => <article className="library-result" key={`${item.session.path}:${item.messageId}`}><div className="library-result-heading"><button type="button" onClick={() => onOpen(item.session, item.messageId)}><strong>{title(item.session)}</strong></button><small>{item.role === 'user' ? words.user : words.assistant}{item.session.archived ? ` · ${words.archives}` : ''}</small></div><small className="library-path">{displayPath(item.session.cwd)}</small><p className="library-snippet">{item.snippet}</p><div className="library-row-actions"><button type="button" className="quiet-button" onClick={() => onOpen(item.session, item.messageId)}><ArrowUpRight size={13} />{words.locate}</button><button type="button" className="quiet-button" disabled={!!busy || loading} onClick={() => void act(item, 'quote')}><Quote size={13} />{words.quote}</button><button type="button" className="quiet-button" disabled={!!busy || loading} onClick={() => void act(item, 'archive')}><Archive size={13} />{item.session.archived ? words.restore : words.archive}</button></div></article>)}</div>
    <Warnings items={result?.warnings} words={words} />{result?.nextCursor && <button className="quiet-button library-more" type="button" disabled={loading || !!busy} onClick={() => void search(result.nextCursor!)}>{loading ? words.loading : words.more}</button>}
  </div>;
}

function Archives({ language, cwd, onOpen, onArchiveChange, words }: Props & { words: Words }) {
  const [items, setItems] = useState<ArchivedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const revision = useRef(0);
  const load = async () => {
    const current = ++revision.current; setLoading(true); setError('');
    try { const value = await request<ArchivedSession[]>('session.archives'); if (current === revision.current) setItems(value); }
    catch (error) { if (current === revision.current) setError(failure(error, language)); }
    finally { if (current === revision.current) setLoading(false); }
  };
  useEffect(() => { void load(); return () => { revision.current++; }; }, [language]);
  const restore = async (item: ArchivedSession) => {
    const current = revision.current; setBusy(item.path); setError('');
    try {
      await request('session.archive', { path: item.path, archived: false });
      if (current !== revision.current) return;
      setItems(items => items.filter(row => row.path !== item.path)); setNotice(words.restored); onArchiveChange?.();
    } catch (error) { if (current === revision.current) setError(failure(error, language)); }
    finally { if (current === revision.current) setBusy(''); }
  };
  const act = async (item: SessionListEntry, action: SessionAction) => {
    if (action === 'restore') return restore(item);
    if (action === 'delete') { const result = await request<{ warning?: string }>('session.delete', { path: item.path }); if (result.warning) setNotice(result.warning); }
    else await request('session.pin', { path: item.path, pinned: action === 'pin' });
    await load(); onArchiveChange?.();
  };
  const visible = items.filter(item => !cwd || item.cwd.replace(/\\/g, '/').toLowerCase() === cwd.replace(/\\/g, '/').toLowerCase());
  return <div aria-busy={loading}><div className="library-toolbar"><span>{visible.length} {words.sessions}</span><button type="button" className="quiet-button" disabled={loading || !!busy} onClick={() => void load()}><RefreshCw size={13} />{words.refresh}</button></div>{error && <p className="library-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}{loading ? <p role="status" className="library-empty">{words.loading}</p> : !visible.length && !error ? <p className="library-empty">{words.noArchives}</p> : null}<div className="library-results">{visible.map(item => <article key={item.path} className="library-result"><SessionRow value={item} title={title(item)} language={language} open={() => { if (!item.missing) onOpen(item); }} onAction={act} disabled={!!busy || loading} /><div className="library-result-heading"><small>{item.missing ? words.missing : new Date(item.updatedAt ?? 0).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')}</small></div><small className="library-path">{displayPath(item.cwd)}</small><div className="library-row-actions"><button type="button" className="quiet-button" disabled={item.missing} onClick={() => onOpen(item)}><ArrowUpRight size={13} />{words.open}</button><button type="button" className="quiet-button" disabled={!!busy || loading} onClick={() => void restore(item)}><Undo2 size={13} />{item.missing ? words.clearArchive : words.restore}</button></div></article>)}</div></div>;
}

function UsageTrends({ cwd, language, words }: { cwd?: string; language: Language; words: Words }) {
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [value, setValue] = useState<UsageSummary>(); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const revision = useRef(0);
  const load = async () => {
    const current = ++revision.current; setLoading(true); setError('');
    try { const result = await request<UsageSummary>('usage.summary', { cwd, from: from || undefined, to: to || undefined }); if (current === revision.current) setValue(result); }
    catch (error) { if (current === revision.current) setError(failure(error, language)); }
    finally { if (current === revision.current) setLoading(false); }
  };
  useEffect(() => { void load(); return () => { revision.current++; }; }, [cwd, language]);
  const number = (value: number) => value.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US');
  const cost = (usage: Usage) => `$${usage.cost.toFixed(4)}${usage.missingCost ? ' +' : ''}`;
  const max = Math.max(...(value?.days.map(day => day.usage.tokens.total) ?? []), 1);
  const table = (label: string, groups: UsageSummary['models'], paths = false) => <section className="library-usage-group"><h3>{label}</h3><div className="library-table-scroll"><table><thead><tr><th>{label}</th><th>{words.tokens}</th><th>{words.cost}</th></tr></thead><tbody>{groups.map(item => <tr key={item.key}><td title={item.key}>{item.key === 'unknown' ? words.unknown : paths ? displayPath(item.key) : item.key}</td><td>{number(item.usage.tokens.total)}</td><td>{cost(item.usage)}{item.usage.missingCost > 0 && <small>{item.usage.missingCost} {words.missingCost}</small>}</td></tr>)}</tbody></table></div></section>;
  return <div aria-busy={loading}><form className="library-date-form" onSubmit={event => { event.preventDefault(); void load(); }}><label><span>{words.from}</span><input type="date" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)} /></label><label><span>{words.to}</span><input type="date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)} /></label><button className="quiet-button" type="submit" disabled={loading}>{words.apply}</button></form>{error && <p role="alert" className="library-error">{error}</p>}{loading && <p role="status" className="library-empty">{words.loading}</p>}{value && <><div className="library-metrics"><div><small>{words.tokens}</small><strong>{number(value.totals.tokens.total)}</strong><small>{value.totals.sessions} {words.sessions}</small></div><div><small>{words.cost}</small><strong>{cost(value.totals)}</strong>{value.totals.missingCost > 0 && <small>{value.totals.missingCost} {words.missingCost}</small>}</div><div><small>{words.count}</small><strong>{number(value.totals.messages)}</strong><small>{words.assistant}</small></div></div>{!value.totals.messages ? <p className="library-empty">{words.emptyUsage}</p> : <><section className="library-usage-group"><h3>{words.days}</h3><div className="library-trend">{value.days.map(item => <div className="library-trend-row" key={item.key}><span>{item.key === 'unknown' ? words.unknown : item.key}</span><meter min={0} max={max} value={item.usage.tokens.total} aria-label={`${item.key} ${words.tokens}`} /><strong>{number(item.usage.tokens.total)}</strong></div>)}</div></section>{table(words.models, value.models)}{table(words.projects, value.projects, true)}</>}<Warnings items={value.warnings} words={words} /></>}</div>;
}

function ExternalSessions({ language, cwd, onReference, words }: Props & { words: Words }) {
  const [source, setSource] = useState('codex'); const [home, setHome] = useState(''); const [resolvedHome, setResolvedHome] = useState(''); const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [page, setPage] = useState<Page<ExternalSession>>(); const [selected, setSelected] = useState<ExternalSession>();
  const [messages, setMessages] = useState<Message[]>([]); const [nextCursor, setNextCursor] = useState<string | null>(null); const [warnings, setWarnings] = useState<{ error: string }[]>([]);
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const revision = useRef(0);
  useEffect(() => { revision.current++; setPage(undefined); setSelected(undefined); setMessages([]); setResolvedHome(''); setError(''); setLoading(false); }, [source, home]);
  useEffect(() => () => { revision.current++; }, []);
  const load = async (cursor?: string) => {
    const current = ++revision.current; setLoading(true); setError(''); setSelected(undefined);
    const searchQuery = cursor ? submittedQuery : query; setSubmittedQuery(searchQuery);
    try {
      const result = await request<Page<ExternalSession> & { home: string }>('external.sessions', { source, home: home || undefined, query: searchQuery, cwd, cursor });
      if (current === revision.current) { setPage(previous => ({ ...result, items: cursor ? [...(previous?.items ?? []), ...result.items] : result.items })); setResolvedHome(result.home); }
    } catch (error) { if (current === revision.current) setError(failure(error, language)); }
    finally { if (current === revision.current) setLoading(false); }
  };
  const read = async (item: ExternalSession, cursor?: string) => {
    const current = ++revision.current; setSelected(item); setLoading(true); setError(''); if (!cursor) setMessages([]);
    try {
      const result = await request<{ messages: Message[]; nextCursor: string | null; warnings: { error: string }[] }>('external.history', { source: item.source, home: resolvedHome || home || undefined, path: item.path, id: item.id, cursor });
      if (current === revision.current) { setMessages(previous => cursor ? [...result.messages, ...previous] : result.messages); setNextCursor(result.nextCursor); setWarnings(result.warnings); }
    } catch (error) { if (current === revision.current) setError(failure(error, language)); }
    finally { if (current === revision.current) setLoading(false); }
  };
  const choose = async () => { try { const path = await pickPath(); if (path) setHome(path); } catch (error) { setError(failure(error, language)); } };
  return <div aria-busy={loading}><p className="library-external-hint">{words.externalHint}</p><form className="library-external-form" onSubmit={event => { event.preventDefault(); void load(); }}><Select label={words.source} value={source} options={[{ value: 'codex', label: 'Codex' }, { value: 'zcode', label: 'ZCode' }]} disabled={loading} onChange={setSource} /><label className="library-query"><span>{words.directory}</span><input value={home} placeholder={words.defaultDirectory} disabled={loading} onChange={event => setHome(event.target.value)} /></label><button type="button" className="quiet-button" disabled={loading} onClick={() => void choose()}><FolderOpen size={14} />{words.browse}</button><label className="library-query"><span>{words.search}</span><input type="search" value={query} disabled={loading} onChange={event => setQuery(event.target.value)} /></label><button className="primary-button" type="submit" disabled={loading}>{words.read}</button></form>{error && <p role="alert" className="library-error">{error}</p>}{loading && <p className="library-empty" role="status">{words.loading}</p>}
    {selected ? <section className="library-external-preview" aria-label={words.preview}><div className="library-toolbar"><div><strong>{title(selected)}</strong><small className="library-path">{displayPath(selected.cwd)}</small></div><button className="quiet-button" type="button" onClick={() => { revision.current++; setSelected(undefined); setLoading(false); }}>{words.back}</button></div>{nextCursor && <button className="quiet-button" type="button" disabled={loading} onClick={() => void read(selected, nextCursor)}>{words.earlier}</button>}<div className="library-results">{messages.map(message => <article className="library-result" key={message.id}><div className="library-result-heading"><small>{message.role === 'user' ? words.user : words.assistant}</small><button className="quiet-button" type="button" onClick={() => onReference(reference(selected, message))}><Quote size={13} />{words.quote}</button></div><p className="library-message-body">{body(message)}</p></article>)}</div><Warnings words={words} items={warnings} /></section> : <>{page && !page.items.length && !loading && <p className="library-empty">{words.noExternal}</p>}<div className="library-results">{page?.items.map(item => <button type="button" className="library-external-row" key={`${item.source}:${item.id}`} onClick={() => void read(item)} disabled={loading}><span><strong>{title(item)}</strong><small>{displayPath(item.cwd)}</small></span><ArrowUpRight size={14} /></button>)}</div>{page?.nextCursor && <button type="button" className="quiet-button library-more" disabled={loading} onClick={() => void load(page.nextCursor!)}>{words.more}</button>}<Warnings words={words} items={page?.warnings} /></>}
  </div>;
}
