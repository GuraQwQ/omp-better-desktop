import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FolderOpen, RefreshCw } from 'lucide-react';
import Select from '../components/Select';
import AgentSourceIcon from '../components/AgentSourceIcon';
import { pickPath } from '../lib/bridge';
import { displayPath } from '../lib/display-path';
import { localizeError } from '../lib/i18n';
import { lineValues, manage } from '../lib/management';
import type { Language } from '../lib/types';
import './managed-resources.css';
import './imports.css';

interface Props { language: Language; cwd: string; ensureSession: () => Promise<string>; reconnect?: () => Promise<void> }
interface Candidate { id: string; name: string; kind: 'skill' | 'mcp'; source: string; path: string; description?: string; key?: string; enabled?: boolean; managedPath?: string; executionDirectory?: string; warning?: string; problem?: string }
interface Result { items: Candidate[]; message?: string; restartRequired?: boolean }
const sources = [
  { id: 'agents', name: '.agent / .agents', paths: '~/.agent/skills / ~/.agents/skills' },
  { id: 'gemini', name: 'Gemini / Antigravity', paths: '~/.gemini / .gemini' },
  { id: 'claude', name: 'Claude', paths: '~/.claude/skills / ~/.claude.json / .mcp.json' },
  { id: 'codex', name: 'Codex', paths: '~/.agents/skills / ~/.codex/config.toml / .codex/config.toml' },
  { id: 'trae', name: 'Trae', paths: '~/.trae/skills / Trae/User/mcp.json / .trae/mcp.json' },
  { id: 'zcode', name: 'ZCode', paths: '~/.zcode/skills / ~/.zcode/cli/config.json / .zcode/config.json' },
  { id: 'ccswitch', name: 'CC Switch', paths: '~/.cc-switch' },
];
const words = (language: Language) => language === 'zh' ? {
  title: '发现与导入', intro: '将技能与 MCP 配置复制到应用中，导入后默认启用。原配置的变化不会影响已导入的副本。',
  imported: '已导入', discover: '发现配置', sources: '选择查找来源', paths: '补充其他目录', pathsHint: '每行一个目录', scan: '开始查找', refresh: '刷新列表',
  search: '搜索名称、来源或路径', all: '全部类型', skill: '技能', mcp: 'MCP', select: '选择当前结果', clear: '清空选择', install: '导入并启用',
  empty: '还没有导入资源。打开“发现配置”，选择需要的技能与 MCP。', noResults: '没有找到配置。可以补充具体目录后重新查找。', noMatches: '没有匹配的资源。',
  checked: (count: number) => `已选择 ${count} 项`, selectionHint: '勾选用于批量导入；已导入资源在独立列表中管理启用状态。', already: '已导入',
  enabled: '已启用', disabled: '已停用', enable: '启用', disable: '停用', update: '更新副本', repair: '重新选择来源', retryMigration: '重试复制', needsRestore: '需要恢复', manual: '自选目录',
  remove: '移除', confirm: '确认移除副本', cancel: '取消', source: '来源', copy: '应用副本', execution: '执行目录', executionHint: '此命令仍使用该目录中已安装的程序和文件。', removing: '移除仅清理应用中的副本。',
  reconnect: '应用到当前会话', reconnectHint: '已保存。MCP 的启用或配置变化需要重新连接会话，当前会话内容会保留。', reconnected: '已应用到当前会话。',
  working: '正在处理…', scanning: '正在查找配置…', importing: '正在复制资源…', stopping: '正在停止剩余项…', stop: '停止剩余项', retry: '重试',
  copied: (count: number) => `已导入 ${count} 项。`, stopped: (count: number) => `已停止，保留已导入的 ${count} 项。`, saved: '状态已保存。', updated: '副本已更新。', removed: '副本已移除。',
  ready: '技能已应用到当前会话；MCP 将在重新连接后可用。', selectItem: (name: string) => `选择导入 ${name}`,
} : {
  title: 'Discover and import', intro: 'Copy skills and MCP configuration into this app. Imports start enabled and stay independent of the original configuration.',
  imported: 'Imported', discover: 'Discover', sources: 'Choose sources to search', paths: 'Add directories', pathsHint: 'One directory per line', scan: 'Find configuration', refresh: 'Refresh list',
  search: 'Search names, sources, or paths', all: 'All types', skill: 'Skill', mcp: 'MCP', select: 'Select visible results', clear: 'Clear selection', install: 'Import and enable',
  empty: 'No resources imported yet. Open Discover to choose skills and MCP configuration.', noResults: 'No configuration found. Add a specific directory and search again.', noMatches: 'No matching resources.',
  checked: (count: number) => `${count} selected`, selectionHint: 'Selection prepares a batch import. Enable or disable imported resources in their own list.', already: 'Imported',
  enabled: 'Enabled', disabled: 'Disabled', enable: 'Enable', disable: 'Disable', update: 'Update copy', repair: 'Choose another source', retryMigration: 'Retry copy', needsRestore: 'Needs recovery', manual: 'Custom directory',
  remove: 'Remove', confirm: 'Remove imported copy', cancel: 'Cancel', source: 'Source', copy: 'App copy', execution: 'Working directory', executionHint: 'This command continues to use programs and files installed in this directory.', removing: 'Only the copy in this app will be removed.',
  reconnect: 'Apply to current session', reconnectHint: 'Saved. Reconnect to apply MCP configuration changes. The current conversation is preserved.', reconnected: 'Applied to the current session.',
  working: 'Working…', scanning: 'Finding configuration…', importing: 'Copying resources…', stopping: 'Stopping remaining items…', stop: 'Stop remaining items', retry: 'Retry',
  copied: (count: number) => `Imported ${count} resources.`, stopped: (count: number) => `Stopped. Kept ${count} imported resources.`, saved: 'State saved.', updated: 'Copy updated.', removed: 'Copy removed.',
  ready: 'Skills are active in this session. MCP changes apply after reconnection.', selectItem: (name: string) => `Select ${name} for import`,
};

export default function ImportResources(props: Props) { return <ImportPage key={props.cwd} {...props} />; }
function ImportPage({ language, cwd, ensureSession, reconnect }: Props) {
  const t = words(language);
  const [view, setView] = useState<'imported' | 'discover'>('imported');
  const [selectedSources, setSelectedSources] = useState(sources.map(source => source.id)), [paths, setPaths] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]), [imported, setImported] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<string[]>([]), [discovered, setDiscovered] = useState(false);
  const [query, setQuery] = useState(''), [kind, setKind] = useState('all');
  const [working, setWorking] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [needsReconnect, setNeedsReconnect] = useState(false), [stopRequested, setStopRequested] = useState(false), [confirmRemove, setConfirmRemove] = useState('');
  const active = useRef(true), pending = useRef(false), stop = useRef(false), retry = useRef<(() => void) | undefined>(undefined);
  const busy = !!working;
  useEffect(() => { active.current = true; void perform('list', async sessionId => { await readImported(sessionId); }); return () => { active.current = false; stop.current = true; }; }, []);

  async function perform(name: string, action: (sessionId: string) => Promise<void>) {
    if (pending.current) return;
    pending.current = true; stop.current = false;
    setWorking(name); setError(''); setNotice(''); setStopRequested(false);
    retry.current = () => { void perform(name, action); };
    try { const id = await ensureSession(); if (active.current) await action(id); }
    catch (value) { if (active.current) setError(localizeError(value instanceof Error ? value.message : String(value), language)); }
    finally { pending.current = false; if (active.current) { setWorking(''); setStopRequested(false); } }
  }
  async function readImported(id: string) {
    const result = await manage<Result>(id, 'imports', 'list');
    if (active.current) setImported(result.items);
  }
  function scan() {
    void perform('discover', async id => {
      const result = await manage<Result>(id, 'imports', 'discover', { sources: selectedSources, paths: lineValues(paths) });
      if (active.current) { setCandidates(result.items); setDiscovered(true); setSelected([]); }
      await readImported(id);
    });
  }
  function install() {
    const chosen = candidates.filter(item => selected.includes(item.id) && !hasCopy(item) && !item.warning);
    void perform('install', async id => {
      let completed = 0;
      try {
        for (const item of chosen) {
          if (stop.current || !active.current) break;
          const result = await manage<Result>(id, 'imports', 'install', { items: [item] });
          completed++;
          if (active.current) { setNeedsReconnect(old => old || !!result.restartRequired); setNotice(`${completed} / ${chosen.length}`); setSelected(old => old.filter(value => value !== item.id)); }
        }
      } finally { await readImported(id); }
      if (active.current) { setView('imported'); setNotice(stop.current ? t.stopped(completed) : t.copied(completed)); }
    });
  }
  function mutate(item: Candidate, action: 'enable' | 'disable' | 'remove' | 'update' | 'repair') {
    void perform(`${action}:${item.id}`, async id => {
      const path = action === 'repair' ? await pickPath(item.kind === 'skill') : undefined;
      if (action === 'repair' && !path) return;
      const result = await manage<Result>(id, 'imports', action, { id: item.id, ...(path ? { path } : {}) });
      if (active.current) { setImported(result.items); setNeedsReconnect(old => old || !!result.restartRequired); setConfirmRemove(''); setNotice(action === 'remove' ? t.removed : action === 'update' || action === 'repair' ? t.updated : t.saved); }
    });
  }
  function apply() {
    if (!reconnect || pending.current) return;
    void perform('reconnect', async () => { await reconnect(); if (active.current) { setNeedsReconnect(false); setNotice(t.reconnected); } });
  }
  const hasCopy = (item: Candidate) => imported.some(saved => saved.id === item.id || saved.kind === item.kind && saved.path === item.path && saved.key === item.key);
  const matches = (item: Candidate) => (kind === 'all' || item.kind === kind) && `${item.name} ${item.source} ${item.path}`.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  const visible = (view === 'imported' ? imported : candidates).filter(matches);
  const available = candidates.filter(item => matches(item) && !hasCopy(item) && !item.warning);
  const selectedCount = candidates.filter(item => selected.includes(item.id) && !hasCopy(item) && !item.warning).length;
  const kindOptions = [{ value: 'all', label: t.all }, { value: 'skill', label: t.skill }, { value: 'mcp', label: t.mcp }];
  const showList = view === 'imported' || discovered;
  const progress = busy && <div className="import-progress" role="status"><span>{stopRequested ? t.stopping : working === 'discover' ? t.scanning : working === 'install' ? `${t.importing} ${notice}` : t.working}</span>{working === 'install' && <button type="button" className="quiet-button" disabled={stopRequested} onClick={() => { stop.current = true; setStopRequested(true); }}>{t.stop}</button>}</div>;

  return <section className="managed-resources import-resources" aria-label={t.title} aria-busy={busy}>
    <header className="managed-header"><div><h2>{t.title}</h2><p>{t.intro}</p></div></header>
    <div className="import-view-switch" role="group" aria-label={t.title}>
      <button type="button" aria-pressed={view === 'imported'} onClick={() => { setView('imported'); setQuery(''); }}>{t.imported}<span>{imported.length}</span></button>
      <button type="button" aria-pressed={view === 'discover'} onClick={() => { setView('discover'); setQuery(''); }}>{t.discover}</button>
    </div>
    {view === 'discover' && <div className="import-discovery-controls">
      <fieldset className="import-source-list" disabled={busy}><legend>{t.sources}</legend>{sources.map(source => <label key={source.id}><input type="checkbox" checked={selectedSources.includes(source.id)} onChange={event => setSelectedSources(old => event.target.checked ? [...old, source.id] : old.filter(id => id !== source.id))} /><AgentSourceIcon source={source.id} /><span><strong>{source.name}</strong><small>{source.paths}</small></span></label>)}</fieldset>
      <details className="managed-detail import-paths"><summary><ChevronDown size={13} />{t.paths}</summary><label className="managed-field">{t.pathsHint}<textarea rows={3} disabled={busy} value={paths} onChange={event => setPaths(event.target.value)} /></label></details>
      <button type="button" className="secondary-button" disabled={busy || !cwd || !selectedSources.length && !lineValues(paths).length} onClick={scan}><RefreshCw size={14} />{t.scan}</button>
    </div>}
    {!showList && progress}
    {error && <div className="managed-feedback" role="alert"><p>{error}</p><button type="button" className="quiet-button" disabled={busy} onClick={() => retry.current?.()}>{t.retry}</button></div>}
    {!busy && notice && <p className="managed-notice" role="status">{notice}</p>}
    {needsReconnect && <div className="import-reconnect"><p>{t.reconnectHint}</p>{reconnect && <button type="button" className="secondary-button" disabled={busy} onClick={apply}>{t.reconnect}</button>}</div>}
    {showList && <>
      {view === 'discover' && <p className="import-selection-hint">{t.selectionHint}</p>}
      <div className="import-list-controls">
        <div className="managed-toolbar import-list-toolbar"><input type="search" aria-label={t.search} placeholder={t.search} value={query} onChange={event => setQuery(event.target.value)} /><Select label={t.all} value={kind} onChange={setKind} options={kindOptions} />{view === 'imported' && <button type="button" className="quiet-button" disabled={busy} onClick={() => void perform('list', readImported)}><RefreshCw size={14} />{t.refresh}</button>}</div>
        {view === 'discover' && <div className="managed-actions import-selection-actions"><button type="button" className="secondary-button" disabled={busy || !selectedCount} onClick={install}><Download size={14} />{t.install}{selectedCount ? ` (${selectedCount})` : ''}</button><button type="button" className="quiet-button" disabled={busy || !available.length} onClick={() => setSelected(old => [...new Set([...old, ...available.map(item => item.id)])])}>{t.select}</button><button type="button" className="quiet-button" disabled={busy || !selected.length} onClick={() => setSelected([])}>{t.clear}</button><span aria-live="polite">{t.checked(selectedCount)}</span></div>}
        {progress}
      </div>
      {!visible.length && !busy && <p className="managed-empty">{query || kind !== 'all' ? t.noMatches : view === 'imported' ? t.empty : t.noResults}</p>}
      <div className="import-resource-list">{visible.map(item => <article key={item.id} className={`managed-item import-resource-row ${view === 'discover' ? 'import-candidate' : ''}`}>
        {view === 'discover' && <input type="checkbox" aria-label={t.selectItem(item.name)} disabled={busy || hasCopy(item) || !!item.warning} checked={selected.includes(item.id)} onChange={event => setSelected(old => event.target.checked ? [...old, item.id] : old.filter(id => id !== item.id))} />}
        <Item item={item} language={language} imported={view === 'imported'} />
        {view === 'discover' ? hasCopy(item) && <span className="import-enabled-state">{t.already}</span> : <div className="import-row-controls">
          <span className={`import-state ${item.problem ? 'has-problem' : item.enabled ? 'is-enabled' : ''}`}>{item.problem ? t.needsRestore : item.enabled ? t.enabled : t.disabled}</span>
          <div className="managed-actions"><button type="button" className="quiet-button" disabled={busy || !item.enabled && !!item.problem} onClick={() => mutate(item, item.enabled ? 'disable' : 'enable')}>{item.enabled ? t.disable : t.enable}</button><button type="button" className="quiet-button" disabled={busy} onClick={() => mutate(item, 'update')}><RefreshCw size={13} />{item.problem ? t.retryMigration : t.update}</button><button type="button" className="quiet-button" disabled={busy} onClick={() => mutate(item, 'repair')}><FolderOpen size={13} />{t.repair}</button><button type="button" className="quiet-button" disabled={busy} onClick={() => setConfirmRemove(item.id)}>{t.remove}</button></div>
          {confirmRemove === item.id && <div className="managed-confirm import-remove-confirm"><p>{t.removing}</p><button type="button" className="quiet-button managed-danger" disabled={busy} onClick={() => mutate(item, 'remove')}>{t.confirm}</button><button type="button" className="quiet-button" disabled={busy} onClick={() => setConfirmRemove('')}>{t.cancel}</button></div>}
        </div>}
      </article>)}</div>
    </>}
  </section>;
}
function Item({ item, language, imported }: { item: Candidate; language: Language; imported: boolean }) {
  const t = words(language);
  return <div className="managed-item-title import-item-title"><div className="agent-source-name"><AgentSourceIcon source={item.source} path={item.path} /><strong>{item.name}</strong><span className="import-kind">{item.kind === 'skill' ? t.skill : t.mcp}</span></div><div className="managed-meta"><span>{sources.find(source => source.id === item.source)?.name ?? (item.source === 'manual' ? t.manual : item.source)}</span></div>{item.description && <p>{item.description}</p>}<details className="import-locations"><summary>{t.source}</summary><code className="managed-path">{displayPath(item.path)}</code>{imported && item.managedPath && <><span>{t.copy}</span><code className="managed-path">{displayPath(item.managedPath)}</code></>}</details>{imported && item.executionDirectory && <p className="import-execution">{t.execution}：<code>{displayPath(item.executionDirectory)}</code><span>{t.executionHint}</span></p>}{(item.problem || item.warning) && <p className="import-warning">{item.problem ?? item.warning}</p>}</div>;
}
