import type { ContextUsage, TokenUsage } from '../generated/rpc-wire';

type Stats = { contextUsage?: Partial<ContextUsage> | null; tokens?: Partial<TokenUsage> | null };

const amount = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

export function summarizeSessionUsage(stats?: Stats | null) {
  const used = amount(stats?.contextUsage?.tokens);
  const window = amount(stats?.contextUsage?.contextWindow);
  const input = amount(stats?.tokens?.input);
  const cacheRead = amount(stats?.tokens?.cacheRead);
  const cacheWrite = amount(stats?.tokens?.cacheWrite);
  const cacheInput = input !== null && cacheRead !== null && cacheWrite !== null ? input + cacheRead + cacheWrite : null;
  return {
    used,
    window,
    remaining: used !== null && window !== null ? Math.max(0, window - used) : null,
    contextPercent: amount(stats?.contextUsage?.percent) ?? (used !== null && window !== null && window > 0 ? used / window * 100 : null),
    total: amount(stats?.tokens?.total),
    input,
    output: amount(stats?.tokens?.output),
    cacheRead,
    cacheWrite,
    cacheHitPercent: cacheRead !== null && cacheInput !== null && cacheInput > 0 ? cacheRead / cacheInput * 100 : null,
  };
}

export function formatUsageAmount(value: number | null, language: 'zh' | 'en', compact = true) {
  return value === null ? '—' : new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
    ...(compact ? { notation: 'compact' as const } : {}), maximumFractionDigits: compact ? 1 : 0,
  }).format(value);
}
