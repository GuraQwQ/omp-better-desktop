import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ArrowUp, ArrowUpRight, Bell, ChevronDown, ChevronRight, CircleHelp, Command, FileDiff, FilePlus2, Folder, FolderOpen, FolderPlus, GitBranch, ImagePlus, Layers, LoaderCircle, MessageSquare, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings2, Square, TerminalSquare, X } from 'lucide-react';
import { copy, localizeError } from './lib/i18n';
import { native, onDesktopEvent, pickPath, request, rpc } from './lib/bridge';
import { isSessionRunning, messageText, normalizeHistoryMessages, returnFromTerminal } from './lib/session-state';
import { acknowledgeDraft, captureDraft, createDraft, updateDraft, type ComposerDraft } from './lib/composer-draft';
import { SessionLifecycle } from './lib/session-lifecycle';
import { editableEntry, messageImages, retryMessageIndex } from './lib/message-actions';
import { searchSessions } from './lib/session-search';
import './components/conversation-actions.css';
import { mergeCommandEntries, resolveCommand } from './lib/command-routes';
import { displayPath } from './lib/display-path';
import { sessionKey, sessionPathKey, uniqueSessions } from './lib/session-identity';
import './components/project-list.css';
import type { Bootstrap, CatalogEntry, Json, Message, Project, SessionSummary, SessionView } from './lib/types';
import type { InspectorTab } from './panels/Inspector';
import Transcript from './components/Transcript';
import Question from './components/Question';
import SessionActivity from './components/SessionActivity';
import SessionTodos from './components/SessionTodos';
import ConversationLayout from './components/ConversationLayout';
import SplitWorkspace from './components/SplitWorkspace';
import ComposerAttachments from './components/ComposerAttachments';
import ComposerReferences from './components/ComposerReferences';
import { appendReferences, createMessageReference, encodeReferencedPrompt, parseReferencedPrompt, type ConversationReference, type SelectionContext } from './lib/references';
import { sideQuestionThreadSummaries, type SideQuestionSource, type SideQuestionThreadSummary } from './lib/side-questions';
import { sideQuestionStorage } from './lib/side-question-storage';
import { sideQuestions } from './lib/side-question-session';
import type { BtwHistoryRecord } from './generated/rpc-wire';
import { taskCardSummary } from './lib/task-card';
import AttachmentDropZone from './components/AttachmentDropZone';
import { attachmentPayload, fileData, type ComposerAttachment } from './lib/attachments';
import MotionPresence from './components/MotionPresence';
import QueuedMessages from './components/QueuedMessages';
import ComposerInput from './components/ComposerInput';
import Select from './components/Select';
import SessionUsage, { type UsageCache } from './components/SessionUsage';
import WindowChrome, { WindowSlot } from './components/WindowChrome';
import GenerationRate, { GenerationRateProvider, type RateCache } from './components/GenerationRate';
import SavedSessions from './components/SavedSessions';
import { notify, NOTIFY_AFTER_MS } from './lib/notify';
import { getCurrentWindow, UserAttentionType } from '@tauri-apps/api/window';
import { version } from '../package.json';
import { applyMotion, normalizeMotion } from './lib/motion';
import { answerableQuestion, clearQuestions, completeQuestion, questionDraft, updateQuestionDraft } from './lib/question-draft';
import { matchesShortcut, shortcutValue } from './lib/desktop-preferences';
import { sendGenUIPrompt, displayUserPrompt } from './lib/genui-prompt';
import { normalizeGenUIConfiguration } from './lib/genui-config';
import { useDesktopSchedules } from './lib/use-desktop-schedules';
import { useWorkspaceLayout } from './lib/use-workspace-layout';
import type { DesktopTab } from './panels/DesktopTools';

const Settings = lazy(() => import('./panels/Settings'));
const Inspector = lazy(() => import('./panels/Inspector'));
const DesktopTools = lazy(() => import('./panels/DesktopTools'));
const TerminalPanel = lazy(() => import('./panels/Terminal'));
const CommandPalette = lazy(() => import('./components/CommandPalette'));
const ContextInspector = lazy(() => import('./components/ContextInspector'));

// theme-boot.js 在首帧前读取这个缓存，避免深色用户启动时先闪浅色。
const cachedTheme: Bootstrap['preferences']['theme'] = (() => { try { const value = localStorage.getItem('omp-theme'); return value === 'light' || value === 'dark' ? value : 'system'; } catch { return 'system'; } })();
const cachedMotion = (() => { try { return normalizeMotion(localStorage.getItem('omp-motion')); } catch { return 'rich'; } })();
const initial: Bootstrap = { dataRoot: '', runtime: null, projects: [], preferences: { language: navigator.language.startsWith('zh') ? 'zh' : 'en', theme: cachedTheme, motion: cachedMotion } };
const PageSkeleton = ({ label }: { label: string }) => <div className="page-loading" data-skeleton="wave" role="status" aria-label={label}><span className="skeleton" style={{ width: '42%' }} /><span className="skeleton" style={{ width: '88%' }} /><span className="skeleton" style={{ width: '64%' }} /></div>;
type SessionTarget = { source?: SessionView; cwd: string; draftKey: string; revision: number; background?: boolean };

export default function App() {
  const [bootstrap, setBootstrap] = useState(initial);
  const [project, setProject] = useState<Project | null>(null);
  const [history, setHistory] = useState<Record<string, SessionSummary[]>>({});
  const [historyPageLoading, setHistoryPageLoading] = useState<{ id: string; revision: number } | null>(null);
  const [sessionQuery, setSessionQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [messageAction, setMessageAction] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [sessions, setSessions] = useState<Record<string, SessionView>>({});
  const [lifecycle] = useState(() => new SessionLifecycle(setSessions));
  const [activeId, commitActiveId] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('general');
  const [settingsQuery, setSettingsQuery] = useState('');
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [commandCatalog, setCommandCatalog] = useState<CatalogEntry[]>([]);
  const [sidebar, setSidebar] = useState(true);
  const [inspector, setInspector] = useState<InspectorTab | null>(null);
  const [desktopTab, setDesktopTab] = useState<DesktopTab | null>(null);
  const [selectionNonce, setSelectionNonce] = useState(0);
  const [selectedText, setSelectedText] = useState('');
  const [sideQuestionSource, setSideQuestionSource] = useState<SideQuestionSource>();
  const [sideQuestionThreadId, setSideQuestionThreadId] = useState<string>();
  const [sideQuestionMetadata, setSideQuestionMetadata] = useState<{ key: string; threads: SideQuestionThreadSummary[] }>({ key: '', threads: [] });
  const [targetMessageId, setTargetMessageId] = useState('');
  const [contextTarget, setContextTarget] = useState<string | null>(null);
  const [terminalId, setTerminalId] = useState('');
  const [terminalInput, setTerminalInput] = useState('');
  const [models, setModels] = useState<Json[]>([]);
  const [modelPicker, setModelPicker] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelQuery, setModelQuery] = useState('');
  const [attachmentMenu, setAttachmentMenu] = useState(false);
  const [sending, setSending] = useState(false);
  const [preparingAttachments, setPreparingAttachments] = useState(0);
  const [delivery, setDelivery] = useState('steer');
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [references, setReferences] = useState<ConversationReference[]>([]);
  const [booting, setBooting] = useState(true);
  const [pinNonce, setPinNonce] = useState(0);
  const [unread, setUnread] = useState<Record<string, boolean>>({});
  const textarea = useRef<HTMLTextAreaElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const actionPending = useRef<'edit' | 'retry' | 'queue' | 'send' | false>(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const usageCache = useRef<UsageCache>(new Map());
  const attachmentControl = useRef<HTMLDivElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const modelControl = useRef<HTMLDivElement>(null);
  const modelButton = useRef<HTMLButtonElement>(null);
  const moreMenu = useRef<HTMLDetailsElement>(null);
  const activeIdRef = useRef(activeId);
  const selectionRevision = useRef(0);
  const historyRequests = useRef<Record<string, number>>({});
  const activationRevision = useRef(0);
  const drafts = useRef<Record<string, ComposerDraft<ComposerAttachment>>>({});
  const visibleDraft = useRef<ComposerDraft<ComposerAttachment> | null>(null);
  const attachmentNames = useRef(new WeakMap<object, string>());
  const attachmentSequence = useRef(0);
  const rateCache = useRef<RateCache>(new Map());
  const abortRef = useRef<(() => void) | undefined>(undefined);
  const t = copy(bootstrap.preferences.language);
  const alerts = useRef({ notify: true, t });
  alerts.current = { notify: bootstrap.preferences.notifyOnDone !== false, t };
  const ranAt = useRef(new Map<string, number>());
  const allSessions = uniqueSessions(Object.values(sessions));
  const searchResults = searchSessions(bootstrap.projects, history, allSessions, sessionQuery);
  const selected = sessions[activeId];
  const session = selected ? allSessions.find(value => sessionKey(value) === sessionKey(selected)) : undefined;
  const contextKey = session ? sessionKey(session) : '';
  useEffect(() => { setContextTarget(target => target === contextKey ? target : null); }, [contextKey]);
  const cwd = session?.cwd ?? project?.path ?? '';
  const sideQuestionsKey = `side-questions:${session?.path ?? session?.id ?? `scratch:${cwd}`}`;
  const sideQuestionThreads = sideQuestionMetadata.key === sideQuestionsKey ? sideQuestionMetadata.threads : [];
  useEffect(() => {
    setSelectedText(''); setSideQuestionSource(undefined); setSideQuestionThreadId(undefined);
    let disposed = false;
    const update = () => { const value = sideQuestionStorage.peek(sideQuestionsKey); if (!disposed && value) setSideQuestionMetadata({ key: sideQuestionsKey, threads: sideQuestionThreadSummaries(value) }); };
    const unsubscribe = sideQuestionStorage.subscribe(sideQuestionsKey, update);
    if (native) void sideQuestionStorage.load(sideQuestionsKey).then(update).catch(error => { if (!disposed) setError(String(error)); });
    return () => { disposed = true; unsubscribe(); };
  }, [sideQuestionsKey]);
  useEffect(() => {
    if (!native || !session?.state.btwRecords?.length) return;
    let disposed = false;
    void sideQuestions.mergeHistory(sideQuestionsKey, session.state.btwRecords as BtwHistoryRecord[], session.historyOnly ? undefined : session.id).catch(error => { if (!disposed) setError(String(error)); });
    return () => { disposed = true; };
  }, [sideQuestionsKey, session?.state.btwRecords, session?.id, session?.historyOnly]);
  const configurationSession = lifecycle.configuration(session, cwd);
  const draftKey = activeId || `new:${sessionPathKey(cwd)}`;
  const getDraft = (key: string) => drafts.current[key] ??= createDraft<ComposerAttachment>();
  const composerDraft = getDraft(draftKey);
  visibleDraft.current = composerDraft;
  const showDraft = (value: ComposerDraft<ComposerAttachment>) => { if (visibleDraft.current === value) { setDraft(value.text); setAttachments(value.attachments); setReferences(value.references); } };
  const changeDraft = (value: ComposerDraft<ComposerAttachment>, text: string, attachments = value.attachments, references = value.references) => {
    const changed = (attachments !== value.attachments || references !== value.references) && visibleDraft.current === value;
    updateDraft(value, text, attachments, references);
    const update = () => showDraft(value);
    if (changed && document.documentElement.dataset.motion === 'rich' && document.startViewTransition) {
      const transition = document.startViewTransition(() => flushSync(update));
      void transition.ready.catch(() => {});
    } else update();
  };
  const attachmentName = (image: ComposerAttachment) => {
    if (!attachmentNames.current.has(image)) attachmentNames.current.set(image, `composer-attachment-${++attachmentSequence.current}`);
    return attachmentNames.current.get(image)!;
  };
  const busy = isSessionRunning(session);
  const layoutKey = `${sidebar}:${inspector}:${desktopTab}`;
  const slashCommands = mergeCommandEntries(commandCatalog, session?.state.availableCommands ?? []);
  const pending = Object.values(sessions).flatMap(s => s.pending.map(question => ({ sessionId: s.id, title: s.title, question })));
  const showError = useCallback((value: unknown) => { if (value instanceof DOMException && value.name === 'AbortError') return; setError(value instanceof Error ? value.message : String(value)); }, []);
  const openDesktop = (tab: DesktopTab) => { setInspector(null); setDesktopTab(tab); setSettingsOpen(false); };
  const closePreview = () => { setInspector(null); setDesktopTab(null); };
  useEffect(() => { if (inspector) setDesktopTab(null); }, [inspector]);
  useDesktopSchedules({ enabled: !!bootstrap.runtime, configuration: bootstrap.preferences.generativeUI, onSession: value => lifecycle.put(value), onError: showError });
  useWorkspaceLayout(`workspace:${contextKey || sessionPathKey(cwd)}`, { sidebar, inspector, desktopTab }, value => { setSidebar(value.sidebar !== false); setInspector(['review', 'files', 'agents', 'tasks', 'tree'].includes(value.inspector) ? value.inspector : null); const allowed = ['search', 'git', 'worktrees', 'editor', 'terminals', 'library', 'artifacts', 'notes', 'side-questions', 'schedules', ...(bootstrap.preferences.features?.reviews ? ['structured-review'] : []), ...(bootstrap.preferences.features?.browser ? ['browser'] : [])]; setDesktopTab(allowed.includes(value.desktopTab) ? value.desktopTab : null); }, showError);
  useEffect(() => { if (!bootstrap.preferences.features?.cards || !native) return; const timer = setTimeout(() => { for (const value of uniqueSessions(Object.values(sessions)).filter(value => !value.hidden)) void request('card.sync', { id: value.id, value: { sessionId: value.id, title: value.title, cwd: value.cwd, status: value.status, pending: value.pending.length, language: bootstrap.preferences.language, summary: taskCardSummary(messageText(value.messages.filter(message => message.role === 'assistant').at(-1) ?? { id: '', role: '', content: '' })) } }).catch(showError); }, 500); return () => clearTimeout(timer); }, [sessions, bootstrap.preferences.features?.cards, bootstrap.preferences.language]);
  useEffect(() => { if (!native) return; let stop: (() => void) | undefined; let disposed = false; void import('@tauri-apps/api/event').then(({ listen }) => listen<string>('desktop-card-focus', ({ payload }) => { if (lifecycle.current[payload]) { setActiveId(payload); setSettingsOpen(false); } })).then(value => { if (disposed) value(); else stop = value; }); return () => { disposed = true; stop?.(); }; }, []);
  useEffect(() => { if (desktopTab === 'browser' && !bootstrap.preferences.features?.browser || desktopTab === 'structured-review' && !bootstrap.preferences.features?.reviews) setDesktopTab(null); }, [bootstrap.preferences.features, desktopTab]);
  abortRef.current = busy && session && !settingsOpen && !commandsOpen ? () => { void rpc(session.id, 'abort').catch(showError); } : undefined;
  const replaceActiveId = (id: string) => { activeIdRef.current = id; commitActiveId(id); };
  const setActiveId = (id: string) => { selectionRevision.current++; setTargetMessageId(''); replaceActiveId(id); };
  const activateRuntime = () => {
    if (!native) return;
    const revision = ++activationRevision.current;
    void lifecycle.run(async () => {
      if (revision !== activationRevision.current) return;
      const current = settingsOpen && configurationSession ? lifecycle.current[configurationSession.id] : lifecycle.current[activeIdRef.current];
      await request('session.activate', { id: current && !current.historyOnly ? current.id : null });
    }).catch(showError);
  };
  const newConversation = () => {
    setModelPicker(false); setAttachmentMenu(false);
    if (!project) { changeDraft(composerDraft, '', []); setActiveId(''); setSettingsOpen(false); return; }
    const id = `draft:${crypto.randomUUID()}`;
    drafts.current[id] = createDraft();
    lifecycle.put({ id, cwd: project.path, title: t.newTitle, messages: [], state: {}, status: 'ready', pending: [], historyOnly: true });
    setActiveId(id); setDraft(''); setSettingsOpen(false);
  };
  useEffect(() => {
    if (session && session.id !== activeId) { drafts.current[session.id] = composerDraft; replaceActiveId(session.id); }
  }, [sessions, activeId]);
  // 回到窗口并停在该对话上，就算已读。
  useEffect(() => {
    const clear = () => { if (document.hasFocus()) setUnread(old => old[activeId] ? Object.fromEntries(Object.entries(old).filter(([id]) => id !== activeId)) : old); };
    clear(); window.addEventListener('focus', clear);
    return () => window.removeEventListener('focus', clear);
  }, [activeId]);
  useEffect(() => { activeIdRef.current = activeId; showDraft(composerDraft); }, [activeId, draftKey]);
  useEffect(activateRuntime, [session?.id, session?.historyOnly, settingsOpen, configurationSession?.id]);
  useEffect(() => {
    void request<CatalogEntry[]>('command.catalog').then(setCommandCatalog).catch(showError);
    request<Bootstrap>('bootstrap').then(value => { setBootstrap(value); if (value.projects.length) { setProject(value.projects[0]); setExpandedProjects(previous => ({ ...previous, [value.projects[0].path]: true })); } }).catch(showError).finally(() => setBooting(false));
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void onDesktopEvent(payload => {
      lifecycle.event(payload);
      sideQuestions.event(payload);
      if (payload.event.type === 'extension_ui_request' && payload.event.method === 'set_editor_text') changeDraft(getDraft(payload.sessionId), payload.event.text ?? '');
      if (payload.event.type === 'agent_start') ranAt.current.set(payload.sessionId, Date.now());
      const settled = payload.event.type === 'session_settled';
      const asks = payload.event.type === 'extension_ui_request' && ['select', 'confirm', 'input', 'editor', 'ask'].includes(payload.event.method);
      const away = !document.hasFocus();
      const ran = settled ? ranAt.current.get(payload.sessionId) : undefined;
      if (settled) ranAt.current.delete(payload.sessionId);
      if (ran && (away || payload.sessionId !== activeIdRef.current)) setUnread(old => old[payload.sessionId] ? old : { ...old, [payload.sessionId]: true });
      if (native && away && (settled || asks)) {
        const { notify: enabled, t: text } = alerts.current;
        const flash = () => void getCurrentWindow().requestUserAttention(UserAttentionType.Informational).catch(() => {});
        // 需要你处理，或长任务完成才弹系统通知；短回复只闪任务栏。没有通知权限时同样回退到闪烁。
        if (enabled && (asks || (ran && Date.now() - ran > NOTIFY_AFTER_MS))) void notify(lifecycle.current[payload.sessionId]?.title || text.newTitle, asks ? text.pending : text.done).then(ok => { if (!ok) flash(); });
        else flash();
      }
      if (payload.event.type === 'extension_error' || payload.event.type === 'notice' && payload.event.level === 'error') showError(payload.event.error ?? payload.event.message);
      if (payload.event.type === 'session_settled' && payload.sessionId === activeIdRef.current && !lifecycle.isReleased(payload.sessionId)) void lifecycle.refresh(payload.sessionId, true, t.newTitle).catch(error => { if (!lifecycle.isReleased(payload.sessionId)) showError(error); });
      if (['prompt_result', 'config_update', 'session_info_update', 'todo_reminder'].includes(payload.event.type)) {
        void lifecycle.refresh(payload.sessionId, false, t.newTitle).catch(error => { if (!lifecycle.isReleased(payload.sessionId)) showError(error); });
      }
    }).then(stop => { if (disposed) stop(); else unlisten = stop; });
    return () => { disposed = true; unlisten?.(); lifecycle.dispose(); };
  }, [showError]);
  useEffect(() => {
    const theme = bootstrap.preferences.theme;
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.dataset.theme = theme === 'system' ? media.matches ? 'dark' : 'light' : theme; document.documentElement.lang = bootstrap.preferences.language === 'zh' ? 'zh-CN' : 'en'; };
    try { localStorage.setItem('omp-theme', theme); } catch { /* 缓存只用于下次启动首帧 */ }
    apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply);
  }, [bootstrap.preferences]);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => { applyMotion(bootstrap.preferences.motion); };
    apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply);
  }, [bootstrap.preferences.motion]);
  useEffect(() => { if (project) void refreshHistory(project.path); }, [project?.path, activeId]);
  useEffect(() => {
    if (!sessionQuery.trim()) return;
    let current = true;
    setSearchLoading(true);
    void Promise.all(bootstrap.projects.map(value => refreshHistory(value.path))).finally(() => { if (current) setSearchLoading(false); });
    return () => { current = false; };
  }, [!!sessionQuery.trim(), bootstrap.projects]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (terminalId || event.defaultPrevented) return;
      const match = (id: Parameters<typeof shortcutValue>[0]) => matchesShortcut(event, shortcutValue(id, bootstrap.preferences.shortcuts));
      if (match('search')) { event.preventDefault(); setSidebar(true); requestAnimationFrame(() => searchInput.current?.focus()); }
      if (match('library')) { event.preventDefault(); openDesktop('library'); }
      if (match('workspace')) { event.preventDefault(); openDesktop('search'); }
      if (match('commands')) { event.preventDefault(); setCommandsOpen(value => !value); }
      if (match('new')) { event.preventDefault(); newConversation(); }
      if (match('settings')) { event.preventDefault(); setSettingsTab('general'); setSettingsOpen(value => !value); }
      if (match('sidebar')) { event.preventDefault(); setSidebar(value => !value); }
      if (event.key === 'Escape') {
        if (event.isComposing) return;
        if (!attachmentMenu && !modelPicker && !moreMenu.current?.open && !event.defaultPrevented && !document.querySelector('dialog[open]')) abortRef.current?.();
        if (attachmentMenu) addButton.current?.focus();
        else if (modelPicker) modelButton.current?.focus();
        else if (moreMenu.current?.open) moreMenu.current.querySelector('summary')?.focus();
        setModelPicker(false); setAttachmentMenu(false);
        if (moreMenu.current) moreMenu.current.open = false;
      }
    };
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  }, [terminalId, modelPicker, attachmentMenu, project?.path, bootstrap.preferences.language, bootstrap.preferences.shortcuts]);
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
  // 现代 WebView2 由 CSS field-sizing 撑高；仅旧内核回退为手算高度。
  useEffect(() => { if (!CSS.supports('field-sizing', 'content') && textarea.current) { textarea.current.style.height = 'auto'; textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 180)}px`; } }, [draft]);

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
  const addPreparedAttachments = (items: ComposerAttachment[], target = composerDraft) => {
    const added = items.filter(item => !target.attachments.some(existing => item.type === 'image' && existing.type === 'image' ? item.data === existing.data && item.mimeType === existing.mimeType : item.path && item.path === existing.path));
    if (added.length) changeDraft(target, target.text, [...target.attachments, ...added]);
  };
  const addAttachmentPaths = async (paths: string[], target = composerDraft) => {
    setPreparingAttachments(value => value + 1);
    try {
      const results = await Promise.allSettled(paths.map(path => request<ComposerAttachment[]>('attachment.paths', { paths: [path] })));
      for (const result of results) { if (result.status === 'fulfilled') addPreparedAttachments(result.value, target); else showError(result.reason); }
    } finally { setPreparingAttachments(value => value - 1); }
  };
  const addAttachmentFiles = async (files: File[]) => {
    const target = composerDraft;
    setPreparingAttachments(value => value + 1);
    try {
      for (const file of files) {
        try {
          const data = await fileData(file);
          const name = file.name || `image-${Date.now()}.png`;
          const item = file.type.startsWith('image/') ? { type: 'image' as const, data, mimeType: file.type, name } : await request<ComposerAttachment>('attachment.store', { name, data });
          addPreparedAttachments([item], target);
        } catch (error) { showError(error); }
      }
    } finally { setPreparingAttachments(value => value - 1); }
  };
  const removeAttachment = (index: number) => {
    const item = composerDraft.attachments[index];
    changeDraft(composerDraft, composerDraft.text, composerDraft.attachments.filter((_, position) => position !== index));
    if (item.type === 'file' && item.managed) void request('attachment.discard', { path: item.path, managed: true }).catch(showError);
  };
  const attachPath = async (directory: boolean) => {
    setAttachmentMenu(false);
    const target = composerDraft;
    try {
      const path = await pickPath(directory);
      if (path) await addAttachmentPaths([path], target);
    } catch (error) { showError(error); }
    finally { textarea.current?.focus(); }
  };
  const prepareSession = async (forPrompt = false, requested?: SessionTarget, restart = false): Promise<SessionView> => {
    if (!forPrompt && requested && requested.revision !== selectionRevision.current) throw new DOMException('Cancelled', 'AbortError');
    let source = requested ? requested.source : lifecycle.current[activeIdRef.current] ?? session;
    const targetCwd = requested?.cwd ?? source?.cwd ?? project?.path ?? '';
    if (!targetCwd) throw Error(t.selectProject);
    const revision = requested?.revision ?? selectionRevision.current;
    const sourceDraftKey = requested?.draftKey ?? (activeIdRef.current || `new:${sessionPathKey(targetCwd)}`);
    const sourceDraft = getDraft(sourceDraftKey);
    const sourceDraftRevision = sourceDraft.revision;
    source ??= Object.values(lifecycle.current).find(value => drafts.current[value.id] === sourceDraft);
    const value = await lifecycle.prepare({ source, cwd: targetCwd, title: t.newTitle, visible: forPrompt, restart,
      canReuse: candidate => !drafts.current[candidate.id]?.text.trim() && !drafts.current[candidate.id]?.attachments.length && !drafts.current[candidate.id]?.references.length });
    if (value.id !== source?.id) {
      // 草稿留在界面；连接替换只迁移仍归属于该请求的输入。
      const earlyDraft = drafts.current[value.id];
      if (earlyDraft && earlyDraft !== sourceDraft && earlyDraft.revision && sourceDraft.revision === sourceDraftRevision) {
        drafts.current[value.id] = earlyDraft;
      } else drafts.current[value.id] = sourceDraft;
      if (sourceDraftKey !== value.id) delete drafts.current[sourceDraftKey];
    }
    if (!requested?.background && selectionRevision.current === revision) replaceActiveId(value.id);
    else if (!forPrompt && !requested?.background) activateRuntime();
    return value;
  };
  const openSession = () => {
    const revision = selectionRevision.current;
    return lifecycle.run(() => prepareSession(false, { source: lifecycle.current[activeIdRef.current], cwd, draftKey: activeIdRef.current || `new:${sessionPathKey(cwd)}`, revision }));
  };
  const openConfigurationSession = () => lifecycle.run(() => prepareSession(false, { source: configurationSession, cwd, draftKey: `configuration:${sessionPathKey(cwd)}`, revision: selectionRevision.current, background: true }));
  const reconnectSettingsSession = (forConfiguration = false) => {
    const target: SessionTarget = { source: forConfiguration ? configurationSession : lifecycle.current[activeIdRef.current], cwd, draftKey: forConfiguration ? `configuration:${sessionPathKey(cwd)}` : activeIdRef.current || `new:${sessionPathKey(cwd)}`, revision: selectionRevision.current, background: forConfiguration };
    return lifecycle.run(async () => { await prepareSession(false, target, true); });
  };
  const loadSlashCommands = async () => {
    if (!cwd || !bootstrap.runtime) return;
    try {
      const current = await openSession();
      const result = await rpc(current.id, 'get_available_commands');
      lifecycle.update(current.id, current => ({ ...current, state: { ...current.state, availableCommands: result.commands } }));
    } catch (error) { showError(error); }
  };
  const openSettings = (tab = 'general', query = '') => {
    setModelPicker(false); setAttachmentMenu(false); setSettingsTab(tab); setSettingsQuery(query); setSettingsOpen(true);
  };
  const closeSession = async () => {
    if (!session) return;
    try { if (!session.historyOnly) await request('session.close', { id: session.id }); delete drafts.current[session.id]; lifecycle.remove(session.id); setActiveId(''); } catch (error) { showError(error); }
  };
  const closeTerminal = async (takenOver: boolean) => {
    const id = terminalId;
    let runtimeReleased = takenOver;
    if (!takenOver) {
      try {
        await lifecycle.refresh(id, false, t.newTitle);
      } catch { runtimeReleased = true; }
    }
    setTerminalId(''); setTerminalInput('');
    lifecycle.update(id, current => returnFromTerminal(current, runtimeReleased));
    if (runtimeReleased && project) void refreshHistory(project.path);
  };
  const loadHistory = async (summary: SessionSummary, messageId?: string) => {
    setModelPicker(false); setAttachmentMenu(false);
    const revision = ++selectionRevision.current;
    const existing = uniqueSessions(Object.values(lifecycle.current)).find(value => sessionKey(value) === sessionKey(summary));
    if (existing && (!messageId || existing.messages.some(message => message.id === messageId))) { setActiveId(existing.id); setTargetMessageId(messageId ?? ''); setSettingsOpen(false); return; }
    if (existing && !existing.historyOnly && messageId) {
      try { let current = existing; while (current.nextCursor && !current.messages.some(message => message.id === messageId)) { if (selectionRevision.current !== revision) return; const cursor = current.nextCursor; await lifecycle.loadEarlier(current.id); current = lifecycle.current[current.id] ?? current; if (current.nextCursor === cursor) break; } if (!current.messages.some(message => message.id === messageId)) throw Error('目标消息已变化，请重新搜索。'); setActiveId(current.id); setTargetMessageId(messageId); setSettingsOpen(false); } catch (error) { showError(error); } return;
    }
    try {
      const result = await request<Json>(messageId ? 'session.locate' : 'session.history', { path: summary.path, messageId, limit: 100 });
      if (selectionRevision.current !== revision) return;
      const current = uniqueSessions(Object.values(lifecycle.current)).find(value => sessionKey(value) === sessionKey(summary));
      if (current) { lifecycle.update(current.id, value => ({ ...value, messages: normalizeHistoryMessages(result.messages, 'history'), nextCursor: result.nextCursor, afterCursor: result.afterCursor })); setActiveId(current.id); setTargetMessageId(messageId ?? ''); setSettingsOpen(false); return; }
      const id = `history:${sessionPathKey(summary.path)}`;
      lifecycle.put({ id, cwd: summary.cwd, path: summary.path, title: summary.title ?? t.newTitle, messages: normalizeHistoryMessages(result.messages, 'history'), state: {}, pending: [], status: 'ready', historyOnly: true, nextCursor: result.nextCursor, afterCursor: result.afterCursor });
      setActiveId(id); setSettingsOpen(false);
      setTargetMessageId(messageId ?? '');
    } catch (e) { showError(e); }
  };
  const send = async (text = draft, preserveDraft = false): Promise<void> => {
    if ((!text.trim() && (preserveDraft || !attachments.length && !references.length)) || sending || preparingAttachments || actionPending.current) {
      if (preserveDraft) throw new Error(bootstrap.preferences.language === 'zh' ? '当前发送尚未完成，请稍后重试。' : 'A message is being prepared. Please retry shortly.');
      return;
    }
    actionPending.current = 'send';
    const submission = captureDraft(preserveDraft ? createDraft<ComposerAttachment>(text) : composerDraft);
    const target: SessionTarget = { source: session, cwd, draftKey, revision: selectionRevision.current };
    setSending(true); setError(''); setPinNonce(value => value + 1);
    try {
      const slash = /^\/([^\s]+)(?:\s+([\s\S]*))?$/.exec(text.trim());
      if (slash && !submission.attachments.length && !submission.references.length) {
        const entry = slashCommands.find(item => item.kind === 'slash' && (item.name === slash[1] || item.aliases?.includes(slash[1])));
        if (entry && navigateCommand(entry, slash[2] ?? '')) { if (acknowledgeDraft(submission)) showDraft(submission.draft); return; }
      }
      await lifecycle.run(async () => {
        const current = await prepareSession(true, target);
        if (current.historyOnly) throw Error(t.launchError);
        lifecycle.update(current.id, current => ({ ...current, hidden: false }));
        const command = isSessionRunning(current) ? delivery === 'follow_up' ? 'follow_up' : 'steer' : 'prompt';
        const body = encodeReferencedPrompt(text, submission.references);
        await sendGenUIPrompt(current.path ?? current.id, body, bootstrap.preferences.generativeUI, message => rpc(current.id, command, attachmentPayload(message, submission.attachments)));
        for (const item of submission.attachments) if (item.type === 'file') item.managed = false;
        if (acknowledgeDraft(submission)) showDraft(submission.draft);
        if (current.title === t.newTitle && !body.startsWith('/')) { const title = (text || submission.attachments.map(item => item.name).join(', ') || submission.references[0]?.content || t.newTitle).replace(/\s+/g, ' ').slice(0, 70); lifecycle.update(current.id, current => ({ ...current, title })); await rpc(current.id, 'set_session_name', { name: title }).catch(showError); }
      });
    } catch (e) { if (preserveDraft) throw e; showError(e); } finally { actionPending.current = false; setSending(false); activateRuntime(); }
  };
  const toggleModels = async () => {
    if (modelPicker) { setModelPicker(false); return; }
    setAttachmentMenu(false); setModels([]); setModelsLoading(true); setModelPicker(true);
    try { const current = await openSession(); if (activeIdRef.current !== current.id || current.historyOnly) return; const result = await rpc(current.id, 'get_available_models'); if (activeIdRef.current === current.id && !lifecycle.isReleased(current.id)) setModels(result.models ?? result); } catch (e) { setModelPicker(false); showError(e); } finally { setModelsLoading(false); }
  };
  const chooseModel = async (model: Json) => {
    try { const current = await openSession(); const result = await rpc(current.id, 'set_model', { provider: model.provider, modelId: model.id }); lifecycle.update(current.id, current => ({ ...current, state: { ...current.state, model: result.model ?? result ?? model } })); setModelPicker(false); modelButton.current?.focus(); } catch (e) { showError(e); }
  };
  const answer = async (id: string, response: Json) => {
    const owner = lifecycle.current[id];
    const question = answerableQuestion(owner, response.id);
    if (!question || lifecycle.isReleased(id)) return;
    lifecycle.update(id, current => updateQuestionDraft(current, question.id, draft => ({ ...draft, submitting: true, error: undefined })));
    try {
      if (question.method !== 'open_url') await request('session.ui', { id, response });
      lifecycle.update(id, current => completeQuestion(current, question));
    } catch (error) {
      lifecycle.update(id, current => current.pending.includes(question) ? updateQuestionDraft(current, question.id, draft => ({ ...draft, submitting: false, error: error instanceof Error ? error.message : String(error) })) : current);
    }
  };
  const recallLast = () => { const list = session?.messages ?? []; for (let i = list.length - 1; i >= 0; i--) if (list[i].role === 'user') { const prompt = parseReferencedPrompt(displayUserPrompt(messageText(list[i]))); changeDraft(composerDraft, prompt.body, composerDraft.attachments, prompt.references); return; } };
  const prepareCommand = (text: string) => { changeDraft(composerDraft, text); setSettingsOpen(false); textarea.current?.focus(); };
  const reference = (value: string | ConversationReference[]) => { const additions = typeof value === 'string' ? [createMessageReference({ sessionId: session?.id, sessionPath: session?.path, sessionTitle: session?.title }, { id: `material:${crypto.randomUUID()}`, role: 'message', content: value })] : value; changeDraft(composerDraft, composerDraft.text, composerDraft.attachments, appendReferences(composerDraft.references, additions)); setSettingsOpen(false); requestAnimationFrame(() => textarea.current?.focus()); };
  const openSideQuestionThread = (id: string) => { setSelectedText(''); setSideQuestionSource(undefined); setSideQuestionThreadId(id); setSelectionNonce(value => value + 1); openDesktop('side-questions'); };
  const selectionAction = (text: string, action: 'quote' | 'note' | 'btw', context?: SelectionContext) => { if (action === 'quote') reference(context?.references ?? text); else { setSelectedText(text); setSideQuestionSource(context?.source); setSideQuestionThreadId(undefined); setSelectionNonce(value => value + 1); openDesktop(action === 'note' ? 'notes' : 'side-questions'); } };
  const askSideQuestion = async (question: string, recordId?: string, images?: { type: 'image'; data: string; mimeType: string }[]) => { const current = await openSession(); return { ...await rpc<Json>(current.id, 'btw', { question, recordId, images }), desktopSessionId: current.id }; };
  const cancelSideQuestion = async (recordId?: string, desktopSessionId?: string) => { const current = desktopSessionId ? lifecycle.current[desktopSessionId] : undefined; return current && !current.historyOnly && !lifecycle.isReleased(current.id) ? rpc<Json>(current.id, 'btw_cancel', { recordId }) : { cancelled: false }; };
  const exportMarkdown = async (mode: 'full' | 'results') => { if (!session) return; try { const directory = await pickPath(true); if (!directory) return; const path = `${directory}/${session.title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 80) || '会话'}-${mode === 'full' ? '记录' : '结果'}.md`; const fields = { path, title: session.title, mode, ...(session.path ? { sessionPath: session.path } : { messages: session.messages }) }; const result = await request<Json>('export.markdown', fields); if (result.existing && window.confirm(`覆盖已有文件？\n${path}`)) await request('export.markdown', { ...fields, overwrite: true, baseRevision: result.revision }); } catch (error) { showError(error); } };
  const exportSideQuestions = async (content: string, filename: string) => { const directory = await pickPath(true); if (!directory) return; const path = `${directory}/${filename.replace(/[<>:"/\\|?*]/g, '_').slice(0, 160)}`; const fields = { path, content }; const result = await request<Json>('export.markdown', fields); if (result.existing && window.confirm(`覆盖已有文件？\n${path}`)) await request('export.markdown', { ...fields, overwrite: true, baseRevision: result.revision }); };
  const restoreQueuedDraft = (id: string, text: string, restoredImages: ReturnType<typeof messageImages>) => {
    const value = getDraft(id);
    const prompt = parseReferencedPrompt(displayUserPrompt(text));
    changeDraft(value, value.text ? `${value.text}\n\n${prompt.body}` : prompt.body, [...value.attachments, ...restoredImages], appendReferences(value.references, prompt.references));
    if (activeIdRef.current === id) textarea.current?.focus();
  };
  const beginQueueAction = () => {
    if (actionPending.current) return false;
    actionPending.current = 'queue'; setMessageAction(true); return true;
  };
  const endQueueAction = () => { actionPending.current = false; setMessageAction(false); activateRuntime(); };
  const editMessage = async (message: Message) => {
    if (!session || !message.entryId || busy || sending || actionPending.current) return;
    const target: SessionTarget = { source: session, cwd, draftKey, revision: selectionRevision.current };
    const previousDraft = draft;
    const previousImages = attachments;
    const previousReferences = references;
    actionPending.current = 'edit'; setMessageAction(true); setError('');
    try {
      await lifecycle.run(async () => {
        const current = await prepareSession(false, target);
        const tree = await rpc(current.id, 'get_entries');
        const entry = editableEntry(tree, message.entryId);
        if (!entry) throw Error(t.messageChanged);
        if (selectionRevision.current !== target.revision && activeIdRef.current !== current.id) throw new DOMException('Cancelled', 'AbortError');
        const result = await rpc(current.id, 'branch', { entryId: entry.id });
        if (result.cancelled) return;
        const state = await rpc(current.id, 'get_state');
        const page = await lifecycle.readMessages(current.id, state.sessionFile);
        const previous = current.path ? { ...current, id: `history:${sessionPathKey(current.path)}`, historyOnly: true, status: 'ready', pending: [] } : undefined;
        if (previous) {
          drafts.current[previous.id] = createDraft(previousDraft, previousImages, previousReferences);
        }
        lifecycle.put({ ...clearQuestions(current), state, path: state.sessionFile, messages: normalizeHistoryMessages(page.messages, 'branch'), nextCursor: page.nextCursor, hidden: false, status: 'ready' });
        if (previous) lifecycle.put(previous);
        const prompt = parseReferencedPrompt(displayUserPrompt(result.text ?? ''));
        changeDraft(getDraft(current.id), prompt.body, messageImages(entry.message), prompt.references);
        if (activeIdRef.current === current.id || selectionRevision.current === target.revision) {
          setActiveId(current.id); showDraft(getDraft(current.id)); textarea.current?.focus();
        }
        await refreshHistory(current.cwd);
      });
    } catch (error) { showError(error); } finally { actionPending.current = false; setMessageAction(false); activateRuntime(); }
  };
  const retryTurn = async () => {
    if (!session || retryMessageIndex(session.messages) < 0 || busy || sending || actionPending.current) return;
    const target: SessionTarget = { source: session, cwd, draftKey, revision: selectionRevision.current };
    actionPending.current = 'retry'; setMessageAction(true); setError('');
    try { await lifecycle.run(async () => {
      const current = await prepareSession(false, target);
      await rpc(current.id, 'prompt', { message: '/retry' });
    }); } catch (error) { showError(error); } finally { actionPending.current = false; setMessageAction(false); activateRuntime(); }
  };
  const navigateCommand = (entry: CatalogEntry, args = ''): boolean => {
    const route = resolveCommand(entry, args);
    if (route.kind === 'prompt') return false;
    const run = (action: (current: SessionView) => Promise<void>) => { void lifecycle.run(async () => action(await prepareSession())).catch(showError); };
    if (route.kind === 'session') {
      if (route.action === 'new') run(async current => { await rpc(current.id, 'new_session'); lifecycle.update(current.id, clearQuestions); await lifecycle.refresh(current.id, true, t.newTitle); });
      if (route.action === 'close') void closeSession();
      if (route.action === 'restart') void reconnectSettingsSession().catch(showError);
      return true;
    }
    if (route.kind === 'rpc') {
      run(async current => { await rpc(current.id, route.command, route.params); await lifecycle.refresh(current.id, false, t.newTitle); });
      return true;
    }
    if (route.kind === 'terminal') {
      run(async current => { const state = await rpc(current.id, 'get_state'); if (!state.isSettled) throw Error(t.terminalText); setTerminalInput(route.input); setTerminalId(current.id); setSettingsOpen(false); });
      return true;
    }
    const surface = route.surface;
    if (surface?.startsWith('settings:')) { void openSettings(surface.slice('settings:'.length)); return true; }
    if (surface === 'models') { void toggleModels(); return true; }
    if (surface === 'context') {
      setSettingsOpen(false);
      if (session) setContextTarget(sessionKey(session));
      else run(async current => { setContextTarget(sessionKey(current)); });
      return true;
    }
    const panels: Record<string, InspectorTab> = { review: 'review', agents: 'agents', tasks: 'tasks', tree: 'tree' };
    if (surface && panels[surface]) { setSettingsOpen(false); setInspector(panels[surface]); return true; }
    if (surface === 'sessions') { setSettingsOpen(false); setSidebar(true); return true; }
    return false;
  };
  const earlier = async () => {
    if (!session) return;
    const id = session.id;
    const revision = selectionRevision.current;
    setHistoryPageLoading({ id, revision });
    try { await lifecycle.loadEarlier(id); }
    catch (error) { if (revision === selectionRevision.current) showError(error); }
    finally { setHistoryPageLoading(current => current?.id === id && current.revision === revision ? null : current); }
  };
  const later = async () => { if (!session?.path || !session.afterCursor) return; const id = session.id; const cursor = session.afterCursor; const revision = selectionRevision.current; setHistoryPageLoading({ id, revision }); try { const result = await request<Json>('session.after', { path: session.path, cursor, limit: 100 }); if (selectionRevision.current === revision) lifecycle.update(id, value => ({ ...value, messages: [...value.messages, ...normalizeHistoryMessages(result.messages, 'history').filter(message => !value.messages.some(existing => existing.id === message.id))], afterCursor: result.afterCursor })); } catch (error) { if (revision === selectionRevision.current) showError(error); } finally { setHistoryPageLoading(value => value?.id === id && value.revision === revision ? null : value); } };
  const activeQuestion = session?.pending[0];
  return <div className="window-frame"><WindowChrome language={bootstrap.preferences.language} /><div className={`app-shell ${sidebar ? '' : 'sidebar-hidden'}`}>
    {sidebar && <aside className="sidebar" inert={!!terminalId}><div className="brand-row"><div className="brand-mark">o<span>m</span>p</div><span>{t.desktop}</span><button className="icon-button" title={t.collapse} onClick={() => setSidebar(false)}><PanelLeftClose size={17} /></button></div>
      <button className="new-conversation" onClick={newConversation}><Plus size={17} /><span>{t.newSession}</span><kbd>{shortcutValue('new', bootstrap.preferences.shortcuts).replaceAll('+', ' ')}</kbd></button>
      <button className="nav-item" onClick={() => setCommandsOpen(true)}><Command size={16} /><span>{t.commands}</span><kbd>{shortcutValue('commands', bootstrap.preferences.shortcuts).replaceAll('+', ' ')}</kbd></button>
      <button className="nav-item" onClick={() => openDesktop('library')}><Search size={16} /><span>会话库</span></button>
      <button className="nav-item" disabled={!cwd} onClick={() => openDesktop('search')}><FolderOpen size={16} /><span>工作区工具</span></button>
      {pending.length > 0 && <button className="nav-item pending-nav" onClick={() => { setActiveId(pending[0].sessionId); setSettingsOpen(false); }}><Bell size={16} /><span>{t.pending}</span><b>{pending.length}</b></button>}
      <div className="section-label"><span>{t.projects}</span><button className="icon-button" title={t.addProject} onClick={addProject}><Plus size={15} /></button></div>
      <div className="session-search"><Search size={14} /><input ref={searchInput} type="search" aria-label={t.searchSessions} placeholder={t.searchSessions} value={sessionQuery} onChange={event => setSessionQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setSessionQuery(''); } }} />{sessionQuery && <button className="icon-button" title={t.clearSearch} onClick={() => { setSessionQuery(''); searchInput.current?.focus(); }}><X size={13} /></button>}</div>
      <div className="project-list">{sessionQuery.trim() ? <div className="session-search-results"><p className="search-status" role="status">{searchLoading ? t.loading : searchResults.length ? `${searchResults.length} ${t.session}` : t.noResults}</p>{searchResults.map(({ project: item, session: value }) => <button key={sessionKey(value)} className={`session-item ${session && sessionKey(session) === sessionKey(value) ? 'active' : ''}`} title={`${value.title || t.newTitle} / ${displayPath(item.path)}`} onClick={() => { setProject(item); if ('messages' in value) { setActiveId(value.id); setSettingsOpen(false); } else void loadHistory(value); }}><MessageSquare size={12} /><span className="search-result-text"><span>{value.title || t.newTitle}</span><small>{item.name}</small></span></button>)}</div> : bootstrap.projects.length ? bootstrap.projects.map(item => {
        const expanded = !!expandedProjects[item.path];
        const listId = `project-sessions-${encodeURIComponent(item.path)}`;
        const opened = allSessions.filter(value => !value.hidden && sessionPathKey(value.cwd) === sessionPathKey(item.path));
        const saved = [...new Map((history[item.path] ?? []).map(value => [sessionKey(value), value])).values()].filter(value => !allSessions.some(open => sessionKey(open) === sessionKey(value)));
        return <div key={item.path}>
          <div className="project-row"><button className="icon-button project-toggle" aria-expanded={expanded} aria-controls={listId} title={`${expanded ? t.collapseProject : t.expandProject} ${item.name}`} onClick={() => toggleProject(item)}><ChevronRight size={13} className={expanded ? 'rotate' : ''} /></button><button className={`project-item ${project?.path === item.path ? 'selected' : ''}`} title={displayPath(item.path)} onClick={() => selectProject(item)}><Folder size={15} /><span>{item.name}</span></button></div>
          {expanded && <div className="session-list" id={listId}>
            {opened.map(value => <button className={`session-item ${session && sessionKey(session) === sessionKey(value) ? 'active' : ''}`} key={sessionKey(value)} onClick={() => { setProject(item); setActiveId(value.id); setSettingsOpen(false); setModelPicker(false); setAttachmentMenu(false); }}>{value.historyOnly ? <MessageSquare size={12} /> : <span className={`session-status ${value.status}`} />}<span>{value.title}</span>{value.pending.length > 0 ? <i /> : unread[value.id] && <i className="done" />}</button>)}
            <SavedSessions sessions={saved} activeKey={session ? sessionKey(session) : ''} t={t} open={value => { setProject(item); void loadHistory(value); }} />
            {!opened.length && !saved.length && <p>{t.noSessions}</p>}
          </div>}
        </div>;
      }) : <p className="sidebar-empty">{t.noProjects}</p>}</div>
      <div className="sidebar-bottom"><button className={`nav-item ${settingsOpen ? 'selected' : ''}`} onClick={() => settingsOpen ? setSettingsOpen(false) : openSettings('general')}><Settings2 size={16} /><span>{t.settings}</span></button><div className="runtime-pill"><span className={`status-dot ${bootstrap.runtime ? 'connected' : ''}`} /><span>{bootstrap.runtime ? `OMP ${bootstrap.runtime.version}` : t.notInstalled}</span><span className="version">v{version}</span></div></div>
    </aside>}
    <main className="main-area">
      {settingsOpen ? <Suspense fallback={<PageSkeleton label={t.loading} />}><Settings key={`${settingsTab}:${settingsQuery}`} initialQuery={settingsQuery} initialTab={settingsTab} cwd={cwd} reconnectSession={cwd && bootstrap.runtime ? () => reconnectSettingsSession(true) : undefined} bootstrap={bootstrap} t={t} sessionId={configurationSession?.id} ensureSession={cwd && bootstrap.runtime ? () => openConfigurationSession().then(current => current.id) : undefined} update={setBootstrap} onError={showError} close={() => setSettingsOpen(false)} /></Suspense> : <>
        <WindowSlot inert={!!terminalId}><div className="header-location">{!sidebar && <button className="icon-button" title={t.expand} onClick={() => setSidebar(true)}><PanelLeftOpen size={18} /></button>}<Folder size={15} /><button onClick={addProject}>{project?.name ?? t.openProject}</button>{session && <><span className="breadcrumb-divider">/</span><span className="header-title">{session.title}</span></>}</div><div className="workspace-actions"><button className={`quiet-button ${inspector === 'review' ? 'active' : ''}`} disabled={!cwd} onClick={() => setInspector(value => value === 'review' ? null : 'review')}><FileDiff size={15} /><span>{t.review}</span></button><button className="icon-button" title={t.context} aria-haspopup="dialog" disabled={!cwd} onClick={() => navigateCommand({ name: 'context', kind: 'slash' })}><Layers size={17} /></button><details ref={moreMenu} className="more-menu" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }} onClick={event => { if ((event.target as Element).closest("button")) { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}><summary className="icon-button" title={t.more}><ChevronDown size={16} /></summary><div className="ui-menu">{(['files', 'agents', 'tasks', 'tree'] as InspectorTab[]).map(tab => <button disabled={!cwd} key={tab} onClick={() => setInspector(tab)}>{t[tab]}</button>)}<div className="menu-separator" />{(['search', 'git', 'worktrees', 'editor', 'terminals', 'artifacts', 'notes', 'side-questions', 'schedules'] as DesktopTab[]).map(tab => <button key={tab} disabled={!cwd} onClick={() => openDesktop(tab)}>{{ search: '项目搜索', git: 'Git 暂存与提交', worktrees: '工作树管理', editor: '多文件编辑', terminals: '独立终端', artifacts: '工具与产物', notes: '选段批注', 'side-questions': '连续旁问', schedules: '定时任务' }[tab as string]}</button>)}{bootstrap.preferences.features?.reviews && <button disabled={!session} onClick={() => openDesktop('structured-review')}>结构化评审与修复</button>}{bootstrap.preferences.features?.browser && <button onClick={() => openDesktop('browser')}>浏览器工作区</button>}{bootstrap.preferences.features?.cards && <button disabled={!session} onClick={() => session && request('card.open', { id: session.id }).catch(showError)}>浮动任务卡</button>}<button disabled={!session} onClick={() => void exportMarkdown('results')}>导出 Markdown 结果</button><button disabled={!session} onClick={() => void exportMarkdown('full')}>导出 Markdown 完整记录</button><button disabled={!session?.path || busy} onClick={() => session?.path && request('session.archive', { path: session.path, archived: true }).then(() => refreshHistory(cwd)).catch(showError)}>归档会话</button><div className="menu-separator" /><button disabled={!session || session.historyOnly || !session.state.isSettled} onClick={() => { setTerminalInput(''); setTerminalId(session!.id); }}>{t.terminal}</button><button disabled={!session || session.historyOnly} onClick={() => { if (session) rpc(session.id, 'export_html').then(result => prepareCommand(String(result.path ?? result))).catch(showError); }}>{t.export}</button><button disabled={!session || busy} onClick={() => prepareCommand('/fork')}>{t.fork}</button><button disabled={!session || busy} onClick={closeSession}>{t.close} {t.session}</button></div></details></div></WindowSlot>
        {error && <div className="error-banner" role="alert"><CircleHelp size={16} /><span>{localizeError(error, bootstrap.preferences.language)}</span><button className="icon-button" title={t.dismiss} onClick={() => setError('')}><X size={15} /></button></div>}
        {terminalId ? <Suspense fallback={<PageSkeleton label={t.loading} />}><TerminalPanel id={terminalId} initialCommand={terminalInput} t={t} onError={showError} close={closeTerminal} /></Suspense> : <ConversationLayout layoutKey={layoutKey} identity={session ? sessionKey(session) : draftKey}><GenerationRateProvider session={session} language={bootstrap.preferences.language} cache={rateCache.current}><SessionTodos session={session} language={bootstrap.preferences.language} /><SplitWorkspace key={contextKey || cwd} restoreKey={contextKey || cwd} language={bootstrap.preferences.language} closePreview={closePreview} preview={desktopTab ? <Suspense fallback={<PageSkeleton label={t.loading} />}><DesktopTools tab={desktopTab} cwd={cwd} language={bootstrap.preferences.language} preferences={bootstrap.preferences} session={session} selection={selectedText} selectionNonce={selectionNonce} sideQuestionSource={sideQuestionSource} sideQuestionThreadId={sideQuestionThreadId} onSideQuestionThreadsChange={threads => setSideQuestionMetadata({ key: sideQuestionsKey, threads })} onExportSideQuestions={exportSideQuestions} onTab={setDesktopTab} onClose={closePreview} onPrompt={prepareCommand} onEnsureSession={openSession} onSideQuestion={askSideQuestion} onCancelSideQuestion={cancelSideQuestion} onReference={reference} onArchiveChange={() => { for (const value of bootstrap.projects) void refreshHistory(value.path); }} onOpen={(summary, messageId) => { const project = bootstrap.projects.find(value => sessionPathKey(value.path) === sessionPathKey(summary.cwd)); if (project) setProject(project); void loadHistory(summary, messageId); }} onProject={path => void request<Project[]>('project.add', { path }).then(projects => { setBootstrap(current => ({ ...current, projects })); const project = projects.find(value => sessionPathKey(value.path) === sessionPathKey(path)); if (project) selectProject(project); }).catch(showError)} /></Suspense> : inspector && <Suspense fallback={<aside className="inspector"><PageSkeleton label={t.loading} /></aside>}><Inspector language={bootstrap.preferences.language} onSessionChanged={() => session ? lifecycle.refresh(session.id, true, t.newTitle) : Promise.resolve()} tab={inspector} session={session} cwd={cwd} t={t} onError={showError} close={() => setInspector(null)} send={prepareCommand} /></Suspense>}><div className="conversation-column">
          {session?.messages.length ? <Transcript key={sessionKey(session)} restoreKey={sessionKey(session)} pinNonce={pinNonce} showTurns={bootstrap.preferences.showTurnNumber !== false} targetMessageId={targetMessageId} onSelection={selectionAction} referenceSource={{ sessionId: session.id, sessionPath: session.path, sessionTitle: session.title }} onReference={reference} sideQuestionThreads={sideQuestionThreads} onSideQuestionThread={openSideQuestionThread} genui={{ configuration: normalizeGenUIConfiguration(bootstrap.preferences.generativeUI), sessionId: session.historyOnly ? undefined : session.id, sessionKey: sessionKey(session), cwd, language: bootstrap.preferences.language, onSend: text => send(text, true) }} messages={session.messages} t={t} busy={busy} runStartedAt={session.state.desktopRunStartedAt} activity={session.state.activity} actionsDisabled={sending || messageAction} onEdit={editMessage} onRetry={retryTurn} loadEarlier={session.nextCursor ? earlier : undefined} loadLater={session.afterCursor ? later : undefined} loadingEarlier={historyPageLoading?.id === session.id && historyPageLoading.revision === selectionRevision.current} /> : <div className="welcome"><div className="welcome-symbol"><span /><span /><span /></div><h1>{t.welcome}</h1><p>{t.welcomeText}</p>{!native && <p className="browser-note">{t.nativeOnly}</p>}<div className="starter-actions">{[[t.exploreAction, t.explorePrompt], [t.reviewAction, t.reviewPrompt], [t.buildAction, t.buildPrompt]].map(([label, prompt]) => <button key={label} onClick={() => { changeDraft(composerDraft, prompt); textarea.current?.focus(); }}>{label}<ArrowUpRight size={14} /></button>)}</div></div>}
          <div className="composer-area">{activeQuestion && session && <Question key={session.id + ":" + activeQuestion.id} question={activeQuestion} draft={questionDraft(session, activeQuestion)} change={update => lifecycle.update(session.id, current => updateQuestionDraft(current, activeQuestion.id, update))} language={bootstrap.preferences.language} t={t} answer={response => answer(session.id, response)} />}
            {session && <SessionActivity session={session} t={t} threads={sideQuestionThreads} onSideQuestion={openSideQuestionThread} refresh={() => lifecycle.refresh(session.id, false, t.newTitle)} onError={showError} />}
            {!bootstrap.runtime && !booting && <button className="setup-callout" onClick={() => openSettings('runtime')}><span className="setup-icon"><TerminalSquare size={18} /></span><span><strong>{t.installRuntime}</strong><small>{t.installText}</small></span><ArrowUpRight size={16} /></button>}
            {session && !session.historyOnly && <QueuedMessages key={sessionKey(session)} begin={beginQueueAction} end={endQueueAction} session={session} t={t} disabled={sending || messageAction} refresh={() => lifecycle.refresh(session.id, false, t.newTitle)} restore={(text, attachments) => restoreQueuedDraft(session.id, text, attachments)} onError={showError} />}
            <AttachmentDropZone language={bootstrap.preferences.language} disabled={sending || (messageAction && actionPending.current === 'edit')} busy={preparingAttachments > 0} addFiles={addAttachmentFiles} addPaths={addAttachmentPaths} addPrepared={addPreparedAttachments} onError={showError}><div className={`composer ${busy ? 'is-busy' : ''}`}>
              {attachments.length > 0 && <ComposerAttachments items={attachments} language={bootstrap.preferences.language} disabled={sending || (messageAction && actionPending.current === 'edit')} name={attachmentName} remove={removeAttachment} />}
              <ComposerReferences references={references} onRemove={id => changeDraft(composerDraft, composerDraft.text, composerDraft.attachments, composerDraft.references.filter(value => value.id !== id))} /><ComposerInput key={composerDraft.id} textareaRef={textarea} value={draft} onChange={text => changeDraft(composerDraft, text)} onSend={() => void send()} onRecall={recallLast} commands={slashCommands} language={bootstrap.preferences.language} onCommandsOpen={() => void loadSlashCommands()} disabled={messageAction && actionPending.current === 'edit'} cwd={cwd} t={t} />
              <div className="composer-toolbar"><input className="visually-hidden" type="file" tabIndex={-1} accept="image/*" multiple ref={fileInput} onChange={event => { const input = event.currentTarget; void addAttachmentFiles(Array.from(input.files ?? [])).catch(showError); input.value = ''; }} />
                <div className="attachment-control" ref={attachmentControl} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setAttachmentMenu(false); }}>
                  <button ref={addButton} disabled={messageAction && actionPending.current === 'edit'} className="icon-button" title={t.addContent} aria-haspopup="menu" aria-expanded={attachmentMenu} aria-controls={attachmentMenu ? 'attachment-menu' : undefined} onClick={() => { setAttachmentMenu(value => !value); setModelPicker(false); }}><Plus size={18} /></button>
                  <MotionPresence open={attachmentMenu}><div id="attachment-menu" className="attachment-menu ui-menu" role="menu" aria-label={t.addContent} onKeyDown={event => {
                    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
                    const index = items.indexOf(document.activeElement as HTMLButtonElement);
                    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length]?.focus(); }
                  }}>
                    <button role="menuitem" onClick={() => { setAttachmentMenu(false); addButton.current?.focus(); fileInput.current?.click(); }}><ImagePlus size={16} />{t.addImage}</button>
                    <button role="menuitem" disabled={!native} title={!native ? t.nativeOnly : undefined} onClick={() => void attachPath(false)}><FilePlus2 size={16} />{t.attachFile}</button>
                    <button role="menuitem" disabled={!native} title={!native ? t.nativeOnly : undefined} onClick={() => void attachPath(true)}><FolderPlus size={16} />{t.attachFolder}</button>
                  </div></MotionPresence>
                </div>
                <div className="model-control" ref={modelControl}><button ref={modelButton} className="model-button" aria-haspopup="dialog" aria-expanded={modelPicker} disabled={!cwd || !bootstrap.runtime} onClick={toggleModels}>{session?.state.model?.name ?? session?.state.model?.id ?? t.chooseModel}<ChevronDown size={12} /></button><MotionPresence open={modelPicker}><div className="model-picker ui-menu" role="dialog" aria-label={t.chooseModel}><input autoFocus aria-label={t.search} placeholder={t.search} value={modelQuery} onChange={e => setModelQuery(e.target.value)} /><div>{models.filter(model => `${model.name} ${model.id} ${model.provider}`.toLowerCase().includes(modelQuery.toLowerCase())).map(model => <button key={`${model.provider}:${model.id}`} aria-pressed={session?.state.model?.id === model.id && session?.state.model?.provider === model.provider} onClick={() => chooseModel(model)}><strong>{model.name ?? model.id}</strong><small>{model.provider}</small></button>)}{!models.length && <p role="status">{modelsLoading ? t.loading : t.noModels}</p>}{models.length > 0 && !models.some(model => `${model.name} ${model.id} ${model.provider}`.toLowerCase().includes(modelQuery.toLowerCase())) && <p>{t.noResults}</p>}</div></div></MotionPresence></div>
                {session && !session.historyOnly && <Select label={t.effort} value={session.state.thinkingLevel ?? 'medium'} options={Object.entries(t.effortLevels).map(([value, label]) => ({ value, label }))} onChange={level => rpc(session.id, 'set_thinking_level', { level }).then(() => lifecycle.update(session.id, current => ({ ...current, state: { ...current.state, thinkingLevel: level } }))).catch(showError)} />}
                <GenerationRate /><span className="spacer" />{busy && <Select label={t.queued} value={delivery} onChange={setDelivery} options={[{ value: 'steer', label: t.steer }, { value: 'follow_up', label: t.followUp }]} />}{busy && session && !draft && !attachments.length && !references.length ? <button className="send-button stop-button" title={t.stop} onClick={() => rpc(session.id, 'abort').catch(showError)}><Square size={14} fill="currentColor" /></button> : <button className="send-button" title={t.send} disabled={sending || preparingAttachments > 0 || messageAction || (!draft.trim() && !attachments.length && !references.length) || !cwd || !bootstrap.runtime} onClick={() => send()}>{sending || messageAction ? <LoaderCircle size={16} className="spin" /> : <ArrowUp size={18} />}</button>}
              </div>
            </div></AttachmentDropZone><div className="composer-footnote"><span><span className={`status-dot ${busy ? 'working' : 'connected'}`} />{busy ? t.running : session?.pending.length ? t.waiting : t.ready}</span><span>{cwd ? <><FolderOpen size={12} />{displayPath(cwd)}</> : <button onClick={addProject}>{t.openProject}</button>}</span></div>
            <SessionUsage session={session} language={bootstrap.preferences.language} cache={usageCache.current} onAdvanced={() => { if (session) setContextTarget(sessionKey(session)); }} />
          </div>
        </div></SplitWorkspace></GenerationRateProvider></ConversationLayout>}
      </>}
      {settingsOpen && pending.length > 0 && <div className="settings-question"><Question key={pending[0].sessionId + ":" + pending[0].question.id} question={pending[0].question} draft={questionDraft(sessions[pending[0].sessionId], pending[0].question)} change={update => lifecycle.update(pending[0].sessionId, current => updateQuestionDraft(current, pending[0].question.id, update))} language={bootstrap.preferences.language} t={t} answer={response => answer(pending[0].sessionId, response)} /></div>}{settingsOpen && error && <div className="error-toast" role="alert"><span>{localizeError(error, bootstrap.preferences.language)}</span><button className="icon-button" title={t.dismiss} onClick={() => setError("")}><X size={15} /></button></div>}
    </main>
    <Suspense fallback={null}><MotionPresence open={commandsOpen}><CommandPalette language={bootstrap.preferences.language} onSessionChanged={id => lifecycle.refresh(id, true, t.newTitle)} ensureSession={async () => (await openSession()).id} navigate={navigateCommand} t={t} cwd={cwd} sessionId={session && !session.historyOnly ? session.id : undefined} close={() => setCommandsOpen(false)} send={prepareCommand} onError={showError} /></MotionPresence></Suspense>
    {session && <Suspense fallback={null}><MotionPresence open={contextTarget === contextKey}><ContextInspector key={`${contextKey}:${session.id}:${session.historyOnly}`} session={session} language={bootstrap.preferences.language} close={() => { setContextTarget(null); textarea.current?.focus(); }} /></MotionPresence></Suspense>}
  </div></div>;
}
