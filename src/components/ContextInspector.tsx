import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, X } from 'lucide-react';
import { request, rpc } from '../lib/bridge';
import { copy, localizeError } from '../lib/i18n';
import { readContextMessages } from '../lib/context-inspection';
import { normalizeHistoryMessages } from '../lib/session-state';
import { todoHistory } from '../lib/session-todos';
import type { Json, Language, SessionView } from '../lib/types';
import { Fold, Original } from './ContextDetails';
import RequestCaptures from './RequestCaptures';
import './context-inspector.css';

const labels = {
  zh: {
    title: '进阶上下文', close: '关闭进阶上下文', refresh: '刷新快照', loading: '正在读取…', retry: '重试',
    snapshot: '读取于', history: '历史记录', live: '运行时快照',
    injection: '上下文注入', context: '完整上下文查看', tools: '工具定义', runtime: '运行信息', requests: '实际请求',
    injectionHint: '当前有效系统提示词。上游未提供逐项注入来源；已结束轮次的临时覆盖无法还原。',
    contextHint: '读取 RPC 返回的全部会话消息，包含工具调用、结果及自定义消息。它与当前系统提示词、工具定义共同构成运行时可见的上下文。',
    historyHint: '此处仅能读取当前分支的历史消息原文。日志未保存系统提示词和工具定义，也不能还原压缩后的完整有效上下文。',
    requestHint: '以下为会话快照。查看实际发出的输入，请在“设置 → 进阶”开启请求捕获，然后展开“实际请求”。本机无法查看服务端随后追加的内容。',
    snapshotHint: '点击刷新可重新读取；运行中的消息可能继续变化。',
    noPrompt: '当前运行时未返回系统提示词。', noTools: '当前运行时未返回工具定义。',
    noHistoryPrompt: '历史记录未保存系统提示词，无法查看当时的注入内容。', noHistoryTools: '历史记录未保存工具定义。',
    noMessages: '当前会话没有消息。', section: '提示词段', records: '条消息', definitions: '个工具',
    raw: '原始 JSON', copy: '复制原文', copied: '已复制', state: '会话状态原文', stats: '用量统计原文',
    model: '模型', provider: '提供商', thinking: '思考级别', compaction: '自动压缩', on: '开启', off: '关闭', unknown: '未提供',
    todos: 'Todo 历史', todoHint: '按时间追溯每次 Todo 更新的阶段、状态和任务详情。', noTodos: '此会话没有 Todo 更新记录。', todoRecords: '次更新',
  },
  en: {
    title: 'Advanced context', close: 'Close advanced context', refresh: 'Refresh snapshot', loading: 'Reading…', retry: 'Retry',
    snapshot: 'Read at', history: 'Saved history', live: 'Runtime snapshot',
    injection: 'Context injections', context: 'Full context viewer', tools: 'Tool definitions', runtime: 'Runtime information', requests: 'Actual requests',
    injectionHint: 'The currently effective system prompt. Upstream does not expose individual injection sources; temporary overrides from completed turns cannot be recovered.',
    contextHint: 'Reads all conversation messages returned by RPC, including tool calls, results and custom messages. Together with the current system prompt and tool definitions, these form the context visible through the runtime.',
    historyHint: 'Only the current branch’s saved message text is available. History does not store system prompts or tool definitions and cannot reconstruct the full effective context after compaction.',
    requestHint: 'The data below is a conversation snapshot. To inspect the actual outgoing input, enable request capture in Settings → Advanced, then expand Actual requests. Changes made later by the server are not visible locally.',
    snapshotHint: 'Refresh to read again; messages may keep changing during a run.',
    noPrompt: 'The current runtime did not return a system prompt.', noTools: 'The current runtime did not return tool definitions.',
    noHistoryPrompt: 'History did not save the system prompt, so past injections are unavailable.', noHistoryTools: 'History did not save tool definitions.',
    noMessages: 'This conversation has no messages.', section: 'Prompt section', records: 'messages', definitions: 'tools',
    raw: 'Raw JSON', copy: 'Copy original', copied: 'Copied', state: 'Raw session state', stats: 'Raw usage statistics',
    model: 'Model', provider: 'Provider', thinking: 'Thinking level', compaction: 'Auto compaction', on: 'On', off: 'Off', unknown: 'Unavailable',
    todos: 'Todo history', todoHint: 'Trace the phases, status and task details of each Todo update in order.', noTodos: 'This conversation has no Todo updates.', todoRecords: 'updates',
  },
};
export default function ContextInspector({ session, language, close, exiting = false }: { session: SessionView; language: Language; close: () => void; exiting?: boolean }) {
  const text = labels[language];
  const dialog = useRef<HTMLDialogElement>(null);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<Json | null>(null);
  const [stats, setStats] = useState<Json | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [capturedAt, setCapturedAt] = useState('');
  const [messagesRequested, setMessagesRequested] = useState(false);
  const [messages, setMessages] = useState<Json | null>(null);
  const [messageError, setMessageError] = useState('');
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [todosRequested, setTodosRequested] = useState(false);
  const [todos, setTodos] = useState<ReturnType<typeof todoHistory> | null>(null);
  const [todosLoading, setTodosLoading] = useState(false);
  const [todoError, setTodoError] = useState('');
  const messageRevision = useRef(0);
  const identity = `${session.id}:${session.path}:${session.historyOnly}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  useEffect(() => {
    const element = dialog.current;
    return () => element?.close();
  }, []);
  useEffect(() => { if (exiting) dialog.current?.close(); else dialog.current?.showModal(); }, [exiting]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setState(null); setStats(null); setErrors([]); setCapturedAt('');
    void Promise.allSettled([
      session.historyOnly ? Promise.resolve(null) : rpc<Json>(session.id, 'get_state'),
      session.historyOnly ? session.path ? request<Json>('session.stats', { path: session.path }) : Promise.resolve(null) : rpc<Json>(session.id, 'get_session_stats'),
    ]).then(([stateResult, statsResult]) => {
      if (cancelled || currentIdentity.current !== identity) return;
      if (stateResult.status === 'fulfilled') setState(stateResult.value);
      if (statsResult.status === 'fulfilled') setStats(statsResult.value);
      setErrors([stateResult, statsResult].flatMap(result => result.status === 'rejected' ? [String(result.reason)] : []));
      setCapturedAt(new Date().toISOString()); setLoading(false);
    });
    return () => { cancelled = true; };
  }, [identity, revision]);
  useEffect(() => {
    if (!messagesRequested) return;
    const version = ++messageRevision.current;
    let cancelled = false;
    const current = () => !cancelled && messageRevision.current === version && currentIdentity.current === identity;
    setMessagesLoading(true); setMessages(null); setMessageError('');
    void readContextMessages(session, current).then(result => { if (current()) setMessages(result ?? null); })
      .catch(error => { if (current()) setMessageError(String(error)); })
      .finally(() => { if (current()) setMessagesLoading(false); });
    return () => { cancelled = true; };
  }, [identity, revision, messagesRequested]);
  useEffect(() => {
    if (!todosRequested) return;
    let cancelled = false;
    const current = () => !cancelled && currentIdentity.current === identity;
    setTodosLoading(true); setTodos(null); setTodoError('');
    // 历史追溯读取保存的分支日志，保留上下文压缩前的更新。
    void readContextMessages(session.path ? { ...session, historyOnly: true } : session, current)
      .then(result => { if (current()) setTodos(todoHistory(normalizeHistoryMessages(result?.messages ?? [], 'todo-history'))); })
      .catch(error => { if (current()) setTodoError(String(error)); })
      .finally(() => { if (current()) setTodosLoading(false); });
    return () => { cancelled = true; };
  }, [identity, revision, todosRequested]);

  const prompt = state?.systemPrompt;
  const tools: Json[] | undefined = state?.dumpTools;
  const entries: Json[] = messages?.messages ?? [];
  const refresh = () => setRevision(value => value + 1);
  const dismiss = close;
  const roleName = (role: string) => language === 'zh' ? ({ user: '用户', assistant: '助手', toolResult: '工具结果', developer: '开发者', custom: '自定义', system: '系统' }[role] ?? role) : role;
  const original = (value: unknown, plain = false) => <Original value={value} plain={plain} language={language} />;
  return createPortal(<dialog className="context-dialog" ref={dialog} data-exiting={exiting || undefined} inert={exiting} aria-hidden={exiting || undefined} aria-labelledby="context-dialog-title" aria-describedby="context-request-hint" onCancel={event => { event.preventDefault(); dismiss(); }} onClick={event => { if (event.target === dialog.current) dismiss(); }}>
    <header><div><h2 id="context-dialog-title">{text.title}</h2><p>{session.historyOnly ? text.history : text.live}{capturedAt && <> · {text.snapshot} {new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(capturedAt))}</>}</p></div><div className="context-dialog-actions"><button className="icon-button" title={text.refresh} aria-label={text.refresh} disabled={loading || messagesLoading} onClick={refresh}><RefreshCw size={15} /></button><button autoFocus className="icon-button" title={text.close} aria-label={text.close} onClick={dismiss}><X size={17} /></button></div></header>
    <div className="context-dialog-body">
      <p id="context-request-hint" className="context-note">{text.requestHint}</p>
      <p className="context-snapshot-hint">{session.historyOnly ? text.historyHint : text.snapshotHint}</p>
      {loading && <p role="status">{text.loading}</p>}
      {errors.length > 0 && <div className="context-load-error" role="alert">{errors.map((error, index) => <p key={index}>{localizeError(error, language)}</p>)}<button className="quiet-button" disabled={loading} onClick={refresh}>{text.retry}</button></div>}
      <Fold title={text.injection} meta={Array.isArray(prompt) ? String(prompt.length) : undefined}>
        <p className="context-section-hint">{text.injectionHint}</p>
        {loading ? <p role="status">{text.loading}</p> : prompt !== undefined ? <>{(Array.isArray(prompt) ? prompt : [prompt]).map((part, index) => <Fold key={index} title={`${text.section} ${index + 1}`}>{original(part, true)}</Fold>)}<Fold title={text.raw}>{original(prompt)}</Fold></> : <p>{session.historyOnly ? text.noHistoryPrompt : text.noPrompt}</p>}
      </Fold>
      <Fold title={text.context} meta={messages ? `${entries.length} ${text.records}` : undefined} onOpen={() => setMessagesRequested(true)}>
        <p className="context-section-hint">{session.historyOnly ? text.historyHint : text.contextHint}</p>
        {messagesLoading ? <p role="status">{text.loading}</p> : messageError ? <div role="alert"><p>{localizeError(messageError, language)}</p><button className="quiet-button" onClick={refresh}>{text.retry}</button></div> : messages && <>{entries.map((message, index) => <Fold key={index} title={`${index + 1} · ${roleName(message.role ?? 'message')}`} meta={message.toolName}>{original(message)}</Fold>)}{!entries.length && <p>{text.noMessages}</p>}<Fold title={text.raw}>{original(messages)}</Fold></>}
      </Fold>
      <Fold title={text.tools} meta={tools ? `${tools.length} ${text.definitions}` : undefined}>
        {loading ? <p role="status">{text.loading}</p> : tools ? <>{tools.map((tool, index) => <Fold key={index} title={tool.name}>{original(tool)}</Fold>)}<Fold title={text.raw}>{original(tools)}</Fold></> : <p>{session.historyOnly ? text.noHistoryTools : text.noTools}</p>}
      </Fold>
      <Fold title={text.todos} meta={todos ? `${todos.length} ${text.todoRecords}` : undefined} onOpen={() => setTodosRequested(true)}>
        <p className="context-section-hint">{text.todoHint}</p>
        {todosLoading ? <p role="status">{text.loading}</p> : todoError ? <div role="alert"><p>{localizeError(todoError, language)}</p><button className="quiet-button" onClick={refresh}>{text.retry}</button></div> : todos && (todos.length ? todos.map((entry, index) => <Fold key={entry.id} title={`${index + 1} · ${entry.operation ?? 'todo'}`} meta={`${entry.completed}/${entry.total}`}>{original({ timestamp: entry.timestamp, operation: entry.operation, phases: entry.phases })}</Fold>) : <p>{text.noTodos}</p>)}
      </Fold>
      <Fold title={text.runtime}>
        {state && <dl className="context-runtime-info">{[
          [text.model, state.model?.id], [text.provider, state.model?.provider], [text.thinking, copy(language).effortLevels[state.thinkingLevel as keyof ReturnType<typeof copy>['effortLevels']] ?? state.thinkingLevel],
          [text.compaction, typeof state.autoCompactionEnabled === 'boolean' ? state.autoCompactionEnabled ? text.on : text.off : null],
        ].map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value ?? text.unknown}</dd></div>)}</dl>}
        {state && <Fold title={text.state}>{original(state)}</Fold>}{stats && <Fold title={text.stats}>{original(stats)}</Fold>}
      </Fold>
      <Fold title={text.requests}><RequestCaptures language={language} session={session} revision={revision} /></Fold>
    </div>
  </dialog>, document.body);
}
