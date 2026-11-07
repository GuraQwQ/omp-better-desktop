export function parseCompactionThreshold(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  const percent = /^(\d+(?:\.\d+)?)%$/.exec(value);
  if (percent && Number(percent[1]) > 0 && Number(percent[1]) <= 100) return `${Number(percent[1])}%`;
  const tokens = /^(?:f)?(\d+)([km])?$/i.exec(value);
  if (tokens) {
    const number = Number(tokens[1]) * (tokens[2]?.toLowerCase() === 'm' ? 1_000_000 : tokens[2]?.toLowerCase() === 'k' ? 1000 : 1);
    if (Number.isSafeInteger(number) && number > 0) return `f${number}`;
  }
  throw new Error('请输入 1–100% 或正整数 token 数，例如 80%、90000、90k、1m。');
}

export const formatCompactionThreshold = (value: unknown) => typeof value === 'number' ? String(value) : typeof value === 'string' ? value.replace(/^f/i, '') : '';

export function compactionThresholdChanges(previous: Record<string, unknown>, provider: string, model: string, providerInput: string, modelInput: string): { entry: string; value: string | null }[] {
  if (!provider || provider.includes('/') || provider.includes('*')) throw new Error('请先填写有效的提供商名称。');
  return [[`${provider}/*`, providerInput], ...(model ? [[`${provider}/${model}`, modelInput]] : [])]
    .filter(([entry, input]) => input !== formatCompactionThreshold(previous[entry]))
    .map(([entry, input]) => ({ entry, value: parseCompactionThreshold(input) }));
}
