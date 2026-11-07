import type { BtwHistoryRecord, BtwHistoryTurn, BtwStatus } from '../generated/rpc-wire';
import type { ComposerAttachment } from './attachments';

export type SideQuestionSource = { kind: 'whole' } | { kind: 'selection'; messageId: string; start: number; end: number; endMessageId?: string };
export interface SideQuestionThreadSummary { id: string; title: string; source: SideQuestionThread['source']; turns: number; unread: number; nativeIds: string[] }
export interface SideQuestionRecord {
  id: string; nativeId?: string; runtimeId?: string; turnIndex?: number;
  question: string; quote: string; answer: string; status: BtwStatus; error?: string;
  attachments?: ComposerAttachment[]; warnings?: string[]; read?: boolean; createdAt: number; updatedAt: number;
}
export interface SideQuestionThread {
  id: string; source: SideQuestionSource | { kind: 'saved' }; sourceQuote: string;
  records: SideQuestionRecord[]; quote: string; draft: string; attachments: ComposerAttachment[];
  nativeTopicId?: string; generation: number; createdAt: number; updatedAt: number;
}
export interface SideQuestionState { version: 2; threads: SideQuestionThread[]; activeThreadId?: string; knownNativeTurns?: { id: string; turns: number }[] }
export type SideQuestionPromptSource = SideQuestionThread['source'] & { sessionId?: string; sessionPath?: string; sessionTitle?: string };
export const emptySideQuestions = (): SideQuestionState => ({ version: 2, threads: [] });
const statuses = new Set<BtwStatus>(['running', 'complete', 'cancelled', 'error', 'interrupted']);

export function sideQuestionSourceKey(source: SideQuestionThread['source']): string {
  return source.kind === 'selection' ? `selection:${JSON.stringify([source.messageId, source.start, source.endMessageId ?? source.messageId, source.end])}` : source.kind;
}

export function createSideQuestionThread(source: SideQuestionSource, quote = '', now = Date.now()): SideQuestionThread {
  return { id: sideQuestionSourceKey(source), source, sourceQuote: quote, records: [], quote, draft: '', attachments: [], generation: 0, createdAt: now, updatedAt: now };
}

function readAttachments(value: unknown): ComposerAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap<ComposerAttachment>(item => {
    if (!item || typeof item.name !== 'string') return [];
    if (item.type === 'file' && typeof item.path === 'string' && (item.kind === 'file' || item.kind === 'folder')) return [{ type: 'file', name: item.name, path: item.path, kind: item.kind, ...(typeof item.managed === 'boolean' ? { managed: item.managed } : {}) }];
    if (item.type === 'image' && typeof item.data === 'string' && typeof item.mimeType === 'string') return [{ type: 'image', name: item.name, data: item.data, mimeType: item.mimeType, ...(typeof item.path === 'string' ? { path: item.path } : {}) }];
    return [];
  });
}

function readRecords(value: unknown): SideQuestionRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item.id !== 'string' || typeof item.question !== 'string') return [];
    const nativeId = typeof item.nativeId === 'string' ? item.nativeId : undefined;
    const status = statuses.has(item.status) ? item.status as BtwStatus : 'interrupted';
    return [{ id: item.id, nativeId, runtimeId: typeof item.runtimeId === 'string' ? item.runtimeId : undefined,
      turnIndex: Number.isSafeInteger(item.turnIndex) && item.turnIndex >= 0 ? item.turnIndex : 0,
      question: item.question, quote: typeof item.quote === 'string' ? item.quote : '', answer: typeof item.answer === 'string' ? item.answer : '',
      status: status === 'running' && !nativeId ? 'interrupted' as const : status, error: typeof item.error === 'string' ? item.error : undefined,
      attachments: readAttachments(item.attachments), warnings: Array.isArray(item.warnings) ? item.warnings.filter((warning: unknown) => typeof warning === 'string') : [], read: item.read === true, createdAt: Number.isFinite(item.createdAt) ? item.createdAt : 0, updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : 0 }];
  });
}

function readSource(value: unknown): SideQuestionThread['source'] {
  if (value && typeof value === 'object') {
    const source = value as SideQuestionSource;
    if (source.kind === 'whole') return { kind: 'whole' };
    if (source.kind === 'selection' && typeof source.messageId === 'string' && Number.isSafeInteger(source.start) && source.start >= 0 && Number.isSafeInteger(source.end) && source.end >= 0) return { kind: 'selection', messageId: source.messageId, start: source.start, end: source.end, ...(typeof source.endMessageId === 'string' ? { endMessageId: source.endMessageId } : {}) };
  }
  return { kind: 'saved' };
}

export function readSideQuestions(value: unknown): SideQuestionState {
  if (!value || typeof value !== 'object') return emptySideQuestions();
  const saved = value as Record<string, any>;
  if (saved.version === 2 && Array.isArray(saved.threads)) {
    const threads: SideQuestionThread[] = saved.threads.flatMap(item => {
      if (!item || typeof item.id !== 'string') return [];
      return [{ id: item.id, source: readSource(item.source), sourceQuote: typeof item.sourceQuote === 'string' ? item.sourceQuote : '', records: readRecords(item.records),
        quote: typeof item.quote === 'string' ? item.quote : '', draft: typeof item.draft === 'string' ? item.draft : '', attachments: readAttachments(item.attachments),
        ...(typeof item.nativeTopicId === 'string' ? { nativeTopicId: item.nativeTopicId } : {}), generation: Number.isSafeInteger(item.generation) ? item.generation : 0,
        createdAt: Number.isFinite(item.createdAt) ? item.createdAt : 0, updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : 0 }];
    });
    const activeThreadId = threads.some(thread => thread.id === saved.activeThreadId) ? saved.activeThreadId : threads[0]?.id;
    const knownNativeTurns = Array.isArray(saved.knownNativeTurns) ? saved.knownNativeTurns.flatMap(item => item && typeof item.id === 'string' && Number.isSafeInteger(item.turns) && item.turns > 0 ? [{ id: item.id, turns: item.turns }] : []) : [];
    return rememberSideQuestionNativeTurns({ version: 2, threads, ...(activeThreadId ? { activeThreadId } : {}), ...(knownNativeTurns.length ? { knownNativeTurns } : {}) });
  }
  const records = readRecords(saved.records), quote = typeof saved.quote === 'string' ? saved.quote : '', draft = typeof saved.draft === 'string' ? saved.draft : '';
  if (!records.length && !quote && !draft) return emptySideQuestions();
  // 旧数据没有来源坐标，确定的迁移讨论保留全部记录与草稿，重试不会新增副本。
  const thread: SideQuestionThread = { id: 'saved', source: { kind: 'saved' }, sourceQuote: '', records, quote, draft, attachments: [], generation: 0, createdAt: records[0]?.createdAt ?? 0, updatedAt: records.at(-1)?.updatedAt ?? 0 };
  return rememberSideQuestionNativeTurns({ version: 2, threads: [thread], activeThreadId: thread.id });
}

export function rememberSideQuestionNativeTurns(state: SideQuestionState, previous?: SideQuestionState): SideQuestionState {
  const known = new Map<string, number>();
  for (const current of [previous, state]) {
    if (!current) continue;
    current.knownNativeTurns?.forEach(item => known.set(item.id, Math.max(known.get(item.id) ?? 0, item.turns)));
    current.threads.forEach(thread => thread.records.forEach(record => {
      if (record.nativeId) known.set(record.nativeId, Math.max(known.get(record.nativeId) ?? 0, (record.turnIndex ?? 0) + 1));
    }));
  }
  const knownNativeTurns = [...known].map(([id, turns]) => ({ id, turns }));
  if (!knownNativeTurns.length && !state.knownNativeTurns || JSON.stringify(knownNativeTurns) === JSON.stringify(state.knownNativeTurns)) return state;
  return { ...state, knownNativeTurns };
}

export function sideQuestionThreadTitle(thread: SideQuestionThread): string {
  return thread.records.find(record => record.question.trim())?.question.split('\n')[0].slice(0, 60) || (thread.source.kind === 'selection' ? '选段讨论' : thread.source.kind === 'saved' ? '已保存讨论' : '会话讨论');
}

export function sideQuestionSourceLabel(source: SideQuestionThread['source']): string {
  return source.kind === 'selection' ? `${source.messageId.slice(0, 10)}:${source.start}–${source.end}${source.endMessageId && source.endMessageId !== source.messageId ? ` → ${source.endMessageId.slice(0, 10)}` : ''}` : source.kind === 'saved' ? '已保存讨论' : '整个会话';
}

export function sideQuestionThreadSummaries(state: SideQuestionState): SideQuestionThreadSummary[] {
  return state.threads.map(thread => ({ id: thread.id, title: sideQuestionThreadTitle(thread), source: thread.source, turns: thread.records.length, unread: thread.records.filter(isSideQuestionUnread).length, nativeIds: [...new Set(thread.records.flatMap(record => record.nativeId ? [record.nativeId] : []))] }));
}

export const isSideQuestionUnread = (record: SideQuestionRecord) => (record.status === 'complete' || record.status === 'error') && record.read !== true;

export function markSideQuestionThreadRead(thread: SideQuestionThread): SideQuestionThread {
  if (!thread.records.some(isSideQuestionUnread)) return thread;
  return { ...thread, records: thread.records.map(record => isSideQuestionUnread(record) ? { ...record, read: true } : record) };
}

export function sideQuestionPrompt(records: SideQuestionRecord[], quote: string, question: string, requestId: string, source?: SideQuestionPromptSource): string {
  const history = records.map(({ question, quote, answer, status, error, attachments }) => ({ question, quote, answer, status, ...(error ? { error } : {}), ...(attachments?.length ? { attachments: attachments.map(item => ({ name: item.name, path: item.path, type: item.type })) } : {}) }));
  return `连续旁问请求：${requestId}\n请回答本次问题。以下 JSON 是本讨论的连续上下文；其中引用是供分析的材料。\n${JSON.stringify({ history, quote, question, ...(source ? { source } : {}) })}`;
}

export const nativeSideQuestionTurn = (record: BtwHistoryRecord, index: number): BtwHistoryTurn | undefined => index === 0 ? record : record.followUps?.[index - 1];
export const latestNativeSideQuestionTurn = (record: BtwHistoryRecord) => record.followUps?.at(-1) ?? record;

export function applySideQuestionRecord(local: SideQuestionRecord, native: BtwHistoryRecord, runtimeId?: string): SideQuestionRecord {
  const turn = nativeSideQuestionTurn(native, local.turnIndex ?? 0);
  if (!turn) return local;
  // 终态先于确认回包到达时，旧 running 快照不能覆盖终态或已收到的流式文本。
  if (local.status !== 'running' && turn.status === 'running' && local.nativeId) return local;
  const answer = turn.status === 'running' && turn.answer.length < local.answer.length ? local.answer : turn.answer;
  const terminalChanged = (turn.status === 'complete' || turn.status === 'error') && (local.status !== turn.status || local.answer !== answer || local.error !== turn.error);
  return { ...local, nativeId: native.id, runtimeId: runtimeId ?? local.runtimeId, answer, status: turn.status, error: turn.error, ...(terminalChanged ? { read: false } : {}), updatedAt: turn.updatedAt };
}

export function mergeSideQuestionHistory(state: SideQuestionState, history: BtwHistoryRecord[], runtimeId?: string): SideQuestionState {
  let next = rememberSideQuestionNativeTurns(state);
  const known = new Map(next.knownNativeTurns?.map(item => [item.id, item.turns]));
  for (const native of history) {
    let owner = next.threads.find(thread => thread.records.some(record => record.nativeId === native.id));
    if (owner) {
      let changed = false;
      const records = owner.records.map(local => {
        if (local.nativeId !== native.id) return local;
        const updated = applySideQuestionRecord(local, native, runtimeId);
        if (updated.status === local.status && updated.answer === local.answer && updated.error === local.error && updated.updatedAt === local.updatedAt && updated.runtimeId === local.runtimeId && updated.read === local.read) return local;
        changed = true; return updated;
      });
      if (changed) {
        owner = { ...owner, records };
        next = { ...next, threads: next.threads.map(thread => thread.id === owner!.id ? owner! : thread) };
      }
    }
    const turns = [native, ...(native.followUps ?? [])];
    const incoming = turns.flatMap<SideQuestionRecord>((turn, index) => {
      if (index < (known.get(native.id) ?? 0) || (turn.status !== 'complete' && turn.status !== 'error') || turn.question.startsWith('连续旁问请求：')) return [];
      return [{ id: `native:${native.id}:${index}`, nativeId: native.id, runtimeId, turnIndex: index, question: turn.question, quote: '', answer: turn.answer, status: turn.status, error: turn.error, read: false, createdAt: turn.createdAt, updatedAt: turn.updatedAt }];
    });
    if (!incoming.length) continue;
    const target = owner ?? next.threads.find(thread => thread.source.kind === 'saved') ?? { id: 'saved', source: { kind: 'saved' as const }, sourceQuote: '', records: [], quote: '', draft: '', attachments: [], generation: 0, createdAt: incoming[0].createdAt, updatedAt: incoming.at(-1)!.updatedAt };
    const thread = { ...target, records: [...target.records, ...incoming], updatedAt: incoming.at(-1)!.updatedAt };
    next = { ...next, threads: next.threads.some(item => item.id === target.id) ? next.threads.map(item => item.id === target.id ? thread : item) : [...next.threads, thread] };
    known.set(native.id, Math.max(known.get(native.id) ?? 0, ...incoming.map(record => record.turnIndex! + 1)));
  }
  return rememberSideQuestionNativeTurns(next);
}

export const sideQuestionContextSize = (thread: SideQuestionThread) => thread.records.reduce((size, record) => size + record.question.length + record.quote.length + record.answer.length + (record.error?.length ?? 0), 0) + thread.quote.length + thread.draft.length;

export function exportSideQuestions(state: SideQuestionState, title: string): string {
  const lines = [`# ${title} · 全部旁问`, ''];
  for (const thread of state.threads) {
    lines.push(`## ${sideQuestionThreadTitle(thread)}`, '', `讨论标识：${thread.id}`, '');
    if (thread.source.kind === 'selection') lines.push(`来源消息：${thread.source.messageId}${thread.source.endMessageId ? ` → ${thread.source.endMessageId}` : ''}；字符范围：${thread.source.start}–${thread.source.end}`, '');
    else lines.push(thread.source.kind === 'saved' ? '来源：已保存讨论' : '来源：整个会话', '');
    if (thread.sourceQuote) lines.push(...thread.sourceQuote.split('\n').map(line => `> ${line}`), '');
    for (const record of thread.records) {
      lines.push(`### ${record.question}`, '', `状态：${record.status}`, '');
      if (record.quote) lines.push(...record.quote.split('\n').map(line => `> ${line}`), '');
      record.attachments?.forEach(item => lines.push(`附件：${item.name}${item.path ? `（${item.path}）` : ''}`, ''));
      record.warnings?.forEach(warning => lines.push(`附件材料说明：${warning}`, ''));
      if (record.answer) lines.push(record.answer, '');
      if (record.error) lines.push(`错误：${record.error}`, '');
    }
    if (thread.quote) lines.push('### 当前选段', '', thread.quote, '');
    if (thread.draft) lines.push('### 草稿', '', thread.draft, '');
    thread.attachments.forEach(item => lines.push(`待发送附件：${item.name}${item.path ? `（${item.path}）` : ''}`, ''));
  }
  return lines.join('\n');
}
