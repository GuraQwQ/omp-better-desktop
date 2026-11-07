import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { FileCode2, GitBranch, GitCommitHorizontal, Plus, RefreshCw, Save, Search, Square, TerminalSquare, Trash2, X } from 'lucide-react';
import { native, request } from '../lib/bridge';
import type { Language } from '../lib/types';
import '@xterm/xterm/css/xterm.css';
import './workspace-tools.css';

type Tab = 'search' | 'git' | 'worktrees' | 'editor' | 'terminals';
type OpenFile = { path: string; line?: number; nonce?: number };
type Props = { cwd: string; language: Language; initialTab?: Tab; onProject?: (path: string) => void; onOpenFile?: (path: string, line?: number) => void; openFile?: OpenFile };
type PanelProps = { cwd: string; language: Language };
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const normalizedPath = (path: string) => path.replace(/^\\\\\?\\/, '').replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
const normalizedText = (text: string) => text.replace(/\r\n/g, '\n');

export default function WorkspaceTools({ cwd, language, initialTab = 'search', onProject, onOpenFile, openFile }: Props) {
  const zh = language === 'zh';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [editorVisited, setEditorVisited] = useState(initialTab === 'editor');
  const [target, setTarget] = useState<OpenFile | undefined>(openFile);
  const open = (path: string, line?: number) => { setTarget({ path, line, nonce: Date.now() }); setEditorVisited(true); setTab('editor'); onOpenFile?.(path, line); };
  useEffect(() => { setTab(initialTab); if (initialTab === 'editor') setEditorVisited(true); }, [initialTab]);
  useEffect(() => { if (openFile) { setTarget(openFile); setEditorVisited(true); setTab('editor'); } }, [openFile?.path, openFile?.line, openFile?.nonce]);
  const tabs = [
    { id: 'search' as const, label: zh ? '搜索' : 'Search', icon: Search },
    { id: 'git' as const, label: 'Git', icon: GitCommitHorizontal },
    { id: 'worktrees' as const, label: zh ? '工作树' : 'Worktrees', icon: GitBranch },
    { id: 'editor' as const, label: zh ? '编辑' : 'Editor', icon: FileCode2 },
    { id: 'terminals' as const, label: zh ? '终端' : 'Terminals', icon: TerminalSquare },
  ];
  return <section className="workspace-tools">
    <nav className="workspace-tool-tabs" aria-label={zh ? '工作区工具' : 'Workspace tools'}>{tabs.map(item => <button key={item.id} className={`quiet-button ${tab === item.id ? 'active' : ''}`} aria-pressed={tab === item.id} onClick={() => { setTab(item.id); if (item.id === 'editor') setEditorVisited(true); }}><item.icon size={14} />{item.label}</button>)}</nav>
    <code className="workspace-tool-path" title={cwd}>{cwd}</code>
    {tab === 'search' && <WorkspaceSearch key={cwd} cwd={cwd} language={language} open={open} />}
    {tab === 'git' && <WorkspaceGit key={cwd} cwd={cwd} language={language} open={open} />}
    {tab === 'worktrees' && <WorkspaceWorktrees key={cwd} cwd={cwd} language={language} onProject={onProject} />}
    {editorVisited && <div className="workspace-tool-content" hidden={tab !== 'editor'}><WorkspaceEditor key={cwd} cwd={cwd} language={language} target={target} /></div>}
    {tab === 'terminals' && <WorkspaceTerminals key={cwd} cwd={cwd} language={language} />}
  </section>;
}

function WorkspaceSearch({ cwd, language, open }: PanelProps & { open: (path: string, line?: number) => void }) {
  const zh = language === 'zh';
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [result, setResult] = useState<{ matches: { path: string; line: number; text: string }[]; truncated: boolean; cancelled: boolean; skipped: number; errors?: string[] }>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const current = useRef('');
  const cancel = () => { if (current.current) void request('workspace.search.cancel', { requestId: current.current }).catch(error => setError(message(error))); };
  useEffect(() => () => { if (current.current) void request('workspace.search.cancel', { requestId: current.current }).catch(() => {}); current.current = ''; }, []);
  const search = async () => {
    if (!query.trim() || busy) return;
    const id = crypto.randomUUID(); current.current = id;
    setBusy(true); setError(''); setResult(undefined);
    try { const next = await request('workspace.search', { cwd, query, caseSensitive, requestId: id }); if (current.current === id) setResult(next); }
    catch (error) { if (current.current === id) setError(message(error)); }
    finally { if (current.current === id) { setBusy(false); current.current = ''; } }
  };
  return <div className="workspace-tool-content"><form className="workspace-tool-form" onSubmit={event => { event.preventDefault(); void search(); }}><input autoFocus aria-label={zh ? '搜索工作区内容' : 'Search workspace contents'} placeholder={zh ? '搜索文件内容…' : 'Search file contents…'} value={query} onChange={event => setQuery(event.target.value)} /><button className="secondary-button" disabled={!query.trim() || busy}><Search size={14} />{zh ? '搜索' : 'Search'}</button>{busy && <button type="button" className="quiet-button" onClick={cancel}><Square size={12} />{zh ? '停止' : 'Stop'}</button>}</form><label className="workspace-tool-check"><input type="checkbox" checked={caseSensitive} onChange={event => setCaseSensitive(event.target.checked)} />{zh ? '区分大小写' : 'Case sensitive'}</label>
    {error && <p className="workspace-tool-error" role="alert">{error}</p>}
    <p className="workspace-tool-hint" aria-live="polite">{busy ? zh ? '正在搜索…' : 'Searching…' : result ? `${result.matches.length} ${zh ? '处匹配' : 'matches'}${result.truncated ? zh ? '，已达到结果上限' : ', result limit reached' : ''}${result.cancelled ? zh ? '，搜索已停止' : ', search stopped' : ''}` : zh ? '搜索遵循项目忽略规则。点击结果打开对应文件。' : 'Search respects project ignore rules. Open a result to edit its file.'}</p>
    {result?.skipped ? <p className="workspace-tool-hint">{zh ? `已跳过 ${result.skipped} 个二进制、非 UTF-8 或超过 2 MiB 的文件。` : `${result.skipped} binary, non UTF-8 or larger than 2 MiB files skipped.`}</p> : null}
    {result?.errors?.length ? <details><summary>{zh ? '未能读取的文件' : 'Unreadable files'} ({result.errors.length})</summary><pre className="workspace-tool-pre">{result.errors.join('\n')}</pre></details> : null}
    <div className="workspace-search-results">{result?.matches.map((match, index) => <button className="workspace-search-result" key={`${match.path}:${match.line}:${index}`} onClick={() => open(match.path, match.line)}><strong title={match.path}>{match.path}<small>:{match.line}</small></strong><code>{match.text}</code></button>)}</div>
  </div>;
}

type GitItem = { path: string; original?: string; status: string; staged: boolean; unstaged: boolean };
function WorkspaceGit({ cwd, language, open }: PanelProps & { open: (path: string) => void }) {
  const zh = language === 'zh';
  const [items, setItems] = useState<GitItem[]>([]);
  const [commit, setCommit] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ path: string; diff: string; staged: boolean }>();
  const revision = useRef(0);
  const previewRevision = useRef(0);
  const run = async (type = 'git.status', fields: Record<string, unknown> = {}) => {
    const current = ++revision.current; setBusy(true); setError(''); setNotice('');
    try {
      const result = await request(type, { cwd, ...fields });
      if (current !== revision.current) return;
      setItems((result.status ?? result).items ?? []);
      if (type === 'git.commit') { setCommit(''); setNotice(result.output); setPreview(undefined); }
      else if (type !== 'git.status') setPreview(undefined);
    } catch (error) { if (current === revision.current) setError(message(error)); }
    finally { if (current === revision.current) setBusy(false); }
  };
  useEffect(() => { void run(); return () => { revision.current++; previewRevision.current++; }; }, [cwd]);
  const show = async (item: GitItem, staged: boolean) => {
    const current = ++previewRevision.current; setError('');
    try {
      const result = item.status === '??' ? { diff: (await request('file.get', { cwd, path: item.path })).content } : await request('git.diff', { cwd, path: item.path, staged });
      if (current === previewRevision.current) setPreview({ path: item.path, staged, diff: result.diff });
    } catch (error) { if (current === previewRevision.current) setError(message(error)); }
  };
  const group = (staged: boolean) => {
    const selected = items.filter(item => staged ? item.staged : item.unstaged);
    const type = staged ? 'git.unstage' : 'git.stage';
    const paths = (list: GitItem[]) => [...new Set(list.flatMap(item => item.original ? [item.path, item.original] : [item.path]))];
    return <section className="workspace-git-group"><header><strong>{staged ? zh ? '已暂存' : 'Staged' : zh ? '工作区改动' : 'Workspace changes'} <small>{selected.length}</small></strong><button className="quiet-button" disabled={busy || !selected.length} onClick={() => void run(type, { paths: paths(selected) })}>{staged ? zh ? '全部取消暂存' : 'Unstage all' : zh ? '全部暂存' : 'Stage all'}</button></header>{selected.map(item => <div className="workspace-git-file" key={item.path}><button title={item.path} onClick={() => void show(item, staged)}><code>{staged ? item.status[0] : item.status[1]}</code><span>{item.path}</span></button><button className="icon-button" aria-label={`${staged ? zh ? '取消暂存' : 'Unstage' : zh ? '暂存' : 'Stage'} ${item.path}`} disabled={busy} onClick={() => void run(type, { paths: paths([item]) })}>{staged ? <X size={14} /> : <Plus size={14} />}</button></div>)}</section>;
  };
  return <div className="workspace-tool-content"><div className="workspace-tool-actions"><button className="quiet-button" disabled={busy} onClick={() => void run()}><RefreshCw size={14} />{zh ? '刷新' : 'Refresh'}</button><span className="workspace-tool-hint" aria-live="polite">{busy ? zh ? '正在处理…' : 'Working…' : zh ? `${items.length} 个改动文件` : `${items.length} changed files`}</span></div>{error && <p className="workspace-tool-error" role="alert">{error}</p>}{notice && <p className="workspace-tool-hint" role="status">{notice}</p>}{group(true)}{group(false)}<form className="workspace-commit" onSubmit={event => { event.preventDefault(); void run('git.commit', { message: commit }); }}><label>{zh ? '提交说明' : 'Commit message'}<textarea value={commit} onChange={event => setCommit(event.target.value)} rows={3} /></label><button className="secondary-button" disabled={busy || !commit.trim() || !items.some(item => item.staged)}><GitCommitHorizontal size={14} />{zh ? '提交已暂存改动' : 'Commit staged changes'}</button></form>{preview && <section className="workspace-git-preview"><header><strong>{preview.path}</strong><button className="quiet-button" onClick={() => open(preview.path)}><FileCode2 size={14} />{zh ? '编辑' : 'Edit'}</button></header><pre className="workspace-tool-pre">{preview.diff || (zh ? '没有文本差异，文件可能已移除或为二进制。' : 'No text diff. The file may be removed or binary.')}</pre></section>}</div>;
}

type Worktree = { path: string; branch?: string; head?: string; detached?: boolean; locked?: boolean };
function WorkspaceWorktrees({ cwd, language, onProject }: PanelProps & Pick<Props, 'onProject'>) {
  const zh = language === 'zh';
  const [items, setItems] = useState<Worktree[]>([]);
  const [path, setPath] = useState(''); const [branch, setBranch] = useState(''); const [ref, setRef] = useState('HEAD');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [remove, setRemove] = useState('');
  const revision = useRef(0);
  const run = async (type = 'worktree.list', fields: Record<string, unknown> = {}) => {
    const current = ++revision.current; setBusy(true); setError('');
    try {
      const result = await request(type, { cwd, ...fields });
      const list = type === 'worktree.add' ? await request<Worktree[]>('worktree.list', { cwd }) : result;
      if (current !== revision.current) return;
      setItems(list); setRemove('');
      if (type === 'worktree.add') { setPath(''); setBranch(''); }
    } catch (error) { if (current === revision.current) setError(message(error)); }
    finally { if (current === revision.current) setBusy(false); }
  };
  useEffect(() => { void run(); return () => { revision.current++; }; }, [cwd]);
  return <div className="workspace-tool-content"><div className="workspace-tool-actions"><button className="quiet-button" disabled={busy} onClick={() => void run()}><RefreshCw size={14} />{zh ? '刷新工作树' : 'Refresh worktrees'}</button></div>{error && <p className="workspace-tool-error" role="alert">{error}</p>}<div className="workspace-worktrees">{items.map((item, index) => <article key={item.path}><strong>{item.branch || (zh ? '分离 HEAD' : 'Detached HEAD')}</strong><code>{item.path}</code><div className="workspace-tool-actions"><button className="quiet-button" disabled={!onProject || normalizedPath(item.path) === normalizedPath(cwd)} onClick={() => onProject?.(item.path)}>{zh ? '打开项目' : 'Open project'}</button>{index > 0 && <button className="quiet-button" disabled={busy || item.locked || normalizedPath(item.path) === normalizedPath(cwd)} onClick={() => setRemove(item.path)}><Trash2 size={13} />{zh ? '移除' : 'Remove'}</button>}</div>{remove === item.path && <div className="workspace-tool-confirm"><p>{zh ? '移除这个工作树目录？Git 历史和分支会保留。' : 'Remove this worktree directory? Git history and branches remain.'}</p><button className="secondary-button" disabled={busy} onClick={() => void run('worktree.remove', { path: item.path })}>{zh ? '移除工作树' : 'Remove worktree'}</button><button className="quiet-button" onClick={() => setRemove('')}>{zh ? '取消' : 'Cancel'}</button></div>}</article>)}</div><form className="workspace-worktree-form" onSubmit={event => { event.preventDefault(); void run('worktree.add', { path, branch, ref }); }}><strong>{zh ? '创建独立工作树' : 'Create an independent worktree'}</strong><label>{zh ? '新目录完整路径' : 'New directory absolute path'}<input value={path} onChange={event => setPath(event.target.value)} placeholder="D:\projects\task-worktree" required /></label><label>{zh ? '新分支名称（可选）' : 'New branch name (optional)'}<input value={branch} onChange={event => setBranch(event.target.value)} /></label><label>{zh ? '起始 Git 引用' : 'Starting Git ref'}<input value={ref} onChange={event => setRef(event.target.value)} placeholder="HEAD" /></label><button className="secondary-button" disabled={busy || !path.trim()}><Plus size={14} />{zh ? '创建工作树' : 'Create worktree'}</button></form></div>;
}

type Document = { path: string; content: string; saved: string; revision: string; encoding: string; newline: string };
const editorCache = new Map<string, { documents: Document[]; active: string }>();
function WorkspaceEditor({ cwd, language, target }: PanelProps & { target?: OpenFile }) {
  const zh = language === 'zh';
  const cacheKey = normalizedPath(cwd);
  const cached = editorCache.get(cacheKey);
  const [documents, setDocuments] = useState<Document[]>(cached?.documents ?? []);
  const [active, setActive] = useState(cached?.active ?? '');
  const [files, setFiles] = useState<string[]>([]); const [filter, setFilter] = useState('');
  const [error, setError] = useState(''); const [saving, setSaving] = useState(''); const [reloading, setReloading] = useState(''); const [confirm, setConfirm] = useState<{ path: string; action: 'close' | 'reload' }>();
  const [location, setLocation] = useState<{ path: string; line: number }>();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const liveDocuments = useRef(documents); liveDocuments.current = documents;
  const mounted = useRef(true);
  const opening = useRef(new Set<string>());
  const savingPath = useRef('');
  const document = documents.find(document => document.path === active);
  useEffect(() => { editorCache.set(cacheKey, { documents, active }); }, [cacheKey, documents, active]);
  useEffect(() => {
    mounted.current = true;
    request<string[]>('workspace.files', { cwd }).then(files => { if (mounted.current) setFiles(files); }).catch(error => { if (mounted.current) setError(message(error)); });
    const beforeUnload = (event: BeforeUnloadEvent) => { if (liveDocuments.current.some(document => document.content !== document.saved)) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { mounted.current = false; window.removeEventListener('beforeunload', beforeUnload); };
  }, [cwd]);
  const open = async (path: string, line = 1) => {
    if (opening.current.has(path)) return;
    setError('');
    try {
      if (!liveDocuments.current.some(document => document.path === path)) {
        opening.current.add(path);
        const result = await request('file.get', { cwd, path });
        if (!mounted.current) return;
        const content = normalizedText(result.content);
        setDocuments(documents => documents.some(document => document.path === path) ? documents : [...documents, { ...result, path, content, saved: content }]);
      }
      if (mounted.current) { setActive(path); setLocation({ path, line }); }
    } catch (error) { if (mounted.current) setError(message(error)); }
    finally { opening.current.delete(path); }
  };
  useEffect(() => { if (target) void open(target.path, target.line); }, [target?.path, target?.line, target?.nonce]);
  useEffect(() => {
    if (!textarea.current || location?.path !== active || !document) return;
    const lines = document.content.split('\n');
    const line = Math.max(1, Math.min(location.line, lines.length));
    const offset = lines.slice(0, line - 1).reduce((length, value) => length + value.length + 1, 0);
    textarea.current.focus(); textarea.current.setSelectionRange(offset, offset + lines[line - 1].length);
    const lineHeight = parseFloat(getComputedStyle(textarea.current).lineHeight) || 20;
    textarea.current.scrollTop = Math.max(0, (line - 3) * lineHeight);
    setLocation(undefined);
  }, [location, active, documents.length]);
  const save = async (path = active) => {
    const snapshot = liveDocuments.current.find(document => document.path === path);
    if (!snapshot || savingPath.current) return false;
    savingPath.current = path;
    setSaving(path); setError('');
    try {
      const result = await request('file.save', { cwd, path, content: snapshot.content, baseRevision: snapshot.revision });
      const content = normalizedText(result.content);
      const next = liveDocuments.current.map(document => document.path === path ? { ...document, revision: result.revision, saved: content, content: document.content === snapshot.content ? content : document.content, encoding: result.encoding, newline: result.newline } : document);
      liveDocuments.current = next;
      editorCache.set(cacheKey, { documents: next, active: path });
      if (mounted.current) setDocuments(next);
      return next.find(document => document.path === path)?.content === content;
    } catch (error) { if (mounted.current) setError(message(error)); return false; }
    finally { savingPath.current = ''; if (mounted.current) setSaving(''); }
  };
  const close = (path: string) => {
    const remaining = liveDocuments.current.filter(document => document.path !== path);
    liveDocuments.current = remaining; setDocuments(remaining); setActive(current => current === path ? remaining.at(-1)?.path ?? '' : current); setConfirm(undefined);
  };
  const reload = async (path: string) => {
    setError(''); setReloading(path);
    const snapshot = liveDocuments.current.find(document => document.path === path)?.content;
    try {
      const result = await request('file.get', { cwd, path });
      if (!mounted.current) return;
      const content = normalizedText(result.content);
      if (liveDocuments.current.find(document => document.path === path)?.content !== snapshot) { setConfirm({ path, action: 'reload' }); return; }
      setDocuments(documents => documents.map(document => document.path === path ? { ...result, path, content, saved: content } : document)); setConfirm(undefined);
    } catch (error) { if (mounted.current) setError(message(error)); }
    finally { if (mounted.current) setReloading(''); }
  };
  const change = (content: string) => { const next = liveDocuments.current.map(document => document.path === active ? { ...document, content } : document); liveDocuments.current = next; setDocuments(next); };
  const requestAction = (path: string, action: 'close' | 'reload') => {
    const document = liveDocuments.current.find(document => document.path === path);
    if (document && document.content !== document.saved) setConfirm({ path, action });
    else if (action === 'close') close(path); else void reload(path);
  };
  const visible = files.filter(path => path.toLowerCase().includes(filter.toLowerCase()));
  return <div className="workspace-editor" onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); event.stopPropagation(); void save(); } }}><div className="workspace-tool-form"><input aria-label={zh ? '查找文件名' : 'Find file names'} placeholder={zh ? '查找并打开文件…' : 'Find and open a file…'} value={filter} onChange={event => setFilter(event.target.value)} /></div>{(filter || !documents.length) && <div className="workspace-editor-files">{visible.slice(0, 150).map(path => <button title={path} key={path} onClick={() => { void open(path); setFilter(''); }}><FileCode2 size={13} /><span>{path}</span></button>)}{visible.length > 150 && <p className="workspace-tool-hint">{zh ? '输入文件名缩小结果范围。' : 'Enter a file name to narrow the results.'}</p>}</div>}
    <div className="workspace-document-tabs">{documents.map(document => <div key={document.path} className={active === document.path ? 'active' : ''}><button title={document.path} onClick={() => setActive(document.path)}>{document.content !== document.saved && <span aria-label={zh ? '未保存' : 'Unsaved'}>●</span>}{document.path.split(/[\\/]/).at(-1)}</button><button className="icon-button" aria-label={`${zh ? '关闭' : 'Close'} ${document.path}`} disabled={saving === document.path} onClick={() => requestAction(document.path, 'close')}><X size={12} /></button></div>)}</div>
    {error && <p className="workspace-tool-error" role="alert">{error}</p>}{confirm && <div className="workspace-tool-confirm"><p>{zh ? `${confirm.path} 有未保存修改。` : `${confirm.path} has unsaved changes.`}</p>{confirm.action === 'close' && <button className="secondary-button" disabled={!!saving} onClick={() => { void save(confirm.path).then(saved => { if (saved) close(confirm.path); }); }}>{zh ? '保存并关闭' : 'Save and close'}</button>}<button className="quiet-button" disabled={!!saving} onClick={() => { if (confirm.action === 'close') close(confirm.path); else void reload(confirm.path); }}>{confirm.action === 'close' ? zh ? '放弃修改并关闭' : 'Discard and close' : zh ? '重载文件' : 'Reload file'}</button><button className="quiet-button" onClick={() => setConfirm(undefined)}>{zh ? '取消' : 'Cancel'}</button></div>}
    {document && <><div className="workspace-editor-toolbar"><code title={document.path}>{document.path}</code><button className="quiet-button" disabled={!!saving || document.content === document.saved} onClick={() => void save()}><Save size={14} />{saving === active ? zh ? '保存中…' : 'Saving…' : zh ? '保存' : 'Save'}</button><button className="icon-button" aria-label={zh ? '重载文件' : 'Reload file'} disabled={!!saving} onClick={() => requestAction(active, 'reload')}><RefreshCw size={14} /></button></div><textarea ref={textarea} className="workspace-editor-text" disabled={reloading === active} aria-label={document.path} value={document.content} onChange={event => change(event.target.value)} spellCheck={false} wrap="off" onKeyDown={event => { if (event.key === 'Tab') { event.preventDefault(); const input = event.currentTarget; const start = input.selectionStart; const end = input.selectionEnd; change(document.content.slice(0, start) + '  ' + document.content.slice(end)); requestAnimationFrame(() => input.setSelectionRange(start + 2, start + 2)); } }} /><p className="workspace-tool-hint">{document.encoding.toUpperCase()} · {document.newline.toUpperCase()} · {document.content.split('\n').length} {zh ? '行' : 'lines'} · Ctrl+S</p></>}
  </div>;
}

type Shell = { id: string; name: string; cwd: string; running: boolean };
type ShellEvent = { id: string; type: 'data' | 'exit'; seq: number; data?: string };
function WorkspaceTerminals({ cwd, language }: PanelProps) {
  const zh = language === 'zh';
  const [shells, setShells] = useState<Shell[]>([]); const [active, setActive] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [name, setName] = useState('');
  const mounted = useRef(true);
  const load = async () => { const next = await request<Shell[]>('shell.list', { cwd }); if (mounted.current) { setShells(next); setActive(active => next.some(shell => shell.id === active) ? active : next[0]?.id ?? ''); } };
  useEffect(() => { mounted.current = true; void load().catch(error => { if (mounted.current) setError(message(error)); }); return () => { mounted.current = false; }; }, [cwd]);
  const act = async (type: string, fields: Record<string, unknown>) => {
    setBusy(true); setError('');
    try { const next = await request(type, { cwd, ...fields }); await load(); if (mounted.current && type === 'shell.open') { setActive(next.id); setName(''); } }
    catch (error) { if (mounted.current) setError(message(error)); }
    finally { if (mounted.current) setBusy(false); }
  };
  const selected = shells.find(shell => shell.id === active);
  return <div className="workspace-tool-content workspace-terminals"><div className="workspace-tool-form"><input aria-label={zh ? '终端名称' : 'Terminal name'} placeholder={zh ? '终端名称（可选）' : 'Terminal name (optional)'} value={name} onChange={event => setName(event.target.value)} /><button className="secondary-button" disabled={busy} onClick={() => void act('shell.open', { name: name.trim() || `${zh ? '终端' : 'Terminal'} ${shells.length + 1}` })}><Plus size={14} />{zh ? '新建' : 'New'}</button>{selected && name.trim() && <button className="quiet-button" disabled={busy} onClick={() => void act('shell.rename', { id: active, name: name.trim() })}>{zh ? '重命名' : 'Rename'}</button>}</div><div className="workspace-document-tabs">{shells.map(shell => <div key={shell.id} className={active === shell.id ? 'active' : ''}><button onClick={() => setActive(shell.id)}>{shell.name}{!shell.running && <small>{zh ? '已退出' : 'Exited'}</small>}</button><button className="icon-button" disabled={busy} aria-label={`${zh ? '关闭' : 'Close'} ${shell.name}`} onClick={() => void act('shell.close', { id: shell.id })}><X size={12} /></button></div>)}</div>{error && <p className="workspace-tool-error" role="alert">{error}</p>}{active ? <ShellView key={active} id={active} onError={error => setError(message(error))} onExit={() => setShells(shells => shells.map(shell => shell.id === active ? { ...shell, running: false } : shell))} /> : <p className="workspace-tool-hint">{zh ? '新建终端，在当前项目目录运行命令。' : 'Create a terminal to run commands in this project.'}</p>}</div>;
}

function ShellView({ id, onError, onExit }: { id: string; onError: (error: unknown) => void; onExit: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onError, onExit }); callbacks.current = { onError, onExit };
  useEffect(() => {
    let disposed = false; let terminal: import('@xterm/xterm').Terminal | undefined; let unsubscribe: (() => void) | undefined; let observer: ResizeObserver | undefined; let themeObserver: MutationObserver | undefined; let ready = false; let seq = -1;
    const pending: ShellEvent[] = [];
    const apply = (event: ShellEvent) => { if (event.type === 'exit') { callbacks.current.onExit(); return; } if (event.seq > seq) { terminal?.write(event.data ?? ''); seq = event.seq; } };
    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]);
      if (disposed || !container.current) return;
      const theme = () => { const styles = getComputedStyle(document.documentElement); return { background: styles.getPropertyValue('--surface').trim(), foreground: styles.getPropertyValue('--text').trim(), cursor: styles.getPropertyValue('--accent').trim(), selectionBackground: styles.getPropertyValue('--selection').trim() }; };
      terminal = new Terminal({ fontFamily: 'Cascadia Code, Consolas, monospace', fontSize: 13, cursorBlink: true, scrollback: 3000, theme: theme() });
      const fit = new FitAddon(); terminal.loadAddon(fit); terminal.open(container.current); fit.fit();
      if (native) unsubscribe = await listen<ShellEvent>('desktop-shell', ({ payload }) => { if (disposed || payload.id !== id) return; if (!ready) pending.push(payload); else apply(payload); });
      if (disposed) { unsubscribe?.(); return; }
      terminal.onData(data => { void request('shell.write', { id, data }).catch(error => callbacks.current.onError(error)); });
      const snapshot = await request<{ data: string; seq: number; running: boolean }>('shell.read', { id });
      if (disposed) return;
      terminal.write(snapshot.data); seq = snapshot.seq; ready = true;
      pending.forEach(apply); pending.length = 0;
      if (!snapshot.running) callbacks.current.onExit();
      let previousSize = '';
      const resize = () => { if (!terminal || disposed) return; fit.fit(); const size = `${terminal.cols}:${terminal.rows}`; if (size === previousSize) return; previousSize = size; void request('shell.resize', { id, cols: terminal.cols, rows: terminal.rows }).catch(error => callbacks.current.onError(error)); };
      observer = new ResizeObserver(resize); observer.observe(container.current); resize();
      themeObserver = new MutationObserver(() => { if (terminal) terminal.options.theme = theme(); }); themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); terminal.focus();
    })().catch(error => { if (!disposed) callbacks.current.onError(error); });
    return () => { disposed = true; unsubscribe?.(); observer?.disconnect(); themeObserver?.disconnect(); terminal?.dispose(); };
  }, [id]);
  return <div className="workspace-shell" ref={container} />;
}
