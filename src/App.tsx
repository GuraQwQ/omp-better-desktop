import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowUpRight, Bell, ChevronDown, ChevronRight, CircleHelp, Command, FileDiff, Folder, FolderOpen, GitBranch, Layers, LoaderCircle, MessageSquare, PanelLeftClose, PanelLeftOpen, Plus, Settings2, Square, TerminalSquare, X } from 'lucide-react';
import { copy } from './lib/i18n';
import { native, onDesktopEvent, pickPath, request, rpc } from './lib/bridge';
import { applyEvent, normalizeMessage } from './lib/session-state';
import type { Bootstrap, CatalogEntry, Json, Project, SessionSummary, SessionView } from './lib/types';
import type { InspectorTab } from './panels/Inspector';
import Transcript from './components/Transcript';
import Question from './components/Question';

const Settings = lazy(() => import('./panels/Settings'));
const Inspector = lazy(() => import('./panels/Inspector'));
const TerminalPanel = lazy(() => import('./panels/Terminal'));
const CommandPalette = lazy(() => import('./components/CommandPalette'));

const initial: Bootstrap = { dataRoot: '', runtime: null, projects: [], preferences: { language: navigator.language.startsWith('zh') ? 'zh' : 'en', theme: 'system' } };

export default function App() {
  const [bootstrap, setBootstrap] = useState(initial);
  const [project, setProject] = useState<Project | null>(null);
  const [history, setHistory] = useState<SessionSummary[]>([]);
  const [sessions, setSessions] = useState<Record<string, SessionView>>({});
  const [activeId, setActiveId] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('general');
  const [settingsQuery, setSettingsQuery] = useState('');
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const [inspector, setInspector] = useState<InspectorTab | null>(null);
  const [terminalId, setTerminalId] = useState('');
  const [models, setModels] = useState<Json[]>([]);
  const [modelPicker, setModelPicker] = useState(false);
  const [modelQuery, setModelQuery] = useState('');
  const [sending, setSending] = useState(false);
  const [delivery, setDelivery] = useState('steer');
  const [images, setImages] = useState<{ type: 'image'; data: string; mimeType: string; name: string }[]>([]);
  const [booting, setBooting] = useState(true);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const sessionsRef = useRef(sessions);
  const activeIdRef = useRef(activeId);
  const drafts = useRef<Record<string, string>>({});
  const eventQueue = useRef<{ sessionId: string; event: Json }[]>([]);
  const frame = useRef(0);
  const t = copy(bootstrap.preferences.language);
  const session = sessions[activeId];
  const cwd = session?.cwd ?? project?.path ?? '';
  const busy = !!session?.state.isStreaming || session?.status === 'running';
  const pending = Object.values(sessions).flatMap(s => s.pending.map(question => ({ sessionId: s.id, title: s.title, question })));
  const showError = useCallback((value: unknown) => setError(value instanceof Error ? value.message : String(value)), []);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
  useEffect(() => { activeIdRef.current = activeId; setDraft(drafts.current[activeId] ?? sessionsRef.current[activeId]?.draft ?? ''); }, [activeId]);
  useEffect(() => { drafts.current[activeId] = draft; }, [draft, activeId]);
  useEffect(() => {
    request<Bootstrap>('bootstrap').then(value => { setBootstrap(value); if (value.projects.length) setProject(value.projects[0]); }).catch(showError).finally(() => setBooting(false));
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void onDesktopEvent(payload => {
      if (payload.event.type === 'extension_ui_request' && payload.event.method === 'set_editor_text') { drafts.current[payload.sessionId] = payload.event.text ?? ''; if (payload.sessionId === activeIdRef.current) setDraft(payload.event.text ?? ''); }
      if (payload.event.type === 'extension_error' || payload.event.type === 'notice' && payload.event.level === 'error') showError(payload.event.error ?? payload.event.message);
      if (['session_settled', 'prompt_result', 'config_update', 'session_info_update'].includes(payload.event.type)) {
        void rpc(payload.sessionId, 'get_state').then(state => setSessions(old => old[payload.sessionId] ? ({ ...old, [payload.sessionId]: { ...old[payload.sessionId], state, path: state.sessionFile ?? old[payload.sessionId].path } }) : old)).catch(showError);
      }
      eventQueue.current.push(payload);
      if (!frame.current) frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        const events = eventQueue.current.splice(0);
        setSessions(previous => {
          const updated = { ...previous };
          for (const { sessionId, event } of events) if (updated[sessionId]) updated[sessionId] = applyEvent(updated[sessionId], event);
          return updated;
        });
      });
    }).then(stop => { if (disposed) stop(); else unlisten = stop; });
    return () => { disposed = true; unlisten?.(); cancelAnimationFrame(frame.current); frame.current = 0; };
  }, [showError]);
  useEffect(() => {
    const theme = bootstrap.preferences.theme;
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.dataset.theme = theme === 'system' ? media.matches ? 'dark' : 'light' : theme; document.documentElement.lang = bootstrap.preferences.language === 'zh' ? 'zh-CN' : 'en'; };
    apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply);
  }, [bootstrap.preferences]);
  useEffect(() => { if (project) request<SessionSummary[]>('session.list', { cwd: project.path }).then(setHistory).catch(showError); }, [project, activeId]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setCommandsOpen(value => !value); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') { event.preventDefault(); setActiveId(''); setDraft(''); setSettingsOpen(false); }
      if ((event.ctrlKey || event.metaKey) && event.key === ',') { event.preventDefault(); setSettingsTab('general'); setSettingsOpen(value => !value); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') { event.preventDefault(); setSidebar(value => !value); }
      if (event.key === 'Escape') setModelPicker(false);
    };
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  }, []);
  useEffect(() => { if (textarea.current) { textarea.current.style.height = 'auto'; textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 180)}px`; } }, [draft]);

  const addProject = async () => { try { const path = await pickPath(); if (!path) return; const projects = await request<Project[]>('project.add', { path }); setBootstrap(old => ({ ...old, projects })); setProject(projects.find(p => p.path === path) ?? projects.at(-1)!); setActiveId(''); setSettingsOpen(false); } catch (e) { showError(e); } };
  const openSession = async (): Promise<SessionView> => {
    if (session && !session.historyOnly) return session;
    if (!cwd) throw Error(t.selectProject);
    const opened = await request<Json>('session.open', { cwd, path: session?.path });
    const value: SessionView = { id: opened.id, cwd, path: opened.path ?? session?.path, title: session?.title ?? t.newTitle, messages: session?.messages ?? [], nextCursor: session?.nextCursor, state: opened.state ?? {}, status: 'ready', pending: [] };
    setSessions(old => ({ ...old, [value.id]: value })); setActiveId(value.id);
    await rpc(value.id, 'set_ask_dialog', { enabled: true });
    await rpc(value.id, 'set_event_filter', { events: null, messageUpdates: 'delta' });
    await rpc(value.id, 'set_subagent_subscription', { level: 'progress' });
    return value;
  };
  const openSettings = async (tab = 'general', query = '') => {
    setSettingsTab(tab); setSettingsQuery(query); setSettingsOpen(true);
    if (cwd && bootstrap.runtime && (!session || session.historyOnly)) { try { await openSession(); } catch (error) { showError(error); } }
  };
  const closeSession = async () => {
    if (!session) return;
    try { if (!session.historyOnly) await request('session.close', { id: session.id }); setSessions(old => { const next = { ...old }; delete next[session.id]; return next; }); setActiveId(''); } catch (error) { showError(error); }
  };
  const loadHistory = async (summary: SessionSummary) => {
    const existing = Object.values(sessions).find(s => s.path === summary.path);
    if (existing) { setActiveId(existing.id); setSettingsOpen(false); return; }
    try {
      const result = await request<Json>('session.history', { path: summary.path, limit: 100 });
      const id = `history:${summary.path}`;
      setSessions(old => ({ ...old, [id]: { id, cwd: summary.cwd, path: summary.path, title: summary.title ?? t.newTitle, messages: result.messages.map((message: Json, i: number) => normalizeMessage(message, `history-${i}`)), state: {}, pending: [], status: 'ready', historyOnly: true, nextCursor: result.nextCursor } }));
      setActiveId(id); setSettingsOpen(false);
    } catch (e) { showError(e); }
  };
  const send = async (text = draft) => {
    if ((!text.trim() && !images.length) || sending) return;
    setSending(true); setError('');
    try {
      const current = await openSession();
      const command = current.state.isStreaming ? delivery === 'follow_up' ? 'follow_up' : 'steer' : 'prompt';
      await rpc(current.id, command, { message: text, ...(images.length ? { images: images.map(({ name: _, ...image }) => image) } : {}) });
      setDraft(''); setImages([]);
      if (current.title === t.newTitle && !text.startsWith('/')) { const title = text.replace(/\s+/g, ' ').slice(0, 70); setSessions(old => ({ ...old, [current.id]: { ...old[current.id], title } })); void rpc(current.id, 'set_session_name', { name: title }).catch(showError); }
    } catch (e) { showError(e); } finally { setSending(false); }
  };
  const toggleModels = async () => {
    setModelPicker(value => !value);
    try { const current = await openSession(); const result = await rpc(current.id, 'get_available_models'); setModels(result.models ?? result); } catch (e) { showError(e); }
  };
  const chooseModel = async (model: Json) => {
    try { const current = await openSession(); const result = await rpc(current.id, 'set_model', { provider: model.provider, modelId: model.id }); setSessions(old => ({ ...old, [current.id]: { ...old[current.id], state: { ...old[current.id].state, model: result.model ?? result ?? model } } })); setModelPicker(false); } catch (e) { showError(e); }
  };
  const answer = async (id: string, response: Json) => {
    const question = sessions[id]?.pending.find(p => p.id === response.id);
    if (question?.method !== 'open_url') await request('session.ui', { id, response });
    setSessions(old => ({ ...old, [id]: { ...old[id], pending: old[id].pending.filter(p => p.id !== response.id) } }));
  };
  const prepareCommand = (text: string) => { setDraft(text); setSettingsOpen(false); textarea.current?.focus(); };
  const refreshSession = async (id: string, replaceMessages = false) => {
    const state = await rpc(id, 'get_state');
    const history = replaceMessages ? await rpc(id, 'get_messages_page', { limit: 100 }) : undefined;
    setSessions(old => old[id] ? ({ ...old, [id]: { ...old[id], state, title: state.sessionName ?? old[id].title, path: state.sessionFile ?? old[id].path, ...(history ? { messages: history.messages.map((message: Json, i: number) => normalizeMessage(message, `reload-${i}`)), nextCursor: history.nextCursor } : {}) } }) : old);
  };
  const navigateCommand = (entry: CatalogEntry): boolean => {
    const run = (action: (current: SessionView) => Promise<void>) => { void openSession().then(action).catch(showError); };
    if (entry.kind === 'slash') {
      if (['new', 'fresh', 'clear'].includes(entry.name)) { run(async current => { await rpc(current.id, 'new_session'); await refreshSession(current.id, true); }); return true; }
      if (['quit', 'exit'].includes(entry.name)) { void closeSession(); return true; }
      if (entry.name === 'restart') { run(async current => { await request('session.close', { id: current.id }); const opened = await request<Json>('session.open', { cwd: current.cwd, path: current.path }); setSessions(old => { const next: Record<string, SessionView> = { ...old, [opened.id]: { ...current, id: opened.id, state: opened.state, status: 'ready' } }; delete next[current.id]; return next; }); setActiveId(opened.id); }); return true; }
      if (entry.name === 'copy') { run(async current => { const result = await rpc(current.id, 'get_last_assistant_text'); await navigator.clipboard.writeText(typeof result === 'string' ? result : result.text ?? ''); }); return true; }
      if (entry.name === 'open') { setInspector('files'); return true; }
      if (['plan', 'vibe', 'loop'].includes(entry.name)) { void openSettings('omp', `${entry.name}.`); return true; }
      if (entry.name === 'hotkeys') { setDraft('Ctrl K · Commands\nCtrl N · New conversation\nCtrl , · Settings\nCtrl B · Sidebar\nEnter · Send\nShift Enter · New line'); return true; }
    }
    const surface = entry.surface;
    if (surface === 'settings' || surface === 'providers') { void openSettings(surface === 'settings' ? 'omp' : 'providers'); return true; }
    if (surface === 'models') { void toggleModels(); return true; }
    const panels: Record<string, InspectorTab> = { context: 'context', usage: 'context', diff: 'review', agents: 'agents', jobs: 'tasks', tree: 'tree', tools: 'context' };
    if (surface && panels[surface]) { setSettingsOpen(false); setInspector(panels[surface]); return true; }
    if (surface === 'sessions') { setSettingsOpen(false); setSidebar(true); return true; }
    if (surface === 'terminal' || entry.rpc === false && entry.kind === 'slash') {
      void openSession().then(current => setTerminalId(current.id)).catch(showError); return true;
    }
    return false;
  };
  const earlier = async () => {
    if (!session?.path || !session.nextCursor) return;
    try { const result = await request<Json>('session.history', { path: session.path, cursor: session.nextCursor, limit: 100 }); setSessions(old => ({ ...old, [session.id]: { ...old[session.id], messages: [...result.messages.map((message: Json, i: number) => normalizeMessage(message, `history-${session.nextCursor}-${i}`)), ...old[session.id].messages], nextCursor: result.nextCursor } })); } catch (e) { showError(e); }
  };
  const activeQuestion = session?.pending[0];
  const liveSessions = Object.values(sessions).filter(s => !s.historyOnly && s.cwd === project?.path);
  return <div className={`app-shell ${sidebar ? '' : 'sidebar-hidden'}`}>
    {sidebar && <aside className="sidebar"><div className="brand-row"><div className="brand-mark">o<span>m</span>p</div><span>Desktop</span><button className="icon-button" title={t.collapse} onClick={() => setSidebar(false)}><PanelLeftClose size={17} /></button></div>
      <button className="new-conversation" onClick={() => { setActiveId(''); setDraft(''); setSettingsOpen(false); }}><Plus size={17} /><span>{t.newSession}</span><kbd>Ctrl N</kbd></button>
      <button className="nav-item" onClick={() => setCommandsOpen(true)}><Command size={16} /><span>{t.commands}</span><kbd>Ctrl K</kbd></button>
      {pending.length > 0 && <button className="nav-item pending-nav" onClick={() => { setActiveId(pending[0].sessionId); setSettingsOpen(false); }}><Bell size={16} /><span>{t.pending}</span><b>{pending.length}</b></button>}
      <div className="section-label"><span>{t.projects}</span><button className="icon-button" title={t.addProject} onClick={addProject}><Plus size={15} /></button></div>
      <div className="project-list">{bootstrap.projects.length ? bootstrap.projects.map(item => <div key={item.path}><button className={`project-item ${project?.path === item.path ? 'selected' : ''}`} title={item.path} onClick={() => { setProject(item); setActiveId(''); setSettingsOpen(false); }}><ChevronRight size={13} className={project?.path === item.path ? 'rotate' : ''} /><Folder size={15} /><span>{item.name}</span></button>{project?.path === item.path && <div className="session-list">{liveSessions.map(item => <button className={`session-item ${activeId === item.id ? 'active' : ''}`} key={item.id} onClick={() => { setActiveId(item.id); setSettingsOpen(false); }}><span className={`session-status ${item.status}`} /><span>{item.title}</span>{item.pending.length > 0 && <i />}</button>)}{history.filter(item => !liveSessions.some(s => s.path === item.path)).map(item => <button className={`session-item ${session?.path === item.path ? 'active' : ''}`} key={item.path} onClick={() => loadHistory(item)}><MessageSquare size={12} /><span>{item.title || t.newTitle}</span></button>)}{!history.length && !liveSessions.length && <p>{t.noSessions}</p>}</div>}</div>) : <p className="sidebar-empty">{t.noProjects}</p>}</div>
      <div className="sidebar-bottom"><button className={`nav-item ${settingsOpen ? 'selected' : ''}`} onClick={() => settingsOpen ? setSettingsOpen(false) : openSettings('general')}><Settings2 size={16} /><span>{t.settings}</span></button><div className="runtime-pill"><span className={`status-dot ${bootstrap.runtime ? 'connected' : ''}`} /><span>{bootstrap.runtime ? `OMP ${bootstrap.runtime.version}` : t.notInstalled}</span><span className="version">v0.1</span></div></div>
    </aside>}
    <main className="main-area">
      {settingsOpen ? <Suspense fallback={<div className="page-loading">{t.loading}</div>}><Settings key={`${settingsTab}:${settingsQuery}`} initialQuery={settingsQuery} initialTab={settingsTab} bootstrap={bootstrap} t={t} sessionId={session && !session.historyOnly ? session.id : undefined} update={setBootstrap} onError={showError} close={() => setSettingsOpen(false)} /></Suspense> : <>
        <header className="workspace-header"><div className="header-location">{!sidebar && <button className="icon-button" title={t.expand} onClick={() => setSidebar(true)}><PanelLeftOpen size={18} /></button>}<Folder size={15} /><button onClick={addProject}>{project?.name ?? t.openProject}</button>{session && <><span className="breadcrumb-divider">/</span><span className="header-title">{session.title}</span></>}</div><div className="workspace-actions"><button className={`quiet-button ${inspector === 'review' ? 'active' : ''}`} disabled={!cwd} onClick={() => setInspector(value => value === 'review' ? null : 'review')}><FileDiff size={15} /><span>{t.review}</span></button><button className="icon-button" title={t.context} disabled={!cwd} onClick={() => setInspector(value => value === 'context' ? null : 'context')}><Layers size={17} /></button><details className="more-menu"><summary className="icon-button" title={t.more}><ChevronDown size={16} /></summary><div>{(['files', 'agents', 'tasks', 'tree'] as InspectorTab[]).map(tab => <button disabled={!cwd} key={tab} onClick={() => setInspector(tab)}>{t[tab]}</button>)}<button disabled={!session || session.historyOnly || busy} onClick={() => setTerminalId(session!.id)}>{t.terminal}</button><button disabled={!session || session.historyOnly} onClick={() => { if (session) rpc(session.id, 'export_html').then(result => prepareCommand(String(result.path ?? result))).catch(showError); }}>{t.export}</button><button disabled={!session || busy} onClick={() => prepareCommand('/fork')}>{t.fork}</button><button disabled={!session || busy} onClick={closeSession}>{t.close} {t.session}</button></div></details></div></header>
        {error && <div className="error-banner" role="alert"><CircleHelp size={16} /><span>{error}</span><button className="icon-button" title={t.dismiss} onClick={() => setError('')}><X size={15} /></button></div>}
        {terminalId ? <Suspense fallback={<div className="page-loading">{t.loading}</div>}><TerminalPanel id={terminalId} t={t} onError={showError} close={() => { setTerminalId(''); if (session) setSessions(old => ({ ...old, [session.id]: { ...old[session.id], historyOnly: true } })); }} /></Suspense> : <div className="workspace-body"><div className="conversation-column">
          {session?.messages.length ? <Transcript messages={session.messages} t={t} busy={busy} loadEarlier={session.nextCursor ? earlier : undefined} /> : <div className="welcome"><div className="welcome-symbol"><span /><span /><span /></div><h1>{t.welcome}</h1><p>{t.welcomeText}</p>{!native && <p className="browser-note">{t.nativeOnly}</p>}<div className="starter-actions">{[[t.exploreAction, t.explorePrompt], [t.reviewAction, t.reviewPrompt], [t.buildAction, t.buildPrompt]].map(([label, prompt]) => <button key={label} onClick={() => { setDraft(prompt); textarea.current?.focus(); }}>{label}<ArrowUpRight size={14} /></button>)}</div></div>}
          <div className="composer-area">{activeQuestion && <Question key={activeQuestion.id} question={activeQuestion} t={t} answer={response => answer(session.id, response).catch(showError)} />}
            {!bootstrap.runtime && !booting && <button className="setup-callout" onClick={() => openSettings('runtime')}><span className="setup-icon"><TerminalSquare size={18} /></span><span><strong>{t.installRuntime}</strong><small>{t.installText}</small></span><ArrowUpRight size={16} /></button>}
            {(session?.state.queuedMessages?.steering?.length > 0 || session?.state.queuedMessages?.followUp?.length > 0) && <div className="queued-messages">{['steering', 'followUp'].flatMap(queue => (session.state.queuedMessages?.[queue] ?? []).map((message: string) => <div key={`${queue}:${message}`}><span>{t.queued}: {message}</span>{queue === 'followUp' && <button className="quiet-button" onClick={() => rpc(session.id, 'promote_queued_message', { message }).catch(showError)}>{t.steer}</button>}<button className="icon-button" title={t.remove} onClick={() => rpc(session.id, 'remove_queued_message', { queue, message }).catch(showError)}><X size={13} /></button></div>))}</div>}
            <div className={`composer ${busy ? 'is-busy' : ''}`}>
              {images.length > 0 && <div className="attachments">{images.map((image, i) => <div key={i}><img src={`data:${image.mimeType};base64,${image.data}`} alt={image.name} /><span>{image.name}</span><button className="icon-button" title={t.remove} onClick={() => setImages(old => old.filter((_, index) => index !== i))}><X size={12} /></button></div>)}</div>}
              <textarea ref={textarea} rows={2} value={draft} aria-label={t.prompt} placeholder={t.prompt} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
              <div className="composer-toolbar"><input className="visually-hidden" type="file" accept="image/*" multiple ref={fileInput} onChange={async e => { for (const file of Array.from(e.target.files ?? [])) { const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); }); setImages(old => [...old, { type: 'image', data, mimeType: file.type, name: file.name }]); } e.target.value = ''; }} /><button className="icon-button" title={t.addImage} onClick={() => fileInput.current?.click()}><Plus size={18} /></button>
                <div className="model-control"><button className="model-button" disabled={!cwd || !bootstrap.runtime} onClick={toggleModels}>{session?.state.model?.name ?? session?.state.model?.id ?? t.chooseModel}<ChevronDown size={12} /></button>{modelPicker && <div className="model-picker"><input autoFocus placeholder={t.search} value={modelQuery} onChange={e => setModelQuery(e.target.value)} /><div>{models.filter(model => `${model.name} ${model.id} ${model.provider}`.toLowerCase().includes(modelQuery.toLowerCase())).map(model => <button key={`${model.provider}:${model.id}`} onClick={() => chooseModel(model)}><strong>{model.name ?? model.id}</strong><small>{model.provider}</small></button>)}{!models.length && <p>{t.noModels}</p>}</div></div>}</div>
                {session && !session.historyOnly && <select className="effort-select" aria-label={t.effort} value={session.state.thinkingLevel ?? 'medium'} onChange={e => rpc(session.id, 'set_thinking_level', { level: e.target.value }).then(() => setSessions(old => ({ ...old, [session.id]: { ...old[session.id], state: { ...old[session.id].state, thinkingLevel: e.target.value } } }))).catch(showError)}>{['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].map(level => <option key={level}>{level}</option>)}</select>}
                <span className="spacer" />{busy && <select className="delivery-select" value={delivery} onChange={e => setDelivery(e.target.value)} aria-label={t.queued}><option value="steer">{t.steer}</option><option value="follow_up">{t.followUp}</option></select>}{busy && !draft ? <button className="send-button stop-button" title={t.stop} onClick={() => rpc(session.id, 'abort').catch(showError)}><Square size={14} fill="currentColor" /></button> : <button className="send-button" title={t.send} disabled={sending || (!draft.trim() && !images.length) || !cwd || !bootstrap.runtime} onClick={() => send()}>{sending ? <LoaderCircle size={16} className="spin" /> : <ArrowUp size={18} />}</button>}
              </div>
            </div><div className="composer-footnote"><span><span className={`status-dot ${busy ? 'working' : 'connected'}`} />{busy ? t.running : session?.pending.length ? t.waiting : t.ready}</span><span>{cwd ? <><FolderOpen size={12} />{cwd}</> : <button onClick={addProject}>{t.openProject}</button>}</span></div>
          </div>
        </div>{inspector && <Suspense fallback={<aside className="inspector"><p>{t.loading}</p></aside>}><Inspector onSessionChanged={() => session ? refreshSession(session.id, true) : Promise.resolve()} tab={inspector} session={session} cwd={cwd} t={t} onError={showError} close={() => setInspector(null)} send={prepareCommand} /></Suspense>}</div>}
      </>}
      {settingsOpen && pending.length > 0 && <div className="settings-question"><Question key={pending[0].question.id} question={pending[0].question} t={t} answer={response => answer(pending[0].sessionId, response).catch(showError)} /></div>}{settingsOpen && error && <div className="error-toast" role="alert"><span>{error}</span><button className="icon-button" title={t.dismiss} onClick={() => setError('')}><X size={15} /></button></div>}
    </main>
    {commandsOpen && <Suspense fallback={null}><CommandPalette ensureSession={async () => (await openSession()).id} navigate={navigateCommand} t={t} cwd={cwd} sessionId={session && !session.historyOnly ? session.id : undefined} close={() => setCommandsOpen(false)} send={prepareCommand} onError={showError} /></Suspense>}
  </div>;
}
