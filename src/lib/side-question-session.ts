import { request } from './bridge';
import type { ComposerAttachment } from './attachments';
import type { BtwHistoryRecord } from '../generated/rpc-wire';
import type { DesktopEvent, Json, SessionView } from './types';
import { sideQuestionStorage, type SideQuestionStorage } from './side-question-storage';
import { applySideQuestionRecord, createSideQuestionThread, emptySideQuestions, latestNativeSideQuestionTurn, markSideQuestionThreadRead, mergeSideQuestionHistory, rememberSideQuestionNativeTurns, sideQuestionPrompt, sideQuestionSourceKey, type SideQuestionRecord, type SideQuestionSource, type SideQuestionState, type SideQuestionThread } from './side-questions';

type Fields = Pick<SideQuestionThread, 'draft' | 'quote' | 'attachments'>;
type Edits = Record<keyof Fields, number> & { cleared?: boolean; source?: boolean };
type Cancel = (recordId?: string, runtimeId?: string) => Promise<Json>;
interface Context {
  session?: SessionView;
  send: (question: string, recordId?: string, images?: { type: 'image'; data: string; mimeType: string }[]) => Promise<Json>;
  cancel: Cancel;
}
interface Pending {
  id: string; threadId: string; generation: number; prompt: string; versions: Edits;
  nativeId?: string; runtimeId?: string; turnIndex: number; acknowledged: boolean; terminal: boolean; cancelRequested: boolean; cancel: Cancel;
}
interface Snapshot {
  state: SideQuestionState; ready: boolean; busy: boolean; preparing: boolean; cancelling: boolean;
  error: string; loadError: string;
  cancelFailure: { message: string; recordId?: string; runtimeId: string } | null;
  saveStatus: ReturnType<SideQuestionStorage['status']>;
}
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const backend = {
  prepare: (value: Json) => request<{ message: string; images: { type: 'image'; data: string; mimeType: string }[]; warnings?: string[] }>('attachment.btw', value),
  history: (id: string) => request<{ records: BtwHistoryRecord[] }>('session.rpc', { id, command: { type: 'get_btw_history' } }),
};

export class SideQuestionSession {
  private snapshot: Snapshot;
  private listeners = new Set<() => void>();
  private edits = new Map<string, Edits>();
  private pending?: Pending;
  private preparation?: { threadId: string };
  private context?: Context;
  private incomingThread?: string;
  private loading?: Promise<void>;
  private action = '';
  private cancelRetry?: Cancel;
  private fallback = createSideQuestionThread({ kind: 'whole' });
  private unsubscribe: () => void;

  constructor(readonly key: string, private storage = sideQuestionStorage, private transport = backend, private release?: (action: string) => void, action = '') {
    this.action = action;
    this.snapshot = { state: storage.peek(key) ?? emptySideQuestions(), ready: false, busy: false, preparing: false, cancelling: false, error: '', loadError: '', cancelFailure: null, saveStatus: storage.status(key) };
    this.unsubscribe = storage.subscribe(key, () => {
      this.publish({ saveStatus: storage.status(key), ...(this.snapshot.ready && storage.peek(key) ? { state: storage.peek(key)! } : {}) });
      this.releaseIdle();
    });
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); this.releaseIdle(); }; };
  configure(context: Context) { this.context = context; }
  get current() { const state = this.snapshot.state; return state.threads.find(thread => thread.id === state.activeThreadId) ?? state.threads[0] ?? this.fallback; }
  private publish(change: Partial<Snapshot>) { this.snapshot = { ...this.snapshot, ...change }; this.listeners.forEach(listener => listener()); }
  private update(next: SideQuestionState) {
    const state = rememberSideQuestionNativeTurns(next, this.snapshot.state);
    this.publish({ state });
    if (this.snapshot.ready) this.storage.update(this.key, state);
  }
  private versions(id: string) { let value = this.edits.get(id); if (!value) { value = { draft: 0, quote: 0, attachments: 0 }; this.edits.set(id, value); } return value; }
  private patch(id: string, change: (thread: SideQuestionThread) => SideQuestionThread) {
    const state = this.snapshot.state;
    const current = state.threads.find(thread => thread.id === id);
    if (current) { const next = change(current); if (next !== current) this.update({ ...state, threads: state.threads.map(thread => thread.id === id ? next : thread) }); }
    else if (id === this.fallback.id) this.update({ ...state, threads: [...state.threads, change(this.fallback)], activeThreadId: id });
  }
  edit(id: string, fields: Partial<Fields>) {
    for (const key of Object.keys(fields) as (keyof Fields)[]) this.versions(id)[key]++;
    this.incomingThread = id; this.patch(id, thread => ({ ...thread, ...fields }));
  }
  activate(source: SideQuestionSource, quote = '', inject = false) {
    const state = this.snapshot.state, key = sideQuestionSourceKey(source);
    const id = state.threads.find(thread => sideQuestionSourceKey(thread.source) === key)?.id ?? key;
    if (!state.threads.some(thread => thread.id === id)) this.update({ ...state, threads: [...state.threads, createSideQuestionThread(source, quote)], activeThreadId: id });
    if (inject) { this.versions(id).quote++; this.versions(id).source = true; this.patch(id, thread => ({ ...thread, quote, sourceQuote: quote })); }
    this.select(id);
  }
  select(id: string) {
    if (!this.snapshot.state.threads.some(thread => thread.id === id)) return;
    this.incomingThread = id; this.update({ ...this.snapshot.state, activeThreadId: id }); this.publish({ error: '' });
    if (this.preparation?.threadId !== id) this.cancelPreparation();
    if (this.pending && this.pending.threadId !== id && !this.pending.cancelRequested) void this.cancel(this.pending);
  }
  selectAction(action: string, threadId?: string, source?: SideQuestionSource, quote = '') {
    if (this.action === action || threadId && !this.snapshot.ready) return;
    if (threadId) this.select(threadId); else if (source || quote) this.activate(source ?? { kind: 'whole' }, quote, true); else return;
    this.action = action;
  }
  markRead(id: string) { this.patch(id, markSideQuestionThreadRead); }
  load() {
    if (this.snapshot.ready) return Promise.resolve();
    return this.loading ??= this.read().finally(() => { this.loading = undefined; if (!this.context) void this.flush(); });
  }
  private async read() {
    this.publish({ loadError: '' });
    try {
      await this.storage.load(this.key);
      const saved = this.storage.peek(this.key)!, threads = [...saved.threads];
      for (const transient of this.snapshot.state.threads) {
        const index = threads.findIndex(thread => thread.id === transient.id), edit = this.versions(transient.id);
        if (index < 0) threads.push(transient);
        else if (edit.cleared) threads[index] = { ...transient, generation: threads[index].generation + 1, createdAt: threads[index].createdAt };
        else threads[index] = { ...threads[index], ...(edit.draft ? { draft: transient.draft } : {}), ...(edit.quote ? { quote: transient.quote } : {}), ...(edit.source ? { sourceQuote: transient.sourceQuote } : {}), ...(edit.attachments ? { attachments: transient.attachments } : {}) };
      }
      if (!threads.length) threads.push(this.fallback);
      this.publish({ ready: true });
      this.update({ ...saved, threads, activeThreadId: this.incomingThread && threads.some(thread => thread.id === this.incomingThread) ? this.incomingThread : saved.activeThreadId ?? threads[0].id });
    } catch (error) { this.publish({ loadError: message(error) }); }
  }
  private restore(thread: SideQuestionThread, record: SideQuestionRecord, job: Pending) {
    if (thread.generation !== job.generation) return thread;
    const edit = this.versions(thread.id);
    return { ...thread, draft: edit.draft === job.versions.draft ? record.question : thread.draft, quote: edit.quote === job.versions.quote ? record.quote : thread.quote, attachments: edit.attachments === job.versions.attachments ? record.attachments ?? [] : thread.attachments };
  }
  private finish(job: Pending) { if (this.pending === job) { this.pending = undefined; this.publish({ busy: false, cancelling: false }); void this.flush(); } }
  private accept(record: BtwHistoryRecord, runtimeId?: string) {
    const job = this.pending, latest = latestNativeSideQuestionTurn(record);
    const matched = job && latest.question === job.prompt && (!job.nativeId || job.nativeId === record.id) ? job : undefined;
    if (matched) {
      matched.nativeId = record.id; matched.runtimeId = runtimeId ?? matched.runtimeId; matched.turnIndex = record.followUps?.length ?? 0; matched.terminal ||= latest.status !== 'running';
      this.patch(matched.threadId, thread => {
        if (!thread.records.some(local => local.id === matched.id)) return thread;
        const records = thread.records.map(local => local.id === matched.id ? applySideQuestionRecord({ ...local, nativeId: record.id, turnIndex: matched.turnIndex }, record, runtimeId) : local);
        let next: SideQuestionThread = { ...thread, records, ...(thread.generation === matched.generation ? { nativeTopicId: record.id } : {}), updatedAt: Date.now() };
        const local = records.find(item => item.id === matched.id);
        if (local && ['error', 'cancelled', 'interrupted'].includes(local.status)) next = this.restore(next, local, matched);
        return next;
      });
    }
    const state = this.snapshot.state, next = mergeSideQuestionHistory(state, [record], runtimeId);
    if (next !== state) this.update(next);
    if (matched?.acknowledged && matched.terminal) this.finish(matched);
  }
  async mergeHistory(records: BtwHistoryRecord[], runtimeId?: string) {
    if (!this.snapshot.ready) await this.load();
    if (this.snapshot.ready) records.forEach(record => this.accept(record, runtimeId));
  }
  event({ sessionId, event }: DesktopEvent) {
    if (!this.snapshot.ready) return;
    if (event.type === 'btw_record' && event.record) {
      const job = this.pending, known = this.snapshot.state.threads.some(thread => thread.records.some(record => record.nativeId === event.record.id && record.runtimeId === sessionId));
      if (known || job && latestNativeSideQuestionTurn(event.record).question === job.prompt) this.accept(event.record, sessionId);
    } else if (event.type === 'btw_delta' && typeof event.delta === 'string') {
      const job = this.pending;
      if (job && job.nativeId === event.recordId && job.runtimeId === sessionId) this.patch(job.threadId, thread => ({ ...thread, records: thread.records.map(record => record.id === job.id && record.status === 'running' ? { ...record, answer: record.answer + event.delta, updatedAt: Date.now() } : record) }));
    }
  }
  async refresh() {
    const session = this.context?.session;
    this.publish({ error: '' });
    if (!session || session.historyOnly || !this.snapshot.state.threads.some(thread => thread.records.some(record => record.nativeId && record.status === 'running'))) return;
    try { const result = await this.transport.history(session.id); await this.mergeHistory(result.records, session.id); }
    catch (error) { this.publish({ error: message(error) }); }
  }
  cancelPreparation = () => { if (this.preparation) { this.preparation = undefined; this.publish({ preparing: false, busy: !!this.pending }); } };
  async ask() {
    if (!this.snapshot.ready || this.pending || this.preparation || !this.context) return;
    const thread = this.current, context = this.context;
    if (!thread.draft.trim()) return;
    if (this.snapshot.state.threads.some(item => item.records.some(record => record.status === 'running'))) { await this.refresh(); return; }
    const id = crypto.randomUUID(), now = Date.now(), versions = { ...this.versions(thread.id) };
    const preparation = { threadId: thread.id }; this.preparation = preparation; this.publish({ busy: true, preparing: true, error: '' });
    let payload: Awaited<ReturnType<typeof backend.prepare>>;
    try {
      payload = await this.transport.prepare({ message: sideQuestionPrompt(thread.nativeTopicId ? [] : thread.records, thread.quote, thread.draft, id, { ...thread.source, sessionId: context.session?.id, sessionPath: context.session?.path, sessionTitle: context.session?.title }), attachments: [...(thread.nativeTopicId ? [] : thread.records.flatMap(record => record.attachments ?? [])), ...thread.attachments] });
    } catch (error) { if (this.preparation === preparation) { this.publish({ error: message(error) }); this.cancelPreparation(); } return; }
    if (this.preparation !== preparation || this.current.id !== thread.id || this.current.generation !== thread.generation) {
      if (this.preparation === preparation) this.cancelPreparation();
      return;
    }
    this.preparation = undefined;
    const job: Pending = { id, threadId: thread.id, generation: thread.generation, versions, prompt: payload.message.trim(), nativeId: thread.nativeTopicId, runtimeId: context.session?.historyOnly ? undefined : context.session?.id, turnIndex: thread.nativeTopicId ? thread.records.filter(record => record.nativeId === thread.nativeTopicId).length : 0, acknowledged: false, terminal: false, cancelRequested: false, cancel: context.cancel };
    this.pending = job; this.publish({ preparing: false });
    this.patch(thread.id, item => ({ ...item, records: [...item.records, { id, nativeId: job.nativeId, runtimeId: job.runtimeId, turnIndex: job.turnIndex, question: thread.draft, quote: thread.quote, attachments: thread.attachments, warnings: payload.warnings ?? [], answer: '', status: 'running', createdAt: now, updatedAt: now }], updatedAt: now }));
    try {
      const result = await context.send(job.prompt, thread.nativeTopicId, payload.images), record = result.record as BtwHistoryRecord | undefined;
      if (!record?.id) throw new Error('旁问未返回记录，请重试。 / No side-question record was returned. Retry.');
      job.nativeId = record.id; job.runtimeId = typeof result.desktopSessionId === 'string' ? result.desktopSessionId : job.runtimeId; job.acknowledged = true;
      this.accept(record, job.runtimeId);
      this.patch(thread.id, item => {
        const accepted = item.records.find(record => record.id === id), edit = this.versions(thread.id);
        return item.generation === job.generation && accepted && ['running', 'complete'].includes(accepted.status) ? { ...item, draft: edit.draft === versions.draft ? '' : item.draft, quote: edit.quote === versions.quote ? '' : item.quote, attachments: edit.attachments === versions.attachments ? [] : item.attachments } : item;
      });
      if (job.cancelRequested && !job.terminal) await this.cancel(job);
      if (job.terminal) this.finish(job);
    } catch (error) {
      this.patch(thread.id, item => ({ ...item, nativeTopicId: undefined, records: item.records.map(record => record.id === id ? { ...record, status: job.cancelRequested ? 'cancelled' : 'error', error: job.cancelRequested ? undefined : message(error), updatedAt: Date.now() } : record) }));
      if (!job.cancelRequested) this.publish({ error: message(error) }); this.finish(job);
    }
  }
  private failedCancel(error: unknown, recordId: string | undefined, runtimeId: string, cancel: Cancel) {
    this.cancelRetry = cancel; this.publish({ cancelFailure: { message: message(error), recordId, runtimeId } });
  }
  private async cancel(job: Pending) {
    job.cancelRequested = true; this.publish({ cancelling: true });
    if (!job.runtimeId) return;
    try {
      const result = await job.cancel(job.nativeId, job.runtimeId);
      if (result.cancelled) {
        job.terminal = true;
        this.patch(job.threadId, thread => {
          const record = thread.records.find(record => record.id === job.id);
          const next = { ...thread, records: thread.records.map(record => record.id === job.id ? { ...record, status: 'cancelled' as const, updatedAt: Date.now() } : record) };
          return record ? this.restore(next, record, job) : next;
        });
        this.publish({ cancelFailure: null });
        if (job.acknowledged) this.finish(job);
      }
    } catch (error) { this.failedCancel(error, job.nativeId, job.runtimeId, job.cancel); }
  }
  async cancelRecord(record: SideQuestionRecord) {
    if (this.pending?.id === record.id) return this.cancel(this.pending);
    if (!record.runtimeId || !record.nativeId || !this.context) return;
    const cancel = this.context.cancel;
    try { await cancel(record.nativeId, record.runtimeId); await this.refresh(); }
    catch (error) { this.failedCancel(error, record.nativeId, record.runtimeId, cancel); }
  }
  async retryCancel() {
    const target = this.snapshot.cancelFailure;
    if (!target || !this.cancelRetry) return;
    if (this.pending?.runtimeId === target.runtimeId && this.pending.nativeId === target.recordId) return this.cancel(this.pending);
    try { await this.cancelRetry(target.recordId, target.runtimeId); this.publish({ cancelFailure: null }); await this.refresh(); }
    catch (error) { this.publish({ cancelFailure: { ...target, message: message(error) } }); }
  }
  clear(id: string) {
    const thread = this.snapshot.state.threads.find(thread => thread.id === id) ?? this.current;
    if (this.preparation?.threadId === id) this.cancelPreparation();
    const edit = this.versions(id); edit.draft++; edit.quote++; edit.attachments++; edit.cleared = true;
    this.patch(id, thread => ({ ...thread, records: [], draft: '', quote: '', attachments: [], nativeTopicId: undefined, generation: thread.generation + 1, updatedAt: Date.now() }));
    this.publish({ error: '' }); void this.flush();
    if (this.pending?.threadId === id) void this.cancel(this.pending);
    else thread.records.filter(record => record.status === 'running').forEach(record => { void this.cancelRecord(record); });
  }
  remove(threadId: string, recordId: string) {
    if (this.preparation?.threadId === threadId) this.cancelPreparation();
    this.patch(threadId, thread => ({ ...thread, records: thread.records.filter(record => record.id !== recordId), nativeTopicId: undefined, generation: thread.generation + 1 }));
  }
  addAttachments(id: string, generation: number, items: ComposerAttachment[]) {
    const thread = this.snapshot.state.threads.find(thread => thread.id === id);
    if (thread?.generation === generation) this.edit(id, { attachments: [...thread.attachments, ...items.filter(item => !thread.attachments.some(old => old.path && old.path === item.path))] });
  }
  private releaseIdle() {
    // StrictMode 会同步清理再挂载，下一微任务确认仍空闲后才释放订阅。
    queueMicrotask(() => {
      if (!this.release || this.context || this.pending || this.preparation || this.loading || this.listeners.size || this.snapshot.cancelFailure || this.storage.status(this.key).dirty) return;
      this.unsubscribe(); this.release(this.action); this.release = undefined;
    });
  }
  async flush() { if (this.snapshot.ready) await this.storage.flush(this.key).catch(() => {}); this.releaseIdle(); }
  detach() {
    this.context = undefined; this.cancelPreparation();
    if (this.pending && !this.pending.cancelRequested) void this.cancel(this.pending);
    void this.flush();
  }
}

const sessions = new Map<string, SideQuestionSession>();
const seenActions = new Map<string, string>();
export const sideQuestions = {
  get(key: string) {
    let session = sessions.get(key);
    if (!session) {
      session = new SideQuestionSession(key, sideQuestionStorage, backend, action => { seenActions.set(key, action); sessions.delete(key); }, seenActions.get(key));
      sessions.set(key, session);
    }
    return session;
  },
  event(event: DesktopEvent) { sessions.forEach(session => session.event(event)); },
  async mergeHistory(key: string, records: BtwHistoryRecord[], runtimeId?: string) {
    const session = sessions.get(key);
    if (session) await session.mergeHistory(records, runtimeId);
    else await sideQuestionStorage.change(key, state => mergeSideQuestionHistory(state, records, runtimeId));
  },
};
