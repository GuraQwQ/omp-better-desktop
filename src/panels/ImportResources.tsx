import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Link2, RefreshCw } from 'lucide-react';
import Select from '../components/Select';
import AgentSourceIcon from '../components/AgentSourceIcon';
import { localizeError } from '../lib/i18n';
import { lineValues, manage } from '../lib/management';
import type { Language } from '../lib/types';
import './managed-resources.css';
import './imports.css';

interface Props { language: Language; cwd: string; ensureSession: () => Promise<string>; reconnect?: () => Promise<void> }
interface Candidate { id: string; name: string; kind: 'skill' | 'mcp'; source: string; path: string; description?: string; adapter?: string; key?: string; enabled?: boolean; linkedPath?: string; warning?: string }
const sources = [
  { id: 'agents', name: '.agent / .agents', paths: 'C:/.agent · ~/.agent/skills · ~/.agents/skills' },
  { id: 'gemini', name: 'Gemini / Antigravity', paths: '~/.gemini · .gemini' },
  { id: 'claude', name: 'Claude', paths: '~/.claude/skills · ~/.claude.json · .mcp.json' },
  { id: 'codex', name: 'Codex', paths: '~/.agents/skills · ~/.codex/config.toml · .codex/config.toml' },
  { id: 'trae', name: 'Trae', paths: '~/.trae/skills · Trae/User/mcp.json · .trae/mcp.json' },
  { id: 'zcode', name: 'ZCode', paths: '~/.zcode/skills · ~/.zcode/cli/config.json · .zcode/config.json' },
  { id: 'ccswitch', name: 'CC Switch', paths: '~/.cc-switch' },
];
const words = (language: Language) => language === 'zh' ? {
  title: '导入配置', intro: '选择现有技能与 MCP 配置，链接后可逐项启用。', sources: '配置来源', morePaths: '其他目录', pathsHint: '每行一个目录',
  discover: '发现配置', linked: '查看已链接', discovered: '发现的配置', linkedTitle: '已链接的配置', search: '搜索名称、来源或路径…',
  allKinds: '全部类型', skill: '技能', mcp: 'MCP', selectAll: '全选当前结果', clear: '取消选择', link: '链接所选项',
  discoverEmpty: '所选来源中没有找到配置。可以补充其他目录后重试。', linkedEmpty: '尚未链接配置。', noMatches: '没有匹配的结果。',
  working: '正在处理…', discovering: '正在发现配置…', reading: '正在读取链接…', stopping: '正在停止剩余操作…', cancelWait: '取消等待', cancelRemaining: '取消剩余项', cancelled: '已取消等待。',
  linkCount: (count: number) => `已链接 ${count} 项，可在下方逐项启用。`, partialCount: (count: number) => `已停止，保留已链接的 ${count} 项。`,
  enabled: '已启用', disabled: '待启用', enable: '启用', disable: '停用', remove: '移除链接', confirmRemove: '确认移除链接', cancel: '取消', retry: '重试',
  enabledNotice: '已启用，重新连接会话后生效。', disabledNotice: '已停用，重新连接会话后生效。', removedNotice: '链接已移除。', reconnect: '重新连接会话', reconnectHint: '配置将在下一次连接时应用。', reconnected: '会话已重新连接。',
  selected: (count: number) => `已选择 ${count} 项`, candidateLabel: (name: string) => `选择 ${name}`, sourceLabel: (name: string) => `发现 ${name} 配置`,
} : {
  title: 'Import configuration', intro: 'Choose existing skills and MCP configurations, link them, then enable each one when ready.', sources: 'Sources', morePaths: 'Other directories', pathsHint: 'One directory per line',
  discover: 'Discover configuration', linked: 'View linked items', discovered: 'Discovered configuration', linkedTitle: 'Linked configuration', search: 'Search name, source, or path…',
  allKinds: 'All types', skill: 'Skills', mcp: 'MCP', selectAll: 'Select visible results', clear: 'Clear selection', link: 'Link selected items',
  discoverEmpty: 'No configuration found in the selected sources. Add other directories and try again.', linkedEmpty: 'No linked configuration yet.', noMatches: 'No matching results.',
  working: 'Working…', discovering: 'Discovering configuration…', reading: 'Reading linked items…', stopping: 'Stopping remaining operations…', cancelWait: 'Cancel wait', cancelRemaining: 'Cancel remaining items', cancelled: 'Stopped waiting.',
  linkCount: (count: number) => `Linked ${count} items. Enable each one below when ready.`, partialCount: (count: number) => `Stopped. Kept ${count} linked items.`,
  enabled: 'Enabled', disabled: 'Ready to enable', enable: 'Enable', disable: 'Disable', remove: 'Remove link', confirmRemove: 'Confirm remove link', cancel: 'Cancel', retry: 'Retry',
  enabledNotice: 'Enabled. Reconnect the session to apply.', disabledNotice: 'Disabled. Reconnect the session to apply.', removedNotice: 'Link removed.', reconnect: 'Reconnect session', reconnectHint: 'Changes apply on the next session connection.', reconnected: 'Session reconnected.',
  selected: (count: number) => `${count} selected`, candidateLabel: (name: string) => `Select ${name}`, sourceLabel: (name: string) => `Discover ${name} configuration`,
};

export default function ImportResources(props: Props) { return <ImportPage key={props.cwd} {...props} />; }

function ImportPage({ language, cwd, ensureSession, reconnect }: Props) {
  const t = words(language);
  const [selectedSources, setSelectedSources] = useState(sources.map(source => source.id));
  const [paths, setPaths] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [discovered, setDiscovered] = useState(false);
  const [linked, setLinked] = useState<Candidate[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState(''), [kind, setKind] = useState('all');
  const [working, setWorking] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [stopRequested, setStopRequested] = useState(false), [needsReconnect, setNeedsReconnect] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState('');
  const active = useRef(true), pending = useRef(false), stop = useRef(false), revision = useRef(0);
  const retry = useRef<(() => void) | undefined>(undefined);
  const busy = !!working;
  useEffect(() => { active.current = true; return () => { active.current = false; stop.current = true; revision.current++; }; }, []);

  const perform = async (name: string, action: (sessionId: string, current: () => boolean) => Promise<void>) => {
    if (pending.current) return;
    pending.current = true; stop.current = false;
    const operation = ++revision.current;
    const current = () => active.current && revision.current === operation;
    setWorking(name); setError(''); setNotice(''); setStopRequested(false);
    retry.current = () => { void perform(name, action); };
    try {
      const sessionId = await ensureSession();
      if (current()) await action(sessionId, current);
    } catch (error) { if (current()) setError(localizeError(error instanceof Error ? error.message : String(error), language)); }
    finally { if (current()) { pending.current = false; setWorking(''); setStopRequested(false); } }
  };
  const readLinked = async (sessionId: string, current: () => boolean) => {
    const result = await manage<{ items: Candidate[] }>(sessionId, 'imports', 'list');
    if (current()) {
      setLinked(result.items);
      setCandidates(old => old.map(item => {
        const link = result.items.find(link => link.id === item.id || link.kind === item.kind && link.path === item.path && link.key === item.key);
        return { ...item, linkedPath: link?.linkedPath, enabled: link?.enabled ?? item.enabled };
      }));
    }
  };
  const discover = () => {
    const args = { sources: selectedSources, paths: lineValues(paths) };
    void perform('discover', async (sessionId, current) => {
      const result = await manage<{ items: Candidate[]; message?: string }>(sessionId, 'imports', 'discover', args);
      if (current()) { setCandidates(result.items); setSelected([]); setDiscovered(true); setNotice(result.message ?? ''); }
    });
  };
  const linkSelected = () => {
    const items = candidates.filter(item => selected.includes(item.id) && !item.linkedPath);
    void perform('link', async (sessionId, current) => {
      const completed = new Set<string>();
      let failure: unknown;
      try {
        for (const item of items) {
          if (stop.current || !current()) break;
          await manage(sessionId, 'imports', 'link', { items: [item] });
          completed.add(item.id);
          if (current()) setNotice(`${completed.size} / ${items.length}`);
        }
      } catch (error) { failure = error; }
      if (completed.size && current()) {
        try { await readLinked(sessionId, current); }
        catch (error) { failure ??= error; }
        if (current()) setSelected(old => old.filter(id => !completed.has(id)));
      }
      if (current()) setNotice(stop.current ? t.partialCount(completed.size) : t.linkCount(completed.size));
      if (failure) throw failure;
    });
  };
  const cancel = () => {
    stop.current = true;
    if (working === 'link') { setStopRequested(true); return; }
    revision.current++; pending.current = false; setWorking(''); setNotice(t.cancelled);
  };
  const mutate = (item: Candidate, action: 'enable' | 'disable' | 'remove') => {
    void perform(`${action}:${item.id}`, async (sessionId, current) => {
      await manage(sessionId, 'imports', action, { id: item.id });
      if (!current()) return;
      if (action !== 'remove' || item.enabled) setNeedsReconnect(true);
      setConfirmRemove('');
      setNotice(action === 'enable' ? t.enabledNotice : action === 'disable' ? t.disabledNotice : t.removedNotice);
      await readLinked(sessionId, current);
    });
  };
  const reconnectSession = () => {
    if (!reconnect || pending.current) return;
    pending.current = true; setWorking('reconnect'); setError(''); setNotice('');
    retry.current = reconnectSession;
    void reconnect().then(() => { if (active.current) { setNeedsReconnect(false); setNotice(t.reconnected); } }).catch(error => { if (active.current) setError(localizeError(error instanceof Error ? error.message : String(error), language)); }).finally(() => { pending.current = false; if (active.current) setWorking(''); });
  };
  const matches = (item: Candidate) => (kind === 'all' || item.kind === kind) && `${item.name} ${item.source} ${item.path}`.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  const visible = candidates.filter(matches), visibleLinked = linked?.filter(matches);
  const linkable = visible.filter(item => !item.linkedPath);
  const selectedItems = candidates.filter(item => selected.includes(item.id) && !item.linkedPath);
  const kindOptions = [{ value: 'all', label: t.allKinds }, { value: 'skill', label: t.skill }, { value: 'mcp', label: t.mcp }];
  const workingMessage = stopRequested ? t.stopping : working === 'discover' ? t.discovering : working === 'list' ? t.reading : t.working;

  return <section className="managed-resources import-resources" aria-label={t.title} aria-busy={busy}>
    <header className="managed-header"><div><h2>{t.title}</h2><p>{t.intro}</p></div></header>
    <fieldset className="import-source-list" disabled={busy}><legend>{t.sources}</legend>{sources.map(source => <label key={source.id}><input type="checkbox" aria-label={t.sourceLabel(source.name)} checked={selectedSources.includes(source.id)} onChange={event => setSelectedSources(old => event.target.checked ? [...old, source.id] : old.filter(id => id !== source.id))} /><AgentSourceIcon source={source.id} />{source.id === 'gemini' && <AgentSourceIcon source="antigravity" />}<span><strong>{source.name}</strong><small>{source.paths}</small></span></label>)}</fieldset>
    <details className="managed-detail import-paths"><summary><ChevronDown size={13} />{t.morePaths}</summary><label className="managed-field">{t.pathsHint}<textarea aria-label={t.morePaths} rows={3} disabled={busy} value={paths} placeholder={t.pathsHint} onChange={event => setPaths(event.target.value)} /></label></details>
    <div className="managed-actions import-main-actions"><button type="button" className="secondary-button" disabled={busy || !cwd || !selectedSources.length && !lineValues(paths).length} onClick={discover}><RefreshCw size={14} />{t.discover}</button><button type="button" className="quiet-button" disabled={busy || !cwd} onClick={() => void perform('list', readLinked)}>{t.linked}</button></div>
    {busy && <div className="import-progress" role="status"><span>{workingMessage}{working === 'link' && notice ? ` ${notice}` : ''}</span>{['discover', 'list', 'link'].includes(working) && <button type="button" className="quiet-button" disabled={stopRequested} onClick={cancel}>{working === 'link' ? t.cancelRemaining : t.cancelWait}</button>}</div>}
    {error && <div className="managed-feedback" role="alert"><p>{error}</p><button type="button" className="quiet-button" disabled={busy} onClick={() => retry.current?.()}>{t.retry}</button></div>}
    {!busy && notice && <p className="managed-notice" role="status">{notice}</p>}
    {needsReconnect && <div className="import-reconnect"><p>{t.reconnectHint}</p>{reconnect && <button type="button" className="quiet-button" disabled={busy} onClick={reconnectSession}>{t.reconnect}</button>}</div>}
    {(discovered || linked !== null) && <div className="managed-toolbar"><input type="search" aria-label={t.search} placeholder={t.search} value={query} disabled={busy} onChange={event => setQuery(event.target.value)} /><Select label={t.allKinds} value={kind} onChange={setKind} options={kindOptions} disabled={busy} /></div>}
    {discovered && <section className="import-results" aria-label={t.discovered}><h3>{t.discovered}</h3><div className="managed-actions import-selection-actions"><button type="button" className="secondary-button" disabled={busy || !selectedItems.length} onClick={linkSelected}><Link2 size={14} />{t.link} {selectedItems.length > 0 ? `(${selectedItems.length})` : ''}</button><button type="button" className="quiet-button" disabled={busy || !linkable.length} onClick={() => setSelected(old => [...new Set([...old, ...linkable.map(item => item.id)])])}>{t.selectAll}</button><button type="button" className="quiet-button" disabled={busy || !selected.length} onClick={() => setSelected([])}>{t.clear}</button><span>{t.selected(selectedItems.length)}</span></div>{!visible.length && <p className="managed-empty">{candidates.length ? t.noMatches : t.discoverEmpty}</p>}{visible.map(item => <article key={item.id} className="managed-item import-candidate"><input type="checkbox" aria-label={t.candidateLabel(item.name)} disabled={busy || !!item.linkedPath} checked={selected.includes(item.id)} onChange={event => setSelected(old => event.target.checked ? [...old, item.id] : old.filter(id => id !== item.id))} /><Item item={item} language={language} />{item.linkedPath && <small>{item.enabled ? t.enabled : t.disabled}</small>}</article>)}</section>}
    {linked !== null && <section className="import-results" aria-label={t.linkedTitle}><h3>{t.linkedTitle}</h3>{!visibleLinked?.length && <p className="managed-empty">{linked.length ? t.noMatches : t.linkedEmpty}</p>}{visibleLinked?.map(item => <article className="managed-item" key={item.id}><Item item={item} language={language} /><div className="managed-actions"><span className="import-enabled-state">{item.enabled ? t.enabled : t.disabled}</span><button type="button" className="quiet-button" disabled={busy || !item.enabled && !!item.warning} onClick={() => mutate(item, item.enabled ? 'disable' : 'enable')}>{item.enabled ? t.disable : t.enable}</button>{confirmRemove === item.id ? <span className="managed-confirm"><button type="button" className="quiet-button managed-danger" disabled={busy} onClick={() => mutate(item, 'remove')}>{t.confirmRemove}</button><button type="button" className="quiet-button" disabled={busy} onClick={() => setConfirmRemove('')}>{t.cancel}</button></span> : <button type="button" className="quiet-button" disabled={busy} onClick={() => setConfirmRemove(item.id)}>{t.remove}</button>}</div></article>)}</section>}
  </section>;
}

function Item({ item, language }: { item: Candidate; language: Language }) {
  const t = words(language);
  return <div className="managed-item-title import-item-title"><div className="agent-source-name"><AgentSourceIcon source={item.source} path={item.path} /><strong>{item.name}</strong></div><div className="managed-meta"><span>{item.kind === 'skill' ? t.skill : t.mcp}</span><span>{sources.find(source => source.id === item.source)?.name ?? item.source}</span></div>{item.description && <p>{item.description}</p>}<code className="managed-path">{item.path}</code>{item.warning && <p className="import-warning">{item.warning}</p>}</div>;
}
