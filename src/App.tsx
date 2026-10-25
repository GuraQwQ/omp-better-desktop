import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowUpRight, Bell, ChevronDown, ChevronRight, CircleHelp, Command, FileDiff, FilePlus2, Folder, FolderOpen, FolderPlus, GitBranch, ImagePlus, Layers, LoaderCircle, MessageSquare, PanelLeftClose, PanelLeftOpen, Plus, Settings2, Square, TerminalSquare, X } from 'lucide-react';
import { copy, localizeError } from './lib/i18n';
import { native, onDesktopEvent, pickPath, request, rpc } from './lib/bridge';
import { applyEvent, normalizeMessage, returnFromTerminal } from './lib/session-state';
import { terminalCommand } from './lib/command-routes';
import { sessionKey, sessionPathKey, storeSession, uniqueSessions } from './lib/session-identity';
import './components/project-list.css';
import type { Bootstrap, CatalogEntry, Json, Project, SessionSummary, SessionView } from './lib/types';
import type { InspectorTab } from './panels/Inspector';
import Transcript from './components/Transcript';
import Question from './components/Question';
import SessionActivity from './components/SessionActivity';
import Select from './components/Select';
import SessionUsage, { type UsageCache } from './components/SessionUsage';
import WindowChrome from './components/WindowChrome';

const Settings = lazy(() => import('./panels/Settings'));
const Inspector = lazy(() => import('./panels/Inspector'));
const TerminalPanel = lazy(() => import('./panels/Terminal'));
const CommandPalette = lazy(() => import('./components/CommandPalette'));

const initial: Bootstrap = { dataRoot: '', runtime: null, projects: [], preferences: { language: navigator.language.startsWith('zh') ? 'zh' : 'en', theme: 'system' } };
type SessionTarget = { source?: SessionView; cwd: string; draftKey: string; revision: number };

export default function App() {
  const [bootstrap, setBootstrap] = useState(initial);
  const [project, setProject] = useState<Project | null>(null);
  const [history, setHistory] = useState<Record<string, SessionSummary[]>>({});
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [sessions, setSessions] = useState<Record<string, SessionView>>({});
  const [activeId, commitActiveId] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('general');
  const [settingsQuery, setSettingsQuery] = useState('');
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const [inspector, setInspector] = useState<InspectorTab | null>(null);
  const [terminalId, setTerminalId] = useState('');
  const [terminalInput, setTerminalInput] = useState('');
  const [models, setModels] = useState<Json[]>([]);
  const [modelPicker, setModelPicker] = useState(false);
  const [modelQuery, setModelQuery] = useState('');
  const [attachmentMenu, setAttachmentMenu] = useState(false);
  const [sending, setSending] = useState(false);
  const [delivery, setDelivery] = useState('steer');
  const [images, setImages] = useState<{ type: 'image'; data: string; mimeType: string; name: string }[]>([]);
  const [booting, setBooting] = useState(true);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const usageCache = useRef<UsageCache>(new Map());
  const attachmentControl = useRef<HTMLDivElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const modelControl = useRef<HTMLDivElement>(null);
  const modelButton = useRef<HTMLButtonElement>(null);
  const moreMenu = useRef<HTMLDetailsElement>(null);
  const sessionsRef = useRef(sessions);
  const activeIdRef = useRef(activeId);
  const selectionRevision = useRef(0);
  const openingSessions = useRef(new Map<string, { promise: Promise<SessionView>; promote: () => void }>());
  const historyRequests = useRef<Record<string, number>>({});
  const releasedIds = useRef(new Set<string>());
  const runtimeQueue = useRef<Promise<void>>(Promise.resolve());
  const activationRevision = useRef(0);
  const drafts = useRef<Record<string, string>>({});
  const eventQueue = useRef<{ sessionId: string; event: Json }[]>([]);
  const frame = useRef(0);
  const t = copy(bootstrap.preferences.language);
  const allSessions = uniqueSessions(Object.values(sessions));
  const selected = sessions[activeId];
  const session = selected ? allSessions.find(value => sessionKey(value) === sessionKey(selected)) : undefined;
  const cwd = session?.cwd ?? project?.path ?? '';
  const draftKey = activeId || `new:${sessionPathKey(cwd)}`;
  const busy = !!session?.state.isStreaming || session?.status === 'running';
  const pending = Object.values(sessions).flatMap(s => s.pending.map(question => ({ sessionId: s.id, title: s.title, question })));
  const showError = useCallback((value: unknown) => { if (value instanceof DOMException && value.name === 'AbortError') return; setError(value instanceof Error ? value.message : String(value)); }, []);
  const setActiveId = (id: string) => { selectionRevision.current++; activeIdRef.current = id; commitActiveId(id); };
  const putSession = (value: SessionView, replaceId?: string) => {
    const merge = (previous: Record<string, SessionView>) => { const next = { ...previous }; if (replaceId && replaceId !== value.id) delete next[replaceId]; return storeSession(next, value); };
    sessionsRef.current = merge(sessionsRef.current); setSessions(merge);
  };
  const withRuntime = <T,>(action: () => Promise<T>): Promise<T> => {
    const result = runtimeQueue.current.then(action);
    runtimeQueue.current = result.then(() => {}, () => {});
    return result;
  };
  const activateRuntime = () => {
    if (!native) return;
    const revision = ++activationRevision.current;
    void withRuntime(async () => {
      if (revision !== activationRevision.current) return;
      const current = sessionsRef.current[activeIdRef.current];
      await request('session.activate', { id: current && !current.historyOnly ? current.id : null });
    }).catch(showError);
  };
  const newConversation = () => {
    setModelPicker(false); setAttachmentMenu(false);
    if (!project) { setActiveId(''); setDraft(''); setSettingsOpen(false); return; }
    const id = `draft:${crypto.randomUUID()}`;
    drafts.current[id] = '';
    putSession({ id, cwd: project.path, title: t.newTitle, messages: [], state: {}, status: 'ready', pending: [], historyOnly: true });
    setActiveId(id); setDraft(''); setSettingsOpen(false);
  };
  useEffect(() => {
    if (allSessions.length !== Object.keys(sessions).length) setSessions(Object.fromEntries(allSessions.map(value => [value.id, value])));
    if (session && session.id !== activeId) { drafts.current[session.id] = drafts.current[activeId] ?? draft; setActiveId(session.id); }
  }, [sessions, activeId]);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
  useEffect(() => { activeIdRef.current = activeId; setDraft(drafts.current[draftKey] ?? sessionsRef.current[activeId]?.draft ?? ''); }, [activeId, draftKey]);
  useEffect(() => { drafts.current[draftKey] = draft; }, [draft, draftKey]);
  useEffect(activateRuntime, [session?.id, session?.historyOnly]);
  useEffect(() => {
    request<Bootstrap>('bootstrap').then(value => { setBootstrap(value); if (value.projects.length) { setProject(value.projects[0]); setExpandedProjects(previous => ({ ...previous, [value.projects[0].path]: true })); } }).catch(showError).finally(() => setBooting(false));
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void onDesktopEvent(payload => {
      if (payload.event.type === 'desktop_status' && payload.event.status === 'released') releasedIds.current.add(payload.sessionId);
      if (payload.event.type === 'extension_ui_request' && payload.event.method === 'set_editor_text') { drafts.current[payload.sessionId] = payload.event.text ?? ''; if (payload.sessionId === activeIdRef.current) setDraft(payload.event.text ?? ''); }
      if (payload.event.type === 'extension_error' || payload.event.type === 'notice' && payload.event.level === 'error') showError(payload.event.error ?? payload.event.message);
      if (['session_settled', 'prompt_result', 'config_update', 'session_info_update'].includes(payload.event.type)) {
        if (sessionsRef.current[payload.sessionId] && !sessionsRef.current[payload.sessionId].historyOnly && !releasedIds.current.has(payload.sessionId)) void rpc(payload.sessionId, 'get_state').then(state => setSessions(old => old[payload.sessionId] && !old[payload.sessionId].historyOnly ? ({ ...old, [payload.sessionId]: { ...old[payload.sessionId], state: { ...old[payload.sessionId].state, ...state }, path: state.sessionFile ?? old[payload.sessionId].path } }) : old)).catch(error => { if (!releasedIds.current.has(payload.sessionId) && !sessionsRef.current[payload.sessionId]?.historyOnly) showError(error); });
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
  useEffect(() => { if (project) void refreshHistory(project.path); }, [project?.path, activeId]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (terminalId) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setCommandsOpen(value => !value); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') { event.preventDefault(); newConversation(); }
      if ((event.ctrlKey || event.metaKey) && event.key === ',') { event.preventDefault(); setSettingsTab('general'); setSettingsOpen(value => !value); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') { event.preventDefault(); setSidebar(value => !value); }
      if (event.key === 'Escape') {
        if (attachmentMenu) addButton.current?.focus();
        else if (modelPicker) modelButton.current?.focus();
        else if (moreMenu.current?.open) moreMenu.current.querySelector('summary')?.focus();
        setModelPicker(false); setAttachmentMenu(false);
        if (moreMenu.current) moreMenu.current.open = false;
      }
    };
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  }, [terminalId, modelPicker, attachmentMenu, project?.path, bootstrap.preferences.language]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!attachmentControl.current?.contains(target)) setAttachmentMenu(false);
      if (!modelControl.current?.contains(target)) setModelPicker(false);
      if (moreMenu.current && !moreMenu.current.contains(target)) moreMenu.current.open = false;
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  useEffect(() => { if (attachmentMenu) attachmentControl.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus(); }, [attachmentMenu]);
  useEffect(() => { if (textarea.current) { textarea.current.style.height = 'auto'; textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 180)}px`; } }, [draft]);

  const refreshHistory = async (path: string) => {
    const revision = (historyRequests.current[path] ?? 0) + 1;
    historyRequests.current[path] = revision;
    try { const values = await request<SessionSummary[]>('session.list', { cwd: path }); if (historyRequests.current[path] === revision) setHistory(previous => ({ ...previous, [path]: values })); } catch (error) { showError(error); }
  };
  const selectProject = (value: Project) => {
    setModelPicker(false); setAttachmentMenu(false);
    setProject(value); setExpandedProjects(previous => ({ ...previous, [value.path]: previous[value.path] ?? true }));
    const control = allSessions.find(item => item.hidden && sessionPathKey(item.cwd) === sessionPathKey(value.path));
    setActiveId(control?.id ?? ''); setSettingsOpen(false);
  };
  const toggleProject = (value: Project) => {
    const expanded = !expandedProjects[value.path];
    setExpandedProjects(previous => ({ ...previous, [value.path]: expanded }));
    if (expanded && !history[value.path]) void refreshHistory(value.path);
  };
  const addProject = async () => { try { const path = await pickPath(); if (!path) return; const projects = await request<Project[]>('project.add', { path }); setBootstrap(old => ({ ...old, projects })); const added = projects.find(p => p.path === path) ?? projects.at(-1)!; setExpandedProjects(previous => ({ ...previous, [added.path]: true })); selectProject(added); } catch (e) { showError(e); } };
  const attachPath = async (directory: boolean) => {
    setAttachmentMenu(false);
    try {
      const path = await pickPath(directory);
      if (path) setDraft(old => `${old}${old && !/\s$/.test(old) ? ' ' : ''}@"${path.replaceAll('\\', '/')}" `);
    } catch (error) { showError(error); }
    finally { textarea.current?.focus(); }
  };
  const prepareSession = async (forPrompt = false, requested?: SessionTarget): Promise<SessionView> => {
    if (!forPrompt && requested && requested.revision !== selectionRevision.current) throw new DOMException('Cancelled', 'AbortError');
    const captured = requested ? requested.source : sessionsRef.current[activeIdRef.current] ?? session;
    const source = captured ? uniqueSessions(Object.values(sessionsRef.current)).find(value => sessionKey(value) === sessionKey(captured)) ?? { ...captured, historyOnly: true } : undefined;
    if (source && !source.historyOnly && !releasedIds.current.has(source.id)) return source;
    const targetCwd = requested?.cwd ?? source?.cwd ?? project?.path ?? '';
    if (!targetCwd) throw Error(t.selectProject);
    const target = source?.path ? sessionKey(source) : `new:${source?.id ?? sessionPathKey(targetCwd)}`;
    const pending = openingSessions.current.get(target);
    if (pending) { if (forPrompt) pending.promote(); return pending.promise; }
    const revision = requested?.revision ?? selectionRevision.current;
    const sourceDraftKey = requested?.draftKey ?? (activeIdRef.current || `new:${sessionPathKey(targetCwd)}`);
    const existing = uniqueSessions(Object.values(sessionsRef.current)).find(value => !value.historyOnly && !releasedIds.current.has(value.id) && (source?.path ? sessionKey(value) === target : value.hidden && !value.messages.length && !(drafts.current[value.id] ?? '').trim() && sessionPathKey(value.cwd) === sessionPathKey(targetCwd)));
    const promise = (async () => {
      const opened = existing ? { id: existing.id, path: existing.path, state: existing.state } : await request<Json>('session.open', { cwd: targetCwd, path: source?.path });
      let page: Json | undefined;
      let btw: Json = { records: [] };
      if (!releasedIds.current.has(opened.id)) {
        try {
          if (source?.path) page = await rpc(opened.id, 'get_messages_page', { limit: 100 });
          if (!releasedIds.current.has(opened.id)) btw = await rpc(opened.id, 'get_btw_history');
        } catch (error) { if (!releasedIds.current.has(opened.id)) throw error; }
      }
      const value: SessionView = { id: opened.id, cwd: targetCwd, path: opened.path ?? source?.path, title: opened.state?.sessionName ?? source?.title ?? t.newTitle, messages: page ? page.messages.map((message: Json, i: number) => normalizeMessage(message, `reopen-${i}`)) : source?.messages ?? existing?.messages ?? [], nextCursor: page ? page.nextCursor : source?.nextCursor, state: { ...opened.state, btwRecords: btw.records }, status: 'ready', pending: source?.pending ?? existing?.pending ?? [], historyOnly: releasedIds.current.has(opened.id), hidden: forPrompt ? false : source ? !!source.hidden : true };
      drafts.current[value.id] = drafts.current[sourceDraftKey] ?? draft;
      if (sourceDraftKey !== value.id) delete drafts.current[sourceDraftKey];
      putSession(value, source?.id);
      if (selectionRevision.current === revision) setActiveId(value.id);
      else if (!forPrompt) activateRuntime();
      return value;
    })();
    openingSessions.current.set(target, { promise, promote: () => { forPrompt = true; } });
    try { return await promise; } finally { if (openingSessions.current.get(target)?.promise === promise) openingSessions.current.delete(target); }
  };
  const openSession = () => {
    const target: SessionTarget = { source: session, cwd, draftKey, revision: selectionRevision.current };
    return withRuntime(() => prepareSession(false, target));
  };
  const openSettings = async (tab = 'general', query = '') => {
    setModelPicker(false); setAttachmentMenu(false); setSettingsTab(tab); setSettingsQuery(query); setSettingsOpen(true);
    if (cwd && bootstrap.runtime && (!session || session.historyOnly)) { try { await openSession(); } catch (error) { showError(error); } }
  };
  const closeSession = async () => {
    if (!session) return;
    try { if (!session.historyOnly) await request('session.close', { id: session.id }); setSessions(old => { const next = { ...old }; delete next[session.id]; return next; }); setActiveId(''); } catch (error) { showError(error); }
  };
  const closeTerminal = async (takenOver: boolean) => {
    const id = terminalId;
    let runtimeReleased = takenOver;
    if (!takenOver) {
      try {
        const state = await rpc(id, 'get_state');
        setSessions(old => old[id] ? ({ ...old, [id]: { ...old[id], state: { ...old[id].state, ...state } } }) : old);
      } catch { runtimeReleased = true; }
    }
    setTerminalId(''); setTerminalInput('');
    setSessions(old => old[id] ? ({ ...old, [id]: returnFromTerminal(old[id], runtimeReleased) }) : old);
    if (runtimeReleased && project) void refreshHistory(project.path);
  };
  const loadHistory = async (summary: SessionSummary) => {
    setModelPicker(false); setAttachmentMenu(false);
    const revision = ++selectionRevision.current;
    const existing = uniqueSessions(Object.values(sessionsRef.current)).find(value => sessionKey(value) === sessionKey(summary));
    if (existing) { setActiveId(existing.id); setSettingsOpen(false); return; }
    try {
      const result = await request<Json>('session.history', { path: summary.path, limit: 100 });
      if (selectionRevision.current !== revision) return;
      const current = uniqueSessions(Object.values(sessionsRef.current)).find(value => sessionKey(value) === sessionKey(summary));
      if (current) { setActiveId(current.id); setSettingsOpen(false); return; }
      const id = `history:${sessionPathKey(summary.path)}`;
      putSession({ id, cwd: summary.cwd, path: summary.path, title: summary.title ?? t.newTitle, messages: result.messages.map((message: Json, i: number) => normalizeMessage(message, `history-${i}`)), state: {}, pending: [], status: 'ready', historyOnly: true, nextCursor: result.nextCursor });
      setActiveId(id); setSettingsOpen(false);
    } catch (e) { showError(e); }
  };
  const send = async (text = draft) => {
    if ((!text.trim() && !images.length) || sending) return;
    const target: SessionTarget = { source: session, cwd, draftKey, revision: selectionRevision.current };
    const pending = openingSessions.current.get(session?.path ? sessionKey(session) : `new:${session?.id ?? sessionPathKey(cwd)}`)?.promise;
    setSending(true); setError('');
    try {
      const slash = /^\/([^\s]+)(?:\s+([\s\S]*))?$/.exec(text.trim());
      if (slash && !images.length) {
        const catalog = await request<CatalogEntry[]>('command.catalog');
        const entry = catalog.find(item => item.kind === 'slash' && item.name === slash[1]);
        if (entry && navigateCommand(entry, slash[2] ?? '', true)) { setDraft(''); return; }
      }
      await withRuntime(async () => {
        const current = await prepareSession(true, { ...target, source: pending ? await pending : target.source });
        if (current.historyOnly) throw Error(t.launchError);
        setSessions(old => old[current.id] ? { ...old, [current.id]: { ...old[current.id], hidden: false } } : old);
        const command = current.state.isStreaming ? delivery === 'follow_up' ? 'follow_up' : 'steer' : 'prompt';
        await rpc(current.id, command, { message: text, ...(images.length ? { images: images.map(({ name: _, ...image }) => image) } : {}) });
        drafts.current[current.id] = '';
        if (activeIdRef.current === current.id) { setDraft(''); setImages([]); }
        if (current.title === t.newTitle && !text.startsWith('/')) { const title = text.replace(/\s+/g, ' ').slice(0, 70); setSessions(old => old[current.id] ? { ...old, [current.id]: { ...old[current.id], title } } : old); await rpc(current.id, 'set_session_name', { name: title }); }
      });
    } catch (e) { showError(e); } finally { setSending(false); activateRuntime(); }
  };
  const toggleModels = async () => {
    if (modelPicker) { setModelPicker(false); return; }
    setAttachmentMenu(false); setModelPicker(true);
    try { const current = await openSession(); if (activeIdRef.current !== current.id || current.historyOnly) return; const result = await rpc(current.id, 'get_available_models'); setModels(result.models ?? result); } catch (e) { showError(e); }
  };
  const chooseModel = async (model: Json) => {
    try { const current = await openSession(); const result = await rpc(current.id, 'set_model', { provider: model.provider, modelId: model.id }); setSessions(old => old[current.id] ? ({ ...old, [current.id]: { ...old[current.id], state: { ...old[current.id].state, model: result.model ?? result ?? model } } }) : old); setModelPicker(false); modelButton.current?.focus(); } catch (e) { showError(e); }
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
    const btw = replaceMessages ? await rpc(id, 'get_btw_history') : undefined;
    setSessions(old => old[id] ? ({ ...old, [id]: { ...old[id], state: { ...old[id].state, ...state, ...(btw ? { btwRecords: btw.records } : {}) }, title: state.sessionName ?? t.newTitle, path: state.sessionFile ?? old[id].path, ...(history ? { messages: history.messages.map((message: Json, i: number) => normalizeMessage(message, `reload-${i}`)), nextCursor: history.nextCursor } : {}) } }) : old);
  };
  const navigateCommand = (entry: CatalogEntry, args = '', typed = false): boolean => {
    const run = (action: (current: SessionView) => Promise<void>) => { void withRuntime(async () => action(await prepareSession())).catch(showError); };
    if (entry.kind === 'slash') {
      if (entry.name === 'new') { run(async current => { await rpc(current.id, 'new_session'); await refreshSession(current.id, true); }); return true; }
      if (['quit', 'exit'].includes(entry.name)) { void closeSession(); return true; }
      if (entry.name === 'restart') { run(async current => { await request('session.close', { id: current.id }); const opened = await request<Json>('session.open', { cwd: current.cwd, path: current.path }); setSessions(old => { const next: Record<string, SessionView> = { ...old, [opened.id]: { ...current, id: opened.id, state: opened.state, status: 'ready', pending: [] } }; delete next[current.id]; return next; }); setActiveId(opened.id); }); return true; }
      if (typed && entry.name === 'btw' && args.trim()) { run(async current => { await rpc(current.id, 'btw', { question: args }); }); return true; }
      if (typed && entry.name === 'queue' && args.trim()) { run(async current => { await rpc(current.id, 'follow_up', { message: args }); await refreshSession(current.id); }); return true; }
    }
    if (typed && entry.rpc !== false) return false;
    const surface = args.trim() ? undefined : entry.kind === 'slash' && entry.name === 'setup' ? 'providers' : entry.surface;
    if (surface === 'settings' || surface === 'providers') { void openSettings(surface === 'settings' ? 'omp' : 'providers'); return true; }
    if (surface === 'models') { void toggleModels(); return true; }
    const panels: Record<string, InspectorTab> = { context: 'context', usage: 'context', diff: 'review', agents: 'agents', jobs: 'tasks', tree: 'tree', tools: 'context' };
    if (surface && panels[surface]) { setSettingsOpen(false); setInspector(panels[surface]); return true; }
    if (surface === 'sessions') { setSettingsOpen(false); setSidebar(true); return true; }
    const input = terminalCommand(entry, args);
    if (input) { run(async current => { const state = await rpc(current.id, 'get_state'); if (!state.isSettled) throw Error(t.terminalText); setTerminalInput(input); setTerminalId(current.id); setSettingsOpen(false); }); return true; }
    return false;
  };
  const earlier = async () => {
    if (!session?.path || !session.nextCursor) return;
    try { const result = await request<Json>('session.history', { path: session.path, cursor: session.nextCursor, limit: 100 }); setSessions(old => ({ ...old, [session.id]: { ...old[session.id], messages: [...result.messages.map((message: Json, i: number) => normalizeMessage(message, `history-${session.nextCursor}-${i}`)), ...old[session.id].messages], nextCursor: result.nextCursor } })); } catch (e) { showError(e); }
  };
  const activeQuestion = session?.pending[0];
  return <div className="window-frame"><WindowChrome language={bootstrap.preferences.language} /><div className={`app-shell ${sidebar ? '' : 'sidebar-hidden'}`}>
    {sidebar && <aside className="sidebar" inert={!!terminalId}><div className="brand-row"><div className="brand-mark">o<span>m</span>p</div><span>{t.desktop}</span><button className="icon-button" title={t.collapse} onClick={() => setSidebar(false)}><PanelLeftClose size={17} /></button></div>
      <button className="new-conversation" onClick={newConversation}><Plus size={17} /><span>{t.newSession}</span><kbd>Ctrl N</kbd></button>
      <button className="nav-item" onClick={() => setCommandsOpen(true)}><Command size={16} /><span>{t.commands}</span><kbd>Ctrl K</kbd></button>
      {pending.length > 0 && <button className="nav-item pending-nav" onClick={() => { setActiveId(pending[0].sessionId); setSettingsOpen(false); }}><Bell size={16} /><span>{t.pending}</span><b>{pending.length}</b></button>}
      <div className="section-label"><span>{t.projects}</span><button className="icon-button" title={t.addProject} onClick={addProject}><Plus size={15} /></button></div>
      <div className="project-list">{bootstrap.projects.length ? bootstrap.projects.map(item => {
        const expanded = !!expandedProjects[item.path];
        const listId = `project-sessions-${encodeURIComponent(item.path)}`;
        const opened = allSessions.filter(value => !value.hidden && sessionPathKey(value.cwd) === sessionPathKey(item.path));
        const saved = [...new Map((history[item.path] ?? []).map(value => [sessionKey(value), value])).values()].filter(value => !allSessions.some(open => sessionKey(open) === sessionKey(value)));
        return <div key={item.path}>
          <div className="project-row"><button className="icon-button project-toggle" aria-expanded={expanded} aria-controls={listId} title={`${expanded ? t.collapseProject : t.expandProject} ${item.name}`} onClick={() => toggleProject(item)}><ChevronRight size={13} className={expanded ? 'rotate' : ''} /></button><button className={`project-item ${project?.path === item.path ? 'selected' : ''}`} title={item.path} onClick={() => selectProject(item)}><Folder size={15} /><span>{item.name}</span></button></div>
          {expanded && <div className="session-list" id={listId}>
            {opened.map(value => <button className={`session-item ${session && sessionKey(session) === sessionKey(value) ? 'active' : ''}`} key={sessionKey(value)} onClick={() => { setProject(item); setActiveId(value.id); setSettingsOpen(false); setModelPicker(false); setAttachmentMenu(false); }}>{value.historyOnly ? <MessageSquare size={12} /> : <span className={`session-status ${value.status}`} />}<span>{value.title}</span>{value.pending.length > 0 && <i />}</button>)}
            {saved.map(value => <button className={`session-item ${session && sessionKey(session) === sessionKey(value) ? 'active' : ''}`} key={sessionKey(value)} onClick={() => { setProject(item); void loadHistory(value); }}><MessageSquare size={12} /><span>{value.title || t.newTitle}</span></button>)}
            {!opened.length && !saved.length && <p>{t.noSessions}</p>}
          </div>}
        </div>;
      }) : <p className="sidebar-empty">{t.noProjects}</p>}</div>
      <div className="sidebar-bottom"><button className={`nav-item ${settingsOpen ? 'selected' : ''}`} onClick={() => settingsOpen ? setSettingsOpen(false) : openSettings('general')}><Settings2 size={16} /><span>{t.settings}</span></button><div className="runtime-pill"><span className={`status-dot ${bootstrap.runtime ? 'connected' : ''}`} /><span>{bootstrap.runtime ? `OMP ${bootstrap.runtime.version}` : t.notInstalled}</span><span className="version">v0.1</span></div></div>
    </aside>}
    <main className="main-area">
      {settingsOpen ? <Suspense fallback={<div className="page-loading">{t.loading}</div>}><Settings key={`${settingsTab}:${settingsQuery}`} initialQuery={settingsQuery} initialTab={settingsTab} bootstrap={bootstrap} t={t} sessionId={session && !session.historyOnly ? session.id : undefined} update={setBootstrap} onError={showError} close={() => setSettingsOpen(false)} /></Suspense> : <>
        <header className="workspace-header" inert={!!terminalId}><div className="header-location">{!sidebar && <button className="icon-button" title={t.expand} onClick={() => setSidebar(true)}><PanelLeftOpen size={18} /></button>}<Folder size={15} /><button onClick={addProject}>{project?.name ?? t.openProject}</button>{session && <><span className="breadcrumb-divider">/</span><span className="header-title">{session.title}</span></>}</div><div className="workspace-actions"><button className={`quiet-button ${inspector === 'review' ? 'active' : ''}`} disabled={!cwd} onClick={() => setInspector(value => value === 'review' ? null : 'review')}><FileDiff size={15} /><span>{t.review}</span></button><button className="icon-button" title={t.context} disabled={!cwd} onClick={() => setInspector(value => value === 'context' ? null : 'context')}><Layers size={17} /></button><details ref={moreMenu} className="more-menu" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }} onClick={event => { if ((event.target as Element).closest("button")) { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}><summary className="icon-button" title={t.more}><ChevronDown size={16} /></summary><div className="ui-menu">{(['files', 'agents', 'tasks', 'tree'] as InspectorTab[]).map(tab => <button disabled={!cwd} key={tab} onClick={() => setInspector(tab)}>{t[tab]}</button>)}<div className="menu-separator" /><button disabled={!session || session.historyOnly || !session.state.isSettled} onClick={() => { setTerminalInput(''); setTerminalId(session!.id); }}>{t.terminal}</button><button disabled={!session || session.historyOnly} onClick={() => { if (session) rpc(session.id, 'export_html').then(result => prepareCommand(String(result.path ?? result))).catch(showError); }}>{t.export}</button><button disabled={!session || busy} onClick={() => prepareCommand('/fork')}>{t.fork}</button><button disabled={!session || busy} onClick={closeSession}>{t.close} {t.session}</button></div></details></div></header>
        {error && <div className="error-banner" role="alert"><CircleHelp size={16} /><span>{localizeError(error, bootstrap.preferences.language)}</span><button className="icon-button" title={t.dismiss} onClick={() => setError('')}><X size={15} /></button></div>}
        {terminalId ? <Suspense fallback={<div className="page-loading">{t.loading}</div>}><TerminalPanel id={terminalId} initialCommand={terminalInput} t={t} onError={showError} close={closeTerminal} /></Suspense> : <div className="workspace-body"><div className="conversation-column">
          {session?.messages.length ? <Transcript messages={session.messages} t={t} busy={busy} loadEarlier={session.nextCursor ? earlier : undefined} /> : <div className="welcome"><div className="welcome-symbol"><span /><span /><span /></div><h1>{t.welcome}</h1><p>{t.welcomeText}</p>{!native && <p className="browser-note">{t.nativeOnly}</p>}<div className="starter-actions">{[[t.exploreAction, t.explorePrompt], [t.reviewAction, t.reviewPrompt], [t.buildAction, t.buildPrompt]].map(([label, prompt]) => <button key={label} onClick={() => { setDraft(prompt); textarea.current?.focus(); }}>{label}<ArrowUpRight size={14} /></button>)}</div></div>}
          <div className="composer-area">{activeQuestion && session && <Question key={activeQuestion.id} question={activeQuestion} t={t} answer={response => answer(session.id, response).catch(showError)} />}
            {session && !session.historyOnly && <SessionActivity session={session} t={t} refresh={() => refreshSession(session.id)} onError={showError} />}
            {!bootstrap.runtime && !booting && <button className="setup-callout" onClick={() => openSettings('runtime')}><span className="setup-icon"><TerminalSquare size={18} /></span><span><strong>{t.installRuntime}</strong><small>{t.installText}</small></span><ArrowUpRight size={16} /></button>}
            {session && (session.state.queuedMessages?.steering?.length > 0 || session.state.queuedMessages?.followUp?.length > 0) && <div className="queued-messages">{['steering', 'followUp'].flatMap(queue => (session.state.queuedMessages?.[queue] ?? []).map((message: string) => <div key={`${queue}:${message}`}><span>{t.queued}: {message}</span>{queue === 'followUp' && <button className="quiet-button" onClick={() => rpc(session.id, 'promote_queued_message', { message }).catch(showError)}>{t.steer}</button>}<button className="icon-button" title={t.remove} onClick={() => rpc(session.id, 'remove_queued_message', { queue, message }).catch(showError)}><X size={13} /></button></div>))}</div>}
            <div className={`composer ${busy ? 'is-busy' : ''}`}>
              {images.length > 0 && <div className="attachments">{images.map((image, i) => <div key={i}><img src={`data:${image.mimeType};base64,${image.data}`} alt={image.name} /><span>{image.name}</span><button className="icon-button" title={t.remove} onClick={() => setImages(old => old.filter((_, index) => index !== i))}><X size={12} /></button></div>)}</div>}
              <textarea ref={textarea} rows={2} value={draft} aria-label={t.prompt} placeholder={t.prompt} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
              <div className="composer-toolbar"><input className="visually-hidden" type="file" tabIndex={-1} accept="image/*" multiple ref={fileInput} onChange={async e => { for (const file of Array.from(e.target.files ?? [])) { const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); }); setImages(old => [...old, { type: 'image', data, mimeType: file.type, name: file.name }]); } e.target.value = ''; }} />
                <div className="attachment-control" ref={attachmentControl} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setAttachmentMenu(false); }}>
                  <button ref={addButton} className="icon-button" title={t.addContent} aria-haspopup="menu" aria-expanded={attachmentMenu} aria-controls={attachmentMenu ? 'attachment-menu' : undefined} onClick={() => { setAttachmentMenu(value => !value); setModelPicker(false); }}><Plus size={18} /></button>
                  {attachmentMenu && <div id="attachment-menu" className="attachment-menu ui-menu" role="menu" aria-label={t.addContent} onKeyDown={event => {
                    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
                    const index = items.indexOf(document.activeElement as HTMLButtonElement);
                    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length]?.focus(); }
                  }}>
                    <button role="menuitem" onClick={() => { setAttachmentMenu(false); addButton.current?.focus(); fileInput.current?.click(); }}><ImagePlus size={16} />{t.addImage}</button>
                    <button role="menuitem" disabled={!native} title={!native ? t.nativeOnly : undefined} onClick={() => void attachPath(false)}><FilePlus2 size={16} />{t.attachFile}</button>
                    <button role="menuitem" disabled={!native} title={!native ? t.nativeOnly : undefined} onClick={() => void attachPath(true)}><FolderPlus size={16} />{t.attachFolder}</button>
                  </div>}
                </div>
                <div className="model-control" ref={modelControl}><button ref={modelButton} className="model-button" aria-haspopup="dialog" aria-expanded={modelPicker} disabled={!cwd || !bootstrap.runtime} onClick={toggleModels}>{session?.state.model?.name ?? session?.state.model?.id ?? t.chooseModel}<ChevronDown size={12} /></button>{modelPicker && <div className="model-picker ui-menu" role="dialog" aria-label={t.chooseModel}><input autoFocus aria-label={t.search} placeholder={t.search} value={modelQuery} onChange={e => setModelQuery(e.target.value)} /><div>{models.filter(model => `${model.name} ${model.id} ${model.provider}`.toLowerCase().includes(modelQuery.toLowerCase())).map(model => <button key={`${model.provider}:${model.id}`} aria-pressed={session?.state.model?.id === model.id && session?.state.model?.provider === model.provider} onClick={() => chooseModel(model)}><strong>{model.name ?? model.id}</strong><small>{model.provider}</small></button>)}{!models.length && <p>{t.noModels}</p>}{models.length > 0 && !models.some(model => `${model.name} ${model.id} ${model.provider}`.toLowerCase().includes(modelQuery.toLowerCase())) && <p>{t.noResults}</p>}</div></div>}</div>
                {session && !session.historyOnly && <Select label={t.effort} value={session.state.thinkingLevel ?? 'medium'} options={Object.entries(t.effortLevels).map(([value, label]) => ({ value, label }))} onChange={level => rpc(session.id, 'set_thinking_level', { level }).then(() => setSessions(old => ({ ...old, [session.id]: { ...old[session.id], state: { ...old[session.id].state, thinkingLevel: level } } }))).catch(showError)} />}
                <span className="spacer" />{busy && <Select label={t.queued} value={delivery} onChange={setDelivery} options={[{ value: 'steer', label: t.steer }, { value: 'follow_up', label: t.followUp }]} />}{busy && !draft ? <button className="send-button stop-button" title={t.stop} onClick={() => rpc(session.id, 'abort').catch(showError)}><Square size={14} fill="currentColor" /></button> : <button className="send-button" title={t.send} disabled={sending || (!draft.trim() && !images.length) || !cwd || !bootstrap.runtime} onClick={() => send()}>{sending ? <LoaderCircle size={16} className="spin" /> : <ArrowUp size={18} />}</button>}
              </div>
            </div><div className="composer-footnote"><span><span className={`status-dot ${busy ? 'working' : 'connected'}`} />{busy ? t.running : session?.pending.length ? t.waiting : t.ready}</span><span>{cwd ? <><FolderOpen size={12} />{cwd}</> : <button onClick={addProject}>{t.openProject}</button>}</span></div>
            <SessionUsage session={session} language={bootstrap.preferences.language} cache={usageCache.current} />
          </div>
        </div>{inspector && <Suspense fallback={<aside className="inspector"><p>{t.loading}</p></aside>}><Inspector onSessionChanged={() => session ? refreshSession(session.id, true) : Promise.resolve()} tab={inspector} session={session} cwd={cwd} t={t} onError={showError} close={() => setInspector(null)} send={prepareCommand} /></Suspense>}</div>}
      </>}
      {settingsOpen && pending.length > 0 && <div className="settings-question"><Question key={pending[0].question.id} question={pending[0].question} t={t} answer={response => answer(pending[0].sessionId, response).catch(showError)} /></div>}{settingsOpen && error && <div className="error-toast" role="alert"><span>{localizeError(error, bootstrap.preferences.language)}</span><button className="icon-button" title={t.dismiss} onClick={() => setError('')}><X size={15} /></button></div>}
    </main>
    {commandsOpen && <Suspense fallback={null}><CommandPalette onSessionChanged={id => refreshSession(id, true)} ensureSession={async () => (await openSession()).id} navigate={navigateCommand} t={t} cwd={cwd} sessionId={session && !session.historyOnly ? session.id : undefined} close={() => setCommandsOpen(false)} send={prepareCommand} onError={showError} /></Suspense>}
  </div></div>;
}
