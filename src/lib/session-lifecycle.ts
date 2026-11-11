import { request, rpc } from './bridge';
import { clearQuestions, completeQuestion } from './question-draft';
import { prependHistoryPage } from './session-history';
import { sessionKey, sessionPathKey, storeSession } from './session-identity';
import { applyEvent, applyEvents, enrichToolMessages, normalizeHistoryMessages } from './session-state';
import type { DesktopEvent, Json, SessionView } from './types';

type Sessions = Record<string, SessionView>;
type Preparation = { source?: SessionView; cwd: string; title: string; visible?: boolean; restart?: boolean; canReuse?: (session: SessionView) => boolean };
type Snapshot = { valid: boolean; state: Set<string>; messages: boolean; path: boolean; title: boolean; replaceMessages: boolean };
const confirmedState: Record<string, string[]> = {
  agent_start: ['isStreaming', 'isSettled', 'desktopRunAnchor', 'desktopRunStartedAt'],
  agent_end: ['isStreaming', 'isSettled'],
  session_settled: ['isStreaming', 'isSettled', 'activity', 'desktopRunStartedAt'],
  prompt_result: ['isStreaming', 'isSettled', 'activity', 'desktopRunStartedAt'],
  auto_compaction_end: ['activity'], auto_retry_end: ['activity'],
  queue_update: ['queuedMessages'], available_commands_update: ['availableCommands'], todo_auto_clear: ['todoPhases'],
};

export class SessionLifecycle {
  private values: Sessions = {};
  private pending = new Map<string, Json[]>();
  private released = new Set<string>();
  private snapshots = new Map<string, Set<Snapshot>>();
  private latest = new Map<string, Snapshot>();
  private identities = new Map<string, number>();
  private transcripts = new Map<string, string>();
  private historyPages = new Map<string, Promise<void>>();
  private opening = new Map<string, { promise: Promise<SessionView>; intent: { visible: boolean } }>();
  private recovering = new Map<string, Json>();
  private replacements = new Map<string, string>();
  private queue: Promise<void> = Promise.resolve();
  private frame = 0;

  constructor(private publish: (sessions: Sessions) => void, private transport = { request, rpc }) {}

  get current(): Sessions { this.flush(); return this.values; }
  isReleased(id: string): boolean { return this.released.has(id); }

  configuration(source: SessionView | undefined, cwd: string): SessionView | undefined {
    const values = Object.values(this.current);
    return source && !source.historyOnly && !this.isReleased(source.id) ? source : values.find(value => value.hidden && !value.historyOnly && !this.isReleased(value.id) && !value.messages.length && sessionPathKey(value.cwd) === sessionPathKey(cwd));
  }

  prepare(options: Preparation): Promise<SessionView> {
    const values = Object.values(this.current);
    let source = options.source && (this.values[this.replacements.get(options.source.id) ?? options.source.id] ?? values.find(value => sessionKey(value) === sessionKey(options.source!)) ?? { ...options.source, historyOnly: true });
    const cwd = options.cwd || source?.cwd || '';
    const key = source?.path ? sessionKey(source) : `new:${source?.id ?? sessionPathKey(cwd)}`;
    const pending = this.opening.get(key);
    if (pending) { pending.intent.visible ||= !!options.visible; return pending.promise; }
    if (source && !source.historyOnly && !this.isReleased(source.id) && !options.restart) return Promise.resolve(source);
    const intent = { visible: !!options.visible };
    const promise = (async () => {
      if (options.restart && source && !source.historyOnly && !this.isReleased(source.id)) {
        const closed = await this.transport.request<Json>('session.close', { id: source.id });
        source = { ...clearQuestions(this.current[source.id] ?? source), path: closed.path ?? undefined, historyOnly: true };
        this.put(source);
      }
      const existing = Object.values(this.current).find(value => !value.historyOnly && !this.isReleased(value.id) && (source?.path ? sessionKey(value) === sessionKey(source) : value.hidden && !value.messages.length && sessionPathKey(value.cwd) === sessionPathKey(cwd) && (options.canReuse?.(value) ?? true)));
      const recovering = this.recovering.get(key);
      if (recovering && this.isReleased(recovering.id)) this.recovering.delete(key);
      const opened = existing ?? this.recovering.get(key) ?? await this.transport.request<Json>('session.open', { cwd, path: source?.path });
      let page: Json | undefined;
      let btw: Json = { records: [] };
      if (!this.isReleased(opened.id)) {
        try {
          if (source?.path) page = await this.readMessages(opened.id, opened.path ?? source.path, Math.max(100, source.messages.length));
          if (!this.isReleased(opened.id)) btw = await this.transport.rpc(opened.id, 'get_btw_history');
        } catch (error) {
          if (!this.isReleased(opened.id)) {
            // 补齐成功后才替换可见身份；失败的连接留在内部供重试。
            this.recovering.set(key, opened);
            throw error;
          }
        }
      }
      const live = existing && !this.isReleased(opened.id) ? this.current[existing.id] : undefined;
      const value: SessionView = { id: opened.id, cwd, path: opened.path ?? source?.path, title: opened.state?.sessionName ?? source?.title ?? options.title,
        messages: page ? normalizeHistoryMessages(page.messages, 'reopen') : source?.messages ?? live?.messages ?? [], nextCursor: page ? page.nextCursor : source?.nextCursor,
        state: { ...opened.state, ...live?.state, btwRecords: btw.records }, status: 'ready', pending: live?.pending ?? [], questionDrafts: live?.questionDrafts,
        historyOnly: this.isReleased(opened.id), hidden: intent.visible ? false : source ? !!source.hidden : true };
      this.put(value, source?.id);
      this.recovering.delete(key);
      return this.current[value.id] ?? value;
    })();
    this.opening.set(key, { promise, intent });
    void promise.finally(() => { if (this.opening.get(key)?.promise === promise) this.opening.delete(key); }).catch(() => {});
    return promise;
  }

  run<T>(action: () => Promise<T>): Promise<T> {
    const result = this.queue.then(action);
    this.queue = result.then(() => {}, () => {});
    return result;
  }

  update(id: string, update: (session: SessionView) => SessionView): void {
    this.flush();
    if (this.values[id]) { this.write(update(this.values[id])); this.publishNow(); }
  }

  put(session: SessionView, replaceId?: string): void {
    this.flush();
    this.invalidate(session.id);
    if (replaceId && replaceId !== session.id) {
      const aliases = [...this.replacements].filter(([, id]) => id === replaceId).map(([alias]) => alias);
      this.erase(replaceId);
      for (const alias of [...aliases, replaceId]) this.replacements.set(alias, session.id);
    }
    if (session.historyOnly) session = clearQuestions(session);
    else this.released.delete(session.id);
    this.write(session);
    if (this.values[session.id]) this.transcripts.set(session.id, sessionKey(session));
    this.flush();
    this.publishNow();
  }

  remove(id: string): void {
    this.flush();
    this.erase(id);
    this.publishNow();
  }

  private erase(id: string): void {
    this.invalidate(id);
    this.released.add(id);
    this.pending.delete(id);
    for (const [alias, target] of this.replacements) if (target === id) this.replacements.delete(alias);
    this.transcripts.delete(id);
    if (!this.values[id]) return;
    const next = { ...this.values }; delete next[id]; this.values = next;
    this.schedule();
  }

  event({ sessionId: id, event }: DesktopEvent): void {
    const released = event.type === 'desktop_status' && ['released', 'disconnected'].includes(event.status);
    if (released) {
      this.released.add(id);
      this.invalidate(id);
      if (!this.values[id]) { this.pending.delete(id); return; }
    }
    if (!released && this.isReleased(id) || event.type.startsWith('terminal_')) return;
    if (!this.pending.has(id)) this.pending.set(id, []);
    this.pending.get(id)!.push(event);
    if (this.values[id]) this.schedule();
  }

  async readMessages(id: string, path: string, limit = 100): Promise<Json> {
    const page = await this.transport.request<Json>('session.history', { path, limit: Math.min(limit, 256) });
    while (page.nextCursor && page.messages.length < limit) {
      const earlier = await this.transport.request<Json>('session.history', { path, cursor: page.nextCursor, limit: Math.min(limit - page.messages.length, 256) });
      page.messages = [...earlier.messages, ...page.messages]; page.nextCursor = earlier.nextCursor;
    }
    if (page.messages.some((message: Json) => Array.isArray(message.content) && message.content.some((block: Json) => block.type === 'image' && typeof block.data === 'string' && block.data.startsWith('blob:')))) {
      const tree = await this.transport.rpc(id, 'get_entries');
      const entries = new Map<string, Json>(tree.entries.map((entry: Json) => [entry.id, entry]));
      page.messages = page.messages.map((message: Json) => ({ ...(entries.get(message.id)?.message ?? message), id: message.id }));
    }
    return page;
  }

  async refresh(id: string, replaceMessages = false, newTitle = ''): Promise<void> {
    const source = this.current[id];
    if (!source || source.historyOnly || this.isReleased(id)) return;
    const previous = this.latest.get(id);
    replaceMessages ||= !!previous?.replaceMessages;
    const snapshot: Snapshot = { valid: true, state: new Set(), messages: false, path: false, title: false, replaceMessages };
    if (previous) previous.valid = false;
    this.latest.set(id, snapshot);
    if (!this.snapshots.has(id)) this.snapshots.set(id, new Set());
    this.snapshots.get(id)!.add(snapshot);
    const valid = () => { const current = this.current[id]; return snapshot.valid && !!current && !current.historyOnly && !this.isReleased(id); };
    try {
      const state = await this.transport.rpc(id, 'get_state');
      if (!valid()) return;
      const path = state.sessionFile === null ? undefined : state.sessionFile ?? this.current[id].path;
      const history = replaceMessages && path ? await this.readMessages(id, path, Math.max(100, this.current[id].messages.length)) : undefined;
      if (!valid()) return;
      const btw = replaceMessages ? await this.transport.rpc(id, 'get_btw_history') : undefined;
      if (!valid()) return;
      const current = this.current[id];
      const mergedState = { ...current.state, ...state, ...(btw ? { btwRecords: btw.records } : {}) };
      // 请求期间触及的字段保留实时值，即使它经历变化后又回到原值。
      for (const key of snapshot.state) {
        if (key in current.state) mergedState[key] = current.state[key]; else delete mergedState[key];
      }
      const nextPath = snapshot.path ? current.path : state.sessionFile === null ? undefined : state.sessionFile ?? current.path;
      if (snapshot.path) mergedState.sessionFile = nextPath ?? null;
      const empty = replaceMessages && state.sessionFile === null && nextPath === undefined;
      const transcriptKey = sessionKey({ id, path: nextPath });
      const replaced = this.transcripts.get(id) !== transcriptKey;
      const retained = empty ? source.pending.reduce<SessionView>((retained, question) => completeQuestion(retained, question), current) :
        current.path && (!nextPath || sessionPathKey(nextPath) !== sessionPathKey(current.path)) ? clearQuestions(current) : current;
      const priorMessages = empty ? new Set(source.messages.map(message => message.id)) : undefined;
      let messages = history ? normalizeHistoryMessages(history.messages, 'reload') : undefined;
      if (replaced && messages && snapshot.messages) {
        const previousIds = new Set(source.messages.map(message => message.id));
        const merged = new Map(messages.map(message => [message.id, message]));
        const results = new Map(messages.filter(message => message.toolCallId).map(message => [message.toolCallId, message]));
        for (const message of current.messages) if (!previousIds.has(message.id)) {
          const previous = merged.get(message.id) ?? (message.toolCallId ? results.get(message.toolCallId) : undefined);
          const id = previous?.id ?? message.id;
          merged.set(id, { ...previous, ...message, id, entryId: message.entryId ?? previous?.entryId });
        }
        messages = enrichToolMessages([...merged.values()]);
      }
      this.write({ ...retained, state: mergedState, title: snapshot.title ? current.title : state.sessionName ?? (replaceMessages && newTitle ? newTitle : current.title), path: nextPath,
        ...(empty ? { messages: snapshot.messages ? current.messages.filter(message => !priorMessages!.has(message.id)) : [], nextCursor: undefined } :
          messages && (!snapshot.messages || replaced) ? { messages, nextCursor: history!.nextCursor } : {}) });
      if (empty || messages && (!snapshot.messages || replaced)) this.transcripts.set(id, transcriptKey);
    } catch (error) { if (valid()) throw error; }
    finally {
      const reads = this.snapshots.get(id); reads?.delete(snapshot); if (!reads?.size) this.snapshots.delete(id);
      if (this.latest.get(id) === snapshot) this.latest.delete(id);
    }
  }

  loadEarlier(id: string): Promise<void> {
    const source = this.current[id];
    if (!source?.path || !source.nextCursor) return Promise.resolve();
    if (this.transcripts.get(id) !== sessionKey(source)) return this.refresh(id, true);
    const identity = this.identities.get(id);
    const key = JSON.stringify([id, identity, sessionPathKey(source.path), source.nextCursor]);
    const pending = this.historyPages.get(key); if (pending) return pending;
    const promise = (async () => {
      try {
        const page = await this.transport.request<{ messages: Json[]; nextCursor?: string }>('session.history', { path: source.path, cursor: source.nextCursor, limit: 100 });
        if (identity === this.identities.get(id)) this.update(id, current => prependHistoryPage(current, source, page));
      } catch (error) { if (identity === this.identities.get(id)) throw error; }
    })();
    this.historyPages.set(key, promise);
    void promise.finally(() => { if (this.historyPages.get(key) === promise) this.historyPages.delete(key); }).catch(() => {});
    return promise;
  }

  dispose(): void {
    this.flush(); cancelAnimationFrame(this.frame); this.frame = 0;
    for (const id of this.identities.keys()) this.invalidate(id);
  }

  private invalidate(id: string): void {
    for (const snapshot of this.snapshots.get(id) ?? []) snapshot.valid = false;
    this.identities.set(id, (this.identities.get(id) ?? 0) + 1);
  }

  private write(next: SessionView, event?: Json): void {
    const previous = this.values[next.id];
    if (previous === next) return;
    if (next.historyOnly) this.released.add(next.id);
    const pathChanged = previous?.path !== next.path;
    if (previous?.path && pathChanged && (!next.path || sessionPathKey(previous.path) !== sessionPathKey(next.path)) || previous && !previous.historyOnly && next.historyOnly) this.invalidate(next.id);
    for (const snapshot of this.snapshots.get(next.id) ?? []) {
      for (const key of new Set([...Object.keys(previous?.state ?? {}), ...Object.keys(next.state)])) if (previous?.state[key] !== next.state[key] || (key in (previous?.state ?? {})) !== (key in next.state)) snapshot.state.add(key);
      if (event && (event.type !== 'prompt_result' || event.sessionSettled)) for (const key of confirmedState[event.type] ?? []) snapshot.state.add(key);
      snapshot.messages ||= previous?.messages !== next.messages;
      snapshot.path ||= pathChanged || event?.type === 'session_info_update' && event.sessionFile !== undefined;
      snapshot.title ||= previous?.title !== next.title || event?.type === 'session_info_update' && (event.title ?? event.sessionName ?? event.name) !== undefined;
    }
    const before = this.values;
    this.values = pathChanged || !previous ? storeSession(before, next) : { ...before, [next.id]: next };
    for (const id of Object.keys(before)) if (!this.values[id]) { this.invalidate(id); this.released.add(id); this.transcripts.delete(id); }
    this.schedule();
  }

  private flush(): void {
    for (const [id, events] of this.pending) {
      const current = this.values[id]; if (!current) continue;
      this.pending.delete(id);
      if (this.snapshots.get(id)?.size) for (const event of events) this.write(applyEvent(this.values[id], event), event);
      else this.write(applyEvents(current, events));
    }
  }

  private schedule(): void {
    if (!this.frame) this.frame = requestAnimationFrame(() => { this.flush(); this.frame = 0; this.publish(this.values); });
  }

  private publishNow(): void { cancelAnimationFrame(this.frame); this.frame = 0; this.publish(this.values); }
}
