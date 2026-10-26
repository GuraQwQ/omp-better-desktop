import { useEffect, useRef, useState } from 'react';
import { rpc } from '../lib/bridge';
import type { GetTokenRateResult } from '../generated/rpc-wire';
import type { Language, SessionView } from '../lib/types';
import { sessionKey } from '../lib/session-identity';

export type RateCache = Map<string, number | null>;

export default function GenerationRate({ session, language, cache }: { session?: SessionView; language: Language; cache: RateCache }) {
  const id = session?.id;
  const key = session ? sessionKey(session) : '';
  const historyOnly = session?.historyOnly;
  const running = !!session?.state.isStreaming || ['running', 'background'].includes(session?.status ?? '') || session?.state.isSettled === false;
  const [result, setResult] = useState<{ key: string; rate: number | null } | null>(null);
  const inFlight = useRef<Promise<GetTokenRateResult> | null>(null);

  useEffect(() => {
    if (!id || historyOnly) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sample = async () => {
      if (inFlight.current) await inFlight.current.catch(() => {});
      if (cancelled) return;
      const pending = rpc<GetTokenRateResult>(id, 'get_token_rate');
      inFlight.current = pending;
      try {
        const value = (await pending).tokensPerSecond;
        const rate = typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
        if (!cancelled) { cache.set(key, rate); setResult({ key, rate }); }
      } catch {
        if (!cancelled) setResult({ key, rate: null });
        return;
      } finally {
        if (inFlight.current === pending) inFlight.current = null;
      }
      // 只采样活动视图；终态由 running 变化立即补读，不唤醒历史会话。
      if (!cancelled && running) timer = setTimeout(sample, 500);
    };
    void sample();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [id, key, historyOnly, running, cache]);

  const rate = !historyOnly && result?.key === key ? result.rate : cache.get(key) ?? null;
  const valid = typeof rate === 'number' && Number.isFinite(rate) && rate > 0;
  if (!valid && !running) return null;
  const value = valid ? new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(rate) : '—';
  const label = language === 'zh' ? 'OMP 生成速率' : 'OMP generation rate';
  const hint = language === 'zh'
    ? historyOnly ? '此会话最近一次 OMP 原生平滑速率。' : valid ? 'OMP 原生平滑生成速率；使用模型 tokenizer 计数，结束时按输出用量校准。' : '等待足够的输出后显示 OMP 原生平滑速率。'
    : historyOnly ? 'Last native OMP smoothed rate for this conversation.' : valid ? 'Native OMP smoothed generation rate, using its model tokenizer and calibrated with final output usage.' : 'Native OMP rate appears after enough output has accumulated.';
  return <span className="generation-rate" aria-label={`${label}: ${value} tok/s`} title={hint}>{value} <span>tok/s</span></span>;
}
