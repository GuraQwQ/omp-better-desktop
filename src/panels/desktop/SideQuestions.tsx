import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { onDesktopEvent, pickPath, request } from '../../lib/bridge';
import { copy } from '../../lib/i18n';
import type { ComposerAttachment } from '../../lib/attachments';
import type { ConversationReference } from '../../lib/references';
import ComposerAttachments from '../../components/ComposerAttachments';
import { sideQuestionStorage as storage } from '../../lib/side-question-storage';
import { applySideQuestionRecord, createSideQuestionThread, emptySideQuestions, exportSideQuestions, latestNativeSideQuestionTurn, markSideQuestionThreadRead, rememberSideQuestionNativeTurns, sideQuestionContextSize, sideQuestionPrompt, sideQuestionSourceKey, sideQuestionSourceLabel, sideQuestionThreadSummaries, sideQuestionThreadTitle, type SideQuestionRecord, type SideQuestionSource, type SideQuestionState, type SideQuestionThread, type SideQuestionThreadSummary } from '../../lib/side-questions';
import type { BtwHistoryRecord } from '../../generated/rpc-wire';
import type { Json, Language, SessionSummary, SessionView } from '../../lib/types';

const Markdown = lazy(() => import('../../components/MarkdownBody'));
const seenActions = new Map<string, string>();
interface Props {
  cwd: string; session?: SessionView; selection?: string; selectionNonce?: number; language: Language;
  sideQuestionSource?: SideQuestionSource; sideQuestionThreadId?: string;
  onSideQuestionThreadsChange?: (threads: SideQuestionThreadSummary[]) => void;
  onSideQuestion: (question: string, recordId?: string, images?: { type: 'image'; data: string; mimeType: string }[]) => Promise<Json>;
  onCancelSideQuestion: (recordId?: string, desktopSessionId?: string) => Promise<Json>;
  onExportSideQuestions: (content: string, filename: string) => Promise<void>;
  onOpen: (session: SessionSummary, messageId?: string) => void;
  onReference: (text: string | ConversationReference[]) => void;
}
interface Edits { draft: number; quote: number; attachments: number; cleared?: boolean; source?: boolean }
interface Pending {
  id: string; threadId: string; epoch: number; generation: number; prompt: string;
  nativeId?: string; runtimeId?: string; turnIndex: number; cancelRequested: boolean;
  acknowledged: boolean; terminal: boolean; versions: Edits; done: Promise<void>; resolve: () => void;
}
interface Preparation { threadId: string; cancelled: boolean }
const statusLabels = { running: ['回答中', 'Answering'], complete: ['已完成', 'Complete'], cancelled: ['已取消', 'Cancelled'], error: ['失败', 'Failed'], interrupted: ['已中断', 'Interrupted'] };

export default function SideQuestions(props: Props) {
  const { session, language } = props;
  const zh = language === 'zh';
  const key = `side-questions:${session?.path ?? session?.id ?? `scratch:${props.cwd}`}`;
  const [state, setState] = useState<SideQuestionState>(emptySideQuestions);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [saveStatus, setSaveStatus] = useState(() => storage.status(key));
  const [exporting, setExporting] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');
  const panel = useRef<HTMLElement>(null);
  const [cancelFailure, setCancelFailure] = useState<{ message: string; recordId?: string; runtimeId: string } | null>(null);
  const stateRef = useRef(state), readyRef = useRef(false), active = useRef(true), epoch = useRef(0);
  const pending = useRef<Pending | null>(null), incomingThread = useRef<string | undefined>(undefined);
  const preparing = useRef<Preparation | null>(null);
  const edits = useRef(new Map<string, Edits>());
  const fallback = useRef(createSideQuestionThread({ kind: 'whole' }));
  const callbacks = useRef(props); callbacks.current = props;
  const versions = (id: string) => { let value = edits.current.get(id); if (!value) { value = { draft: 0, quote: 0, attachments: 0 }; edits.current.set(id, value); } return value; };
  const currentThread = state.threads.find(thread => thread.id === state.activeThreadId) ?? state.threads[0] ?? fallback.current;
  const update = (next: SideQuestionState) => { next = rememberSideQuestionNativeTurns(next, stateRef.current); stateRef.current = next; setState(next); if (readyRef.current) storage.update(key, next); };
  const patch = (id: string, change: (thread: SideQuestionThread) => SideQuestionThread) => {
    const current = stateRef.current;
    const found = current.threads.find(thread => thread.id === id);
    if (found) update({ ...current, threads: current.threads.map(thread => thread.id === id ? change(thread) : thread) });
    else if (id === fallback.current.id) update({ ...current, threads: [...current.threads, change(fallback.current)], activeThreadId: id });
  };
  const finish = (job: Pending) => { if (pending.current === job) { pending.current = null; if (active.current) setBusy(false); } job.resolve(); };
  const cancelPreparation = () => { if (preparing.current) { preparing.current.cancelled = true; preparing.current = null; if (active.current) setBusy(false); } };
  const restoreDraft = (thread: SideQuestionThread, record: SideQuestionRecord, job: Pending) => {
    const current = versions(thread.id);
    return { ...thread, draft: current.draft === job.versions.draft ? record.question : thread.draft, quote: current.quote === job.versions.quote ? record.quote : thread.quote, attachments: current.attachments === job.versions.attachments ? record.attachments ?? [] : thread.attachments };
  };

  const accept = (record: BtwHistoryRecord, runtimeId?: string) => {
    const job = pending.current, latest = latestNativeSideQuestionTurn(record);
    const matched = job && latest.question === job.prompt && (!job.nativeId || job.nativeId === record.id) ? job : null;
    if (matched) { matched.nativeId = record.id; matched.runtimeId = runtimeId ?? matched.runtimeId; matched.turnIndex = record.followUps?.length ?? 0; matched.terminal ||= latest.status !== 'running'; }
    let changed = false;
    const threads = stateRef.current.threads.map(thread => {
      let owned = false;
      const records = thread.records.map(local => {
        const isPending = matched?.threadId === thread.id && matched.id === local.id;
        if (local.nativeId !== record.id && !isPending) return local;
        owned = true;
        return applySideQuestionRecord(isPending ? { ...local, nativeId: record.id, turnIndex: matched.turnIndex } : local, record, runtimeId);
      });
      if (!owned) return thread;
      changed = true;
      let next = { ...thread, records, updatedAt: Date.now() };
      if (matched?.threadId === thread.id) {
        if (matched.generation === thread.generation) next.nativeTopicId = record.id;
        const local = records.find(item => item.id === matched.id);
        if (local && ['error', 'cancelled', 'interrupted'].includes(local.status)) next = restoreDraft(next, local, matched);
      }
      return next;
    });
    if (changed) update({ ...stateRef.current, threads });
    if (matched?.acknowledged && matched.terminal) finish(matched);
  };
  const acceptRef = useRef(accept); acceptRef.current = accept;

  const cancel = async (job: Pending) => {
    job.cancelRequested = true;
    if (!job.runtimeId) return;
    try {
      const result = await callbacks.current.onCancelSideQuestion(job.nativeId, job.runtimeId);
      if (!active.current || job.epoch !== epoch.current) return;
      if (result.cancelled) {
        job.terminal = true;
        patch(job.threadId, thread => {
          const record = thread.records.find(item => item.id === job.id);
          const next = { ...thread, records: thread.records.map(item => item.id === job.id ? { ...item, status: 'cancelled' as const, updatedAt: Date.now() } : item) };
          return record ? restoreDraft(next, record, job) : next;
        });
        if (job.acknowledged) finish(job);
      }
    } catch (error) {
      if (active.current && job.epoch === epoch.current) setCancelFailure({ message: error instanceof Error ? error.message : String(error), recordId: job.nativeId, runtimeId: job.runtimeId });
    }
  };
  const switchThread = (id: string) => {
    if (!stateRef.current.threads.some(thread => thread.id === id)) return;
    incomingThread.current = id;
    update({ ...stateRef.current, activeThreadId: id }); setError('');
    if (preparing.current && preparing.current.threadId !== id) cancelPreparation();
    const job = pending.current;
    if (job && job.threadId !== id && !job.cancelRequested) void cancel(job);
  };
  const activateSource = (source: SideQuestionSource, quote: string, inject: boolean) => {
    const id = sideQuestionSourceKey(source), current = stateRef.current;
    const existing = current.threads.find(thread => sideQuestionSourceKey(thread.source) === id);
    if (!existing) update({ ...current, threads: [...current.threads, createSideQuestionThread(source, quote)], activeThreadId: id });
    if (inject) { const edit = versions(id); edit.quote++; edit.source = true; patch(id, thread => ({ ...thread, quote, sourceQuote: quote })); }
    switchThread(existing?.id ?? id);
  };

  const load = async () => {
    const scope = epoch.current; setLoadError('');
    try {
      const loaded = await storage.load(key), saved = storage.peek(key) ?? loaded;
      if (!active.current || scope !== epoch.current) return;
      const threads = [...saved.threads];
      for (const transient of stateRef.current.threads) {
        const index = threads.findIndex(thread => thread.id === transient.id), edit = versions(transient.id);
        if (index < 0) threads.push(transient);
        else if (edit.cleared) threads[index] = { ...transient, generation: threads[index].generation + 1, createdAt: threads[index].createdAt };
        else threads[index] = { ...threads[index], ...(edit.draft ? { draft: transient.draft } : {}), ...(edit.quote ? { quote: transient.quote } : {}), ...(edit.source ? { sourceQuote: transient.sourceQuote } : {}), ...(edit.attachments ? { attachments: transient.attachments } : {}) };
      }
      if (!threads.length) threads.push(fallback.current);
      readyRef.current = true; setReady(true);
      update({ ...saved, threads, activeThreadId: incomingThread.current && threads.some(thread => thread.id === incomingThread.current) ? incomingThread.current : saved.activeThreadId ?? threads[0].id });
    } catch (error) { if (active.current && scope === epoch.current) setLoadError(error instanceof Error ? error.message : String(error)); }
  };
  useEffect(() => {
    active.current = true; epoch.current++; readyRef.current = false; setReady(false);
    const unsubscribe = storage.subscribe(key, () => {
      if (!active.current) return;
      setSaveStatus(storage.status(key));
      const saved = storage.peek(key);
      if (readyRef.current && saved && saved !== stateRef.current) { stateRef.current = saved; setState(saved); }
    });
    void load();
    return () => {
      active.current = false; epoch.current++; unsubscribe();
      if (preparing.current) { preparing.current.cancelled = true; preparing.current = null; }
      const job = pending.current;
      if (job) {
        job.cancelRequested = true;
        if (job.runtimeId) void callbacks.current.onCancelSideQuestion(job.nativeId, job.runtimeId).catch(() => {});
        if (!job.nativeId && readyRef.current) storage.update(key, { ...stateRef.current, threads: stateRef.current.threads.map(thread => thread.id === job.threadId ? { ...thread, records: thread.records.map(record => record.id === job.id ? { ...record, status: 'interrupted' } : record) } : thread) });
      }
      void storage.flush(key).catch(() => {});
    };
  }, [key]);
  const sourceKey = props.sideQuestionSource ? sideQuestionSourceKey(props.sideQuestionSource) : 'whole';
  useEffect(() => {
    const action = JSON.stringify([props.sideQuestionThreadId ?? sourceKey, props.selectionNonce, props.selection]);
    if (seenActions.get(key) === action) return;
    if (props.sideQuestionThreadId) {
      if (!readyRef.current) return;
      switchThread(props.sideQuestionThreadId);
    } else if (props.sideQuestionSource || props.selection) activateSource(props.sideQuestionSource ?? { kind: 'whole' }, props.selection ?? '', true);
    else return;
    seenActions.set(key, action);
  }, [key, sourceKey, props.sideQuestionThreadId, props.selectionNonce, props.selection, ready]);
  const summaries = sideQuestionThreadSummaries(state), summaryKey = JSON.stringify(summaries);
  useEffect(() => { if (ready) callbacks.current.onSideQuestionThreadsChange?.(summaries); }, [ready, summaryKey]);
  useEffect(() => {
    const visibility = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  useEffect(() => {
    if (!ready || !visible) return;
    const id = currentThread.id;
    const frame = requestAnimationFrame(() => {
      const bounds = panel.current?.getBoundingClientRect();
      if (!active.current || !readyRef.current || document.visibilityState !== 'visible' || !bounds?.width || !bounds.height || stateRef.current.activeThreadId !== id) return;
      const thread = stateRef.current.threads.find(thread => thread.id === id);
      if (!thread) return;
      const read = markSideQuestionThreadRead(thread);
      if (read !== thread) patch(id, () => read);
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, visible, currentThread.id, currentThread.records]);
  useEffect(() => {
    let disposed = false, unlisten: (() => void) | undefined;
    void onDesktopEvent(({ sessionId, event }) => {
      if (disposed || !active.current) return;
      if (event.type === 'btw_record' && event.record) acceptRef.current(event.record as BtwHistoryRecord, sessionId);
      else if (event.type === 'btw_delta' && typeof event.delta === 'string') {
        const job = pending.current;
        if (job && job.nativeId === event.recordId) patch(job.threadId, thread => ({ ...thread, records: thread.records.map(record => record.id === job.id && record.status === 'running' ? { ...record, answer: record.answer + event.delta, updatedAt: Date.now() } : record) }));
      }
    }).then(dispose => { if (disposed) dispose(); else unlisten = dispose; }).catch(error => { if (!disposed) setError(error instanceof Error ? error.message : String(error)); });
    return () => { disposed = true; unlisten?.(); };
  }, [key]);
  const refresh = async () => {
    const currentSession = callbacks.current.session, scope = epoch.current;
    if (!currentSession || currentSession.historyOnly || !stateRef.current.threads.some(thread => thread.records.some(record => record.nativeId && record.status === 'running'))) return;
    try {
      const result = await request<{ records: BtwHistoryRecord[] }>('session.rpc', { id: currentSession.id, command: { type: 'get_btw_history' } });
      if (active.current && scope === epoch.current) result.records.forEach(record => acceptRef.current(record, currentSession.id));
    } catch (error) { if (active.current && scope === epoch.current) setError(error instanceof Error ? error.message : String(error)); }
  };
  useEffect(() => { if (ready) void refresh(); }, [ready, session?.id, session?.historyOnly]);

  const ask = async () => {
    if (!readyRef.current || pending.current || preparing.current || attaching) return;
    const thread = stateRef.current.threads.find(item => item.id === stateRef.current.activeThreadId);
    if (!thread?.draft.trim()) return;
    if (stateRef.current.threads.some(item => item.records.some(record => record.status === 'running'))) { await refresh(); return; }
    const id = crypto.randomUUID(), now = Date.now();
    const seedAttachments = thread.nativeTopicId ? [] : thread.records.flatMap(record => record.attachments ?? []);
    const preparation: Preparation = { threadId: thread.id, cancelled: false }, scope = epoch.current, initialVersions = { ...versions(thread.id) };
    preparing.current = preparation; setBusy(true); setError('');
    let payload: { message: string; images: { type: 'image'; data: string; mimeType: string }[]; warnings?: string[] };
    try {
      payload = await request('attachment.btw', { message: sideQuestionPrompt(thread.nativeTopicId ? [] : thread.records, thread.quote, thread.draft, id, { ...thread.source, sessionId: session?.id, sessionPath: session?.path, sessionTitle: session?.title }), attachments: [...seedAttachments, ...thread.attachments] });
      if (!active.current || scope !== epoch.current || preparation.cancelled || preparing.current !== preparation || stateRef.current.activeThreadId !== thread.id || stateRef.current.threads.find(item => item.id === thread.id)?.generation !== thread.generation) {
        if (preparing.current === preparation) cancelPreparation();
        return;
      }
    } catch (error) {
      if (active.current && scope === epoch.current && preparing.current === preparation) { setError(error instanceof Error ? error.message : String(error)); cancelPreparation(); }
      return;
    }
    preparing.current = null;
    let resolve!: () => void; const done = new Promise<void>(yes => { resolve = yes; });
    const job: Pending = { id, threadId: thread.id, epoch: epoch.current, generation: thread.generation, prompt: payload.message.trim(), nativeId: thread.nativeTopicId, runtimeId: session?.historyOnly ? undefined : session?.id,
      turnIndex: thread.nativeTopicId ? thread.records.filter(record => record.nativeId === thread.nativeTopicId).length : 0,
      cancelRequested: false, acknowledged: false, terminal: false, versions: initialVersions, done, resolve };
    const local: SideQuestionRecord = { id, nativeId: thread.nativeTopicId, turnIndex: job.turnIndex, question: thread.draft, quote: thread.quote, attachments: thread.attachments, warnings: payload.warnings ?? [], answer: '', status: 'running', createdAt: now, updatedAt: now };
    pending.current = job; setBusy(true); setError(''); patch(thread.id, item => ({ ...item, records: [...item.records, local], updatedAt: now }));
    try {
      const result = await callbacks.current.onSideQuestion(job.prompt, thread.nativeTopicId, payload.images);
      const record = result.record as BtwHistoryRecord | undefined;
      if (!record?.id) throw new Error(zh ? '旁问未返回记录，请重试。' : 'No side-question record was returned. Retry.');
      job.nativeId = record.id; job.runtimeId = typeof result.desktopSessionId === 'string' ? result.desktopSessionId : job.runtimeId; job.acknowledged = true;
      if (job.cancelRequested && job.runtimeId) await cancel(job);
      if (!active.current || job.epoch !== epoch.current) { finish(job); return; }
      acceptRef.current(record, job.runtimeId);
      patch(thread.id, item => {
        const accepted = item.records.find(record => record.id === id), edit = versions(thread.id);
        return accepted && ['running', 'complete'].includes(accepted.status) ? { ...item, draft: edit.draft === job.versions.draft ? '' : item.draft, quote: edit.quote === job.versions.quote ? '' : item.quote, attachments: edit.attachments === job.versions.attachments ? [] : item.attachments } : item;
      });
      if (job.terminal) finish(job);
    } catch (error) {
      if (active.current && job.epoch === epoch.current) {
        const message = error instanceof Error ? error.message : String(error);
        patch(thread.id, item => ({ ...item, nativeTopicId: undefined, records: item.records.map(record => record.id === id ? { ...record, status: job.cancelRequested ? 'cancelled' : 'error', error: job.cancelRequested ? undefined : message, updatedAt: Date.now() } : record) }));
        if (!job.cancelRequested) setError(message);
      }
      finish(job);
    }
  };
  const cancelRecord = async (record: SideQuestionRecord) => {
    const job = pending.current;
    if (job?.id === record.id) { await cancel(job); return; }
    if (!record.runtimeId || !record.nativeId) return;
    try { await callbacks.current.onCancelSideQuestion(record.nativeId, record.runtimeId); await refresh(); }
    catch (error) { setCancelFailure({ message: error instanceof Error ? error.message : String(error), recordId: record.nativeId, runtimeId: record.runtimeId }); }
  };
  const clear = () => {
    incomingThread.current = currentThread.id;
    if (preparing.current?.threadId === currentThread.id) cancelPreparation();
    const edit = versions(currentThread.id); edit.draft++; edit.quote++; edit.attachments++; edit.cleared = true;
    patch(currentThread.id, thread => ({ ...thread, records: [], draft: '', quote: '', attachments: [], nativeTopicId: undefined, generation: thread.generation + 1, updatedAt: Date.now() }));
    setError(''); if (readyRef.current) void storage.flush(key).catch(() => {});
    const job = pending.current;
    if (job?.threadId === currentThread.id) void cancel(job);
    else currentThread.records.filter(record => record.status === 'running' && record.runtimeId && record.nativeId).forEach(record => { void cancelRecord(record); });
  };
  const attach = async (directory: boolean) => {
    const targetId = currentThread.id, scope = epoch.current, generation = currentThread.generation; setAttaching(true);
    try {
      const path = await pickPath(directory); if (!path || !active.current || scope !== epoch.current) return;
      const items = await request<ComposerAttachment[]>('attachment.paths', { paths: [path] });
      if (!active.current || scope !== epoch.current || stateRef.current.threads.find(thread => thread.id === targetId)?.generation !== generation) return;
      versions(targetId).attachments++;
      patch(targetId, thread => ({ ...thread, attachments: [...thread.attachments, ...items.filter(item => !thread.attachments.some(old => old.path && old.path === item.path))] }));
    } catch (error) { if (active.current && scope === epoch.current) setError(error instanceof Error ? error.message : String(error)); }
    finally { if (active.current && scope === epoch.current) setAttaching(false); }
  };
  const exportAll = async () => {
    const scope = epoch.current; setExporting(true);
    try { await props.onExportSideQuestions(exportSideQuestions(stateRef.current, session?.title ?? '会话'), `${session?.title ?? '会话'}-全部旁问.md`); }
    catch (error) { if (active.current && scope === epoch.current) setError(error instanceof Error ? error.message : String(error)); }
    finally { if (active.current && scope === epoch.current) setExporting(false); }
  };
  const running = busy || state.threads.some(thread => thread.records.some(record => record.status === 'running'));
  return <section ref={panel} className="side-questions" aria-label={zh ? '连续旁问' : 'Side questions'}>
    <div className="side-question-toolbar"><label className="side-question-thread-picker">{zh ? '讨论' : 'Discussion'}<select aria-label={zh ? '旁问讨论' : 'Side-question discussion'} value={currentThread.id} onChange={event => switchThread(event.target.value)}>{(state.threads.length ? state.threads : [currentThread]).map(thread => <option value={thread.id} key={thread.id}>{sideQuestionThreadTitle(thread)} · {sideQuestionSourceLabel(thread.source)} · {thread.records.length}</option>)}</select></label><button className="quiet-button" onClick={() => activateSource({ kind: 'whole' }, '', false)}>{zh ? '会话讨论' : 'Whole chat'}</button><button className="quiet-button" disabled={!ready || exporting} onClick={() => void exportAll()}>{exporting ? zh ? '正在导出…' : 'Exporting…' : zh ? '导出全部' : 'Export all'}</button></div>
    <div className="side-question-source"><span>{currentThread.source.kind === 'selection' ? `${zh ? '来源' : 'Source'} · ${sideQuestionSourceLabel(currentThread.source)}` : currentThread.source.kind === 'saved' ? zh ? '已保存讨论' : 'Saved discussion' : zh ? '整个会话' : 'Whole chat'}</span>{currentThread.source.kind === 'selection' && session?.path && <button className="quiet-button" title={currentThread.source.messageId} onClick={() => props.onOpen({ path: session.path!, id: session.id, cwd: session.cwd, title: session.title }, currentThread.source.kind === 'selection' ? currentThread.source.messageId : undefined)}>{zh ? '回到原消息' : 'Go to source'}</button>}</div>
    <div className="side-question-toolbar"><p className="desktop-tool-hint">{zh ? `本讨论上下文 ${sideQuestionContextSize(currentThread).toLocaleString()} 字符` : `${sideQuestionContextSize(currentThread).toLocaleString()} context characters`}</p><button className="quiet-button" onClick={clear}>{zh ? '清空上下文' : 'Clear context'}</button></div>
    <div className="side-question-body">
    {loadError && <p className="desktop-error" role="alert">{loadError}<button className="quiet-button" onClick={() => void load()}>{zh ? '重试读取' : 'Retry loading'}</button></p>}
    {error && <p className="desktop-error" role="alert">{error}<button className="quiet-button" onClick={() => { setError(''); void refresh(); }}>{zh ? '刷新回答' : 'Refresh answers'}</button></p>}
    {cancelFailure && <p className="desktop-error" role="alert">{cancelFailure.message}<button className="quiet-button" onClick={() => {
      const target = cancelFailure, scope = epoch.current;
      void props.onCancelSideQuestion(target.recordId, target.runtimeId).then(result => { if (!active.current || scope !== epoch.current) return; setCancelFailure(null); if (result.cancelled && pending.current?.runtimeId === target.runtimeId) { const job = pending.current; job.terminal = true; if (job.acknowledged) finish(job); } void refresh(); }).catch(error => { if (active.current && scope === epoch.current) setCancelFailure({ ...target, message: error instanceof Error ? error.message : String(error) }); });
    }}>{zh ? '重试取消' : 'Retry cancellation'}</button></p>}
    {saveStatus.error && <p className="desktop-error" role="alert">{zh ? '保存失败：' : 'Save failed: '}{saveStatus.error}<button className="quiet-button" onClick={() => void storage.flush(key).catch(() => {})}>{zh ? '重试保存' : 'Retry saving'}</button></p>}
    <div className="side-question-history">{currentThread.records.map(record => <article className="desktop-record side-question-record" key={record.id} data-side-question-id={record.id}>
      <header><span>{statusLabels[record.status][zh ? 0 : 1]}</span><button className="quiet-button" disabled={record.status === 'running'} aria-label={zh ? `移除旁问 ${record.question}` : `Remove question ${record.question}`} onClick={() => patch(currentThread.id, thread => ({ ...thread, records: thread.records.filter(item => item.id !== record.id), nativeTopicId: undefined, generation: thread.generation + 1 }))}>{zh ? '移除' : 'Remove'}</button></header>
      {record.quote && <blockquote>{record.quote}</blockquote>}<p className="side-question-question">{record.question}</p>
      {record.attachments?.length ? <div className="side-question-record-attachments">{record.attachments.map((item, index) => <span key={index} title={item.path}>{item.name}</span>)}</div> : null}
      {!!record.warnings?.length && <div className="side-question-material-note" role="status"><span>{zh ? '附件材料' : 'Attachment material'}</span><ul>{record.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}
      {record.answer && <div className="side-question-answer"><Suspense fallback={<p className="preserve-lines">{record.answer}</p>}><Markdown text={record.answer} t={copy(language)} live={record.status === 'running'} /></Suspense></div>}
      {record.error && <p className="desktop-error">{record.error}</p>}
      <div className="desktop-tool-actions">{record.status === 'running' ? <button className="quiet-button" onClick={() => void cancelRecord(record)}>{pending.current?.cancelRequested ? zh ? '正在取消…' : 'Cancelling…' : zh ? '取消旁问' : 'Cancel question'}</button> : <button className="quiet-button" onClick={() => { const edit = versions(currentThread.id); edit.draft++; edit.quote++; edit.attachments++; patch(currentThread.id, thread => ({ ...thread, draft: record.question, quote: record.quote, attachments: record.attachments ?? [] })); }}>{zh ? '编辑再问' : 'Edit question'}</button>}{record.answer && <button className="quiet-button" onClick={() => props.onReference(`${record.question}\n\n${record.answer}`)}>{zh ? '引用到草稿' : 'Quote to draft'}</button>}</div>
    </article>)}</div>
    {!currentThread.records.length && <p className="desktop-tool-hint">{zh ? '围绕当前来源提问；问答与草稿保存在这个讨论中。' : 'Ask about this source. Questions, answers, and drafts stay in this discussion.'}</p>}
    <label className="desktop-field">{zh ? '旁问选段' : 'Selection'}<textarea aria-label={zh ? '旁问选段' : 'Selection'} rows={3} value={currentThread.quote} onChange={event => { versions(currentThread.id).quote++; incomingThread.current = currentThread.id; patch(currentThread.id, thread => ({ ...thread, quote: event.target.value })); }} /></label>
    <ComposerAttachments items={currentThread.attachments} disabled={false} language={language} name={item => `side-attachment-${currentThread.id.replace(/[^a-zA-Z0-9_-]/g, '_')}-${item.name.replace(/[^a-zA-Z0-9_-]/g, '_')}-${currentThread.attachments.indexOf(item)}`} remove={index => { versions(currentThread.id).attachments++; patch(currentThread.id, thread => ({ ...thread, attachments: thread.attachments.filter((_, itemIndex) => itemIndex !== index) })); }} />
    <div className="desktop-tool-actions"><button className="quiet-button" disabled={attaching} onClick={() => void attach(false)}>{zh ? '添加文件' : 'Add file'}</button><button className="quiet-button" disabled={attaching} onClick={() => void attach(true)}>{zh ? '添加目录' : 'Add folder'}</button></div>
    </div>
    <div className="side-question-compose">
    <label className="desktop-field">{zh ? '旁问草稿' : 'Question draft'}<textarea aria-label={zh ? '旁问草稿' : 'Question draft'} rows={3} value={currentThread.draft} onChange={event => { versions(currentThread.id).draft++; incomingThread.current = currentThread.id; patch(currentThread.id, thread => ({ ...thread, draft: event.target.value })); }} /></label>
    <div className="side-question-toolbar"><button className="primary-button" disabled={!ready || running || attaching || !currentThread.draft.trim()} onClick={() => void ask()}>{zh ? '发送旁问' : 'Ask question'}</button>{preparing.current && <button className="quiet-button" onClick={cancelPreparation}>{zh ? '取消准备' : 'Cancel preparation'}</button>}<span className="desktop-tool-hint" role="status">{!ready ? zh ? '正在恢复…' : 'Restoring…' : preparing.current ? zh ? '正在准备附件…' : 'Preparing attachments…' : pending.current?.cancelRequested ? zh ? '正在结束上一个旁问…' : 'Ending the previous question…' : saveStatus.error ? zh ? '待重试保存' : 'Save pending retry' : saveStatus.dirty ? zh ? '正在保存…' : 'Saving…' : zh ? '已保存' : 'Saved'}</span></div>
    </div>
  </section>;
}
