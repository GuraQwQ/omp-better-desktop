import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ChevronUp, SlidersHorizontal, X } from 'lucide-react';
import { onDesktopEvent, request, rpc } from '../lib/bridge';
import type { SessionStats } from '../generated/rpc-wire';
import type { Language, SessionView } from '../lib/types';
import { formatUsageAmount, summarizeSessionUsage } from '../lib/session-usage';
import { sessionKey } from '../lib/session-identity';
import './session-usage.css';

export type UsageCache = Map<string, SessionStats>;
const ContextInspector = lazy(() => import('./ContextInspector'));

export default function SessionUsage({ session, language, cache }: { session?: SessionView; language: Language; cache: UsageCache }) {
  const [expanded, setExpanded] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const disclosure = useRef<HTMLDetailsElement>(null);
  const [result, setResult] = useState<{ key: string; stats: SessionStats | null; stale: boolean } | null>(null);
  const inFlight = useRef<Promise<SessionStats> | null>(null);
  const requestRefresh = useRef<() => void>(() => {});
  const refreshStamp = useRef<unknown[]>([]);
  const id = session?.id;
  const path = session?.path;
  const key = session ? sessionKey(session) : '';
  const historyOnly = session?.historyOnly;
  const running = !!session?.state.isStreaming || ['running', 'background'].includes(session?.status ?? '') || session?.state.isSettled === false;
  const messageCount = session?.messages.length;
  const lastUsage = session?.messages.at(-1)?.usage;
  const settled = session?.state.isSettled;
  const modelId = session?.state.model?.id;
  const provider = session?.state.model?.provider;
  const modelWindow = session?.state.model?.contextWindow;
  const contextWindow = session?.state.contextUsage?.contextWindow;
  useEffect(() => { setExpanded(false); setAdvanced(false); }, [key, id, historyOnly]);
  useEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => { if (!disclosure.current?.contains(event.target as Node)) setExpanded(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [expanded]);

  useEffect(() => {
    if (!id || historyOnly && !path) { requestRefresh.current = () => {}; return; }
    let cancelled = false;
    let queued = false;
    let loading = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unlisten: (() => void) | undefined;
    refreshStamp.current = [running, messageCount, lastUsage, settled, modelId, provider, modelWindow, contextWindow];
    const load = async () => {
      clearTimeout(timer); queued = true;
      if (loading || cancelled) return;
      loading = true;
      while (queued && !cancelled) {
        queued = false;
        // 合并事件刷新，并等待旧会话请求结束，避免重叠及最终用量被漏掉。
        if (inFlight.current) await inFlight.current.catch(() => {});
        if (cancelled) break;
        const pending = historyOnly ? request<SessionStats>('session.stats', { path }) : rpc<SessionStats>(id, 'get_session_stats');
        inFlight.current = pending;
        try {
          const stats = await pending;
          if (!cancelled) {
            const previous = cache.get(key);
            const sameSession = !previous?.sessionId || !stats.sessionId || previous.sessionId === stats.sessionId;
            const value = historyOnly && !stats.contextUsage && previous?.contextUsage && previous.tokens.total === stats.tokens.total && sameSession ? { ...stats, contextUsage: previous.contextUsage } : stats;
            cache.set(key, value);
            setResult({ key, stats: value, stale: false });
          }
        } catch {
          if (!cancelled) setResult({ key, stats: cache.get(key) ?? null, stale: true });
        } finally {
          if (inFlight.current === pending) inFlight.current = null;
        }
      }
      loading = false;
      if (!cancelled && running) timer = setTimeout(load, 2000);
    };
    requestRefresh.current = () => { void load(); };
    if (!historyOnly) void onDesktopEvent(payload => {
      if (payload.sessionId === id && ['message_end', 'agent_end', 'session_settled', 'prompt_result'].includes(payload.event.type)) void load();
    }).then(stop => { if (cancelled) stop(); else unlisten = stop; }).catch(() => {});
    void load();
    return () => { cancelled = true; queued = false; clearTimeout(timer); unlisten?.(); requestRefresh.current = () => {}; };
  }, [id, path, key, historyOnly, cache, running]);
  useEffect(() => {
    const next = [running, messageCount, lastUsage, settled, modelId, provider, modelWindow, contextWindow];
    if (next.some((value, index) => value !== refreshStamp.current[index])) { refreshStamp.current = next; requestRefresh.current(); }
  }, [running, messageCount, lastUsage, settled, modelId, provider, modelWindow, contextWindow]);

  const stats = result?.key === key ? result.stats : cache.get(key) ?? null;
  const usage = summarizeSessionUsage(stats);
  const number = (value: number | null, compact = true) => formatUsageAmount(value, language, compact);
  const percent = (value: number | null) => value === null ? '—' : `${new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en-US', { maximumFractionDigits: 1 }).format(value)}%`;
  const text = language === 'zh' ? {
    usage: '会话用量', advanced: '进阶', context: '上下文', remaining: '剩余', tokens: '用量', cache: '缓存命中', hit: '命中率', unavailable: '统计不可用',
    input: '未缓存输入', output: '输出', cacheRead: '缓存读取', cacheWrite: '缓存写入', close: '关闭用量详情',
    contextHint: `上下文占用 ${number(usage.used, false)} / ${number(usage.window, false)} tokens，剩余 ${number(usage.remaining, false)} tokens。`,
    tokensHint: `当前会话累计 tokens：输入 ${number(usage.input, false)}，输出 ${number(usage.output, false)}，缓存读取 ${number(usage.cacheRead, false)}，缓存写入 ${number(usage.cacheWrite, false)}；总量 ${number(usage.total, false)}。推理 tokens 已包含在输出中。`,
    cacheHint: '当前会话累计缓存命中率 = 缓存读取 /（输入 + 缓存读取 + 缓存写入）。',
    unknownContext: '历史日志未记录模型上下文容量，无法计算占用和剩余。', recordedContext: '上下文为此会话最近一次运行时统计。', stale: '统计更新暂不可用，显示此会话上次记录。',
  } : {
    usage: 'Session usage', advanced: 'Advanced', context: 'Context', remaining: 'Left', tokens: 'Usage', cache: 'Cache hits', hit: 'Hit rate', unavailable: 'Statistics unavailable',
    input: 'Uncached input', output: 'Output', cacheRead: 'Cache read', cacheWrite: 'Cache write', close: 'Close usage details',
    contextHint: `Context: ${number(usage.used, false)} / ${number(usage.window, false)} tokens; ${number(usage.remaining, false)} tokens remaining.`,
    tokensHint: `Session totals in tokens: input ${number(usage.input, false)}, output ${number(usage.output, false)}, cache read ${number(usage.cacheRead, false)}, cache write ${number(usage.cacheWrite, false)}; total ${number(usage.total, false)}. Reasoning is included in output.`,
    cacheHint: 'Session cache hit rate = cache read / (input + cache read + cache write).',
    unknownContext: 'This history has no model context capacity, so usage and remaining context are unknown.', recordedContext: 'Context reflects the last runtime statistics for this conversation.', stale: 'Statistics could not refresh. Showing the last record for this conversation.',
  };

  const close = () => { setExpanded(false); disclosure.current?.querySelector<HTMLElement>('summary')?.focus(); };
  return <><details ref={disclosure} className="session-usage" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)} aria-label={text.usage} title={result?.key === key && result.stale ? text.stale : undefined} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
    <summary className="session-usage-summary">
    <div className="session-context" title={`${text.contextHint}${historyOnly ? usage.window === null ? text.unknownContext : text.recordedContext : ''}`}>
      <span>{text.context} <strong>{percent(usage.contextPercent)}</strong></span>
      <div className="session-context-meter" role="progressbar" aria-label={text.context} aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={usage.contextPercent === null ? undefined : Math.min(100, usage.contextPercent)} aria-valuetext={usage.contextPercent === null ? text.unavailable : percent(usage.contextPercent)}>
        <span style={{ width: `${Math.min(100, usage.contextPercent ?? 0)}%` }} />
      </div>
      <span>{text.remaining} <strong>{number(usage.remaining)}</strong></span>
    </div>
    <div className="session-token-usage">
      <span title={text.tokensHint}>{text.tokens} <strong>{number(usage.total)}</strong></span>
      <span title={`${text.tokensHint}\n${text.cacheHint}`}>{text.cache} <strong>{number(usage.cacheRead)}</strong><span className="cache-hit-rate">{text.hit} <strong>{percent(usage.cacheHitPercent)}</strong></span></span>
      <ChevronUp className="usage-disclosure-icon" size={12} aria-hidden="true" />
    </div>
    </summary>
    {expanded && <section className="usage-details" aria-label={text.usage}>
      <header><strong>{text.usage}</strong><button type="button" className="icon-button" aria-label={text.close} onClick={close}><X size={15} /></button></header>
      <dl>
        <div><dt>{text.context}</dt><dd>{number(usage.used, false)} / {number(usage.window, false)}</dd></div>
        <div><dt>{text.remaining}</dt><dd>{number(usage.remaining, false)}</dd></div>
        <div><dt>{text.input}</dt><dd>{number(usage.input, false)}</dd></div>
        <div><dt>{text.output}</dt><dd>{number(usage.output, false)}</dd></div>
        <div><dt>{text.cacheRead}</dt><dd>{number(usage.cacheRead, false)}</dd></div>
        <div><dt>{text.cacheWrite}</dt><dd>{number(usage.cacheWrite, false)}</dd></div>
        <div><dt>{text.tokens}</dt><dd>{number(usage.total, false)}</dd></div>
        <div><dt>{text.hit}</dt><dd>{percent(usage.cacheHitPercent)}</dd></div>
      </dl>
      <p>{text.cacheHint}</p>{historyOnly && <p>{usage.window === null ? text.unknownContext : text.recordedContext}</p>}
      {result?.key === key && result.stale && <p>{text.stale}</p>}
      <footer><button type="button" className="quiet-button" disabled={!session} aria-haspopup="dialog" onClick={() => { setExpanded(false); setAdvanced(true); }}><SlidersHorizontal size={13} />{text.advanced}</button></footer>
    </section>}
  </details>{advanced && session && <Suspense fallback={null}><ContextInspector key={`${key}:${id}:${historyOnly}`} session={session} language={language} close={() => { setAdvanced(false); disclosure.current?.querySelector<HTMLElement>('summary')?.focus(); }} /></Suspense>}</>;
}
