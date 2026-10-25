import { useEffect, useRef, useState } from 'react';
import { rpc } from '../lib/bridge';
import type { SessionStats } from '../generated/rpc-wire';
import type { Language, SessionView } from '../lib/types';
import { formatUsageAmount, summarizeSessionUsage } from '../lib/session-usage';
import './session-usage.css';

export default function SessionUsage({ session, language }: { session?: SessionView; language: Language }) {
  const [result, setResult] = useState<{ id: string; stats: SessionStats } | null>(null);
  const inFlight = useRef<Promise<SessionStats> | null>(null);
  const id = session?.id;
  const historyOnly = session?.historyOnly;
  const running = !!session?.state.isStreaming || session?.status === 'running';
  const messageCount = session?.messages.length;

  useEffect(() => {
    if (!id || historyOnly) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      // 等待上次请求结束，切换会话或消息更新也不会并发拉取统计。
      if (inFlight.current) await inFlight.current.catch(() => {});
      if (cancelled) return;
      const request = rpc<SessionStats>(id, 'get_session_stats');
      inFlight.current = request;
      try {
        const stats = await request;
        if (!cancelled) setResult({ id, stats });
      } catch {
        if (!cancelled) setResult(null);
      } finally {
        if (inFlight.current === request) inFlight.current = null;
      }
      if (!cancelled && running) timer = setTimeout(load, 2000);
    };
    void load();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [id, historyOnly, running, messageCount]);

  const stats = result && result.id === id && !historyOnly ? result.stats : null;
  const usage = summarizeSessionUsage(stats);
  const number = (value: number | null, compact = true) => formatUsageAmount(value, language, compact);
  const percent = (value: number | null) => value === null ? '—' : `${new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en-US', { maximumFractionDigits: 1 }).format(value)}%`;
  const text = language === 'zh' ? {
    usage: '会话用量', context: '上下文', remaining: '剩余', tokens: '用量', cache: '缓存命中', hit: '命中率', unavailable: '统计不可用',
    contextHint: `上下文占用 ${number(usage.used, false)} / ${number(usage.window, false)} tokens，剩余 ${number(usage.remaining, false)} tokens。`,
    tokensHint: `当前会话累计 tokens：输入 ${number(usage.input, false)}，输出 ${number(usage.output, false)}，缓存读取 ${number(usage.cacheRead, false)}，缓存写入 ${number(usage.cacheWrite, false)}；总量 ${number(usage.total, false)}。推理 tokens 已包含在输出中。`,
    cacheHint: '当前会话累计缓存命中率 = 缓存读取 /（输入 + 缓存读取 + 缓存写入）。',
  } : {
    usage: 'Session usage', context: 'Context', remaining: 'Left', tokens: 'Usage', cache: 'Cache hits', hit: 'Hit rate', unavailable: 'Statistics unavailable',
    contextHint: `Context: ${number(usage.used, false)} / ${number(usage.window, false)} tokens; ${number(usage.remaining, false)} tokens remaining.`,
    tokensHint: `Session totals in tokens: input ${number(usage.input, false)}, output ${number(usage.output, false)}, cache read ${number(usage.cacheRead, false)}, cache write ${number(usage.cacheWrite, false)}; total ${number(usage.total, false)}. Reasoning is included in output.`,
    cacheHint: 'Session cache hit rate = cache read / (input + cache read + cache write).',
  };

  return <div className="session-usage" aria-label={text.usage}>
    <div className="session-context" title={text.contextHint}>
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
    </div>
  </div>;
}
