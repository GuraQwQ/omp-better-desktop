import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { rpc } from '../lib/bridge';
import type { GetTokenRateResult } from '../generated/rpc-wire';
import type { Language, SessionView } from '../lib/types';
import { sessionKey } from '../lib/session-identity';
import { isSessionRunning } from '../lib/session-state';
import { activeToolCallIds, sampleNativeRate } from '../lib/native-rate';

export type RateCache = Map<string, number | null>;
type RateView = { rate: number | null; language: Language; running: boolean; historyOnly: boolean; calls: Set<string> };
const RateContext = createContext<RateView | null>(null);

export function GenerationRateProvider({ session, language, cache, children }: { session?: SessionView; language: Language; cache: RateCache; children: ReactNode }) {
  const id = session?.id;
  const key = session ? sessionKey(session) : '';
  const historyOnly = !!session?.historyOnly;
  const running = !historyOnly && isSessionRunning(session);
  const [result, setResult] = useState<{ key: string; rate: number | null } | null>(null);
  const serial = useRef<Promise<number | null> | null>(null);
  const calls = useMemo(() => activeToolCallIds(session?.messages ?? []), [session?.messages]);

  useEffect(() => {
    if (!id || historyOnly) return;
    return sampleNativeRate(async () => (await rpc<GetTokenRateResult>(id, 'get_token_rate')).tokensPerSecond, rate => {
      cache.set(key, rate);
      setResult({ key, rate });
    }, running, serial);
  }, [id, key, historyOnly, running, cache]);

  const rate = !historyOnly && result?.key === key ? result.rate : cache.get(key) ?? null;
  const view = useMemo(() => ({ rate, language, running, historyOnly, calls }), [rate, language, running, historyOnly, calls]);
  return <RateContext.Provider value={view}>{children}</RateContext.Provider>;
}

function RateReadout({ view }: { view: RateView }) {
  const { rate, language, historyOnly } = view;
  const valid = typeof rate === 'number' && Number.isFinite(rate) && rate > 0;
  const value = valid ? new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(rate) : '—';
  const label = language === 'zh' ? 'OMP 生成速率' : 'OMP generation rate';
  const hint = language === 'zh'
    ? historyOnly ? '此会话最近一次 OMP 原生平滑速率。' : valid ? 'OMP 原生平滑生成速率；使用模型 tokenizer 计数，结束时按输出用量校准。' : '等待 OMP 原生生成速率。'
    : historyOnly ? 'Last native OMP smoothed rate for this conversation.' : valid ? 'Native OMP smoothed generation rate, using its model tokenizer and calibrated with final output usage.' : 'Waiting for the native OMP generation rate.';
  return <span className="generation-rate" aria-label={`${label}: ${value} tok/s`} title={hint}>{value} <span>tok/s</span></span>;
}

export default function GenerationRate() {
  const view = useContext(RateContext);
  if (!view || !(typeof view.rate === 'number' && Number.isFinite(view.rate) && view.rate > 0) && !view.running) return null;
  return <RateReadout view={view} />;
}

export function ToolGenerationRate({ callId }: { callId?: string }) {
  const view = useContext(RateContext);
  if (!view?.running || view.historyOnly || !callId || !view.calls.has(callId)) return null;
  return <span className="tool-live-rate"><span aria-hidden="true">·</span><RateReadout view={view} /></span>;
}
