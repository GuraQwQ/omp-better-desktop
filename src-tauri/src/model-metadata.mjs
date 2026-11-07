import bundledCapabilities from './model-capabilities.json' with { type: 'json' };
import officialCapabilities from './model-capabilities-overrides.json' with { type: 'json' };

export const capabilityFields = ['contextWindow', 'maxContextWindow', 'maxTokens', 'reasoning', 'input', 'supportsTools'];
const capabilitiesRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const positiveTokens = value => {
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
};

export function normalizeModelId(id) {
  return id.normalize('NFKC').trim().toLowerCase().replace(/^models\//, '').split('/').at(-1)
    .replace(/^(?:(?:us|eu|apac)\.)?(?:openai|anthropic|google|deepseek-ai|moonshotai|qwen|zhipu)[.]/, '')
    .replace(/(?:-v\d+(?::\d+)?|:v?\d+(?::\d+)?)$/, '').replace(/[\s._-]+/g, '');
}

const indexedCapabilities = new Map();
for (const row of [...bundledCapabilities.models, ...officialCapabilities.models]) {
  const key = normalizeModelId(row.id);
  indexedCapabilities.set(key, { ...indexedCapabilities.get(key), ...row });
}

export function lookupModelCapabilities(id) {
  const key = normalizeModelId(id);
  const exact = indexedCapabilities.get(key);
  if (exact) return { ...exact, input: exact.input && [...exact.input] };
  // 仅识别目录中已有型号的日期快照和 latest，未知代际及能力变体继续由接口或用户配置。
  const candidates = [...indexedCapabilities].filter(([base]) => key.startsWith(base) && /^(?:\d{6,8}|latest)$/.test(key.slice(base.length)));
  candidates.sort(([left], [right]) => right.length - left.length);
  const row = candidates[0]?.[1];
  return row ? { ...row, input: row.input && [...row.input] } : undefined;
}

export function readModelCapabilities(value) {
  if (!capabilitiesRecord(value)) return {};
  const result = {};
  const limits = {
    contextWindow: [value.contextWindow, value.context_window, value.context_length, value.top_provider?.context_length],
    maxContextWindow: [value.maxContextWindow, value.max_context_window],
    maxTokens: [value.maxTokens, value.max_tokens, value.max_output_tokens, value.outputTokenLimit, value.top_provider?.max_completion_tokens],
  };
  for (const [field, values] of Object.entries(limits)) {
    const tokens = values.map(positiveTokens).find(number => number !== undefined);
    if (tokens !== undefined) result[field] = tokens;
  }
  if (result.maxContextWindow && result.contextWindow && result.maxContextWindow < result.contextWindow) delete result.maxContextWindow;
  for (const field of ['reasoning', 'supportsTools']) if (typeof value[field] === 'boolean') result[field] = value[field];
  const capabilities = value.capabilities;
  if (typeof capabilities?.thinking?.supported === 'boolean') result.reasoning = capabilities.thinking.supported;
  if (typeof capabilities?.tool_calling?.supported === 'boolean') result.supportsTools = capabilities.tool_calling.supported;
  const modalities = value.input ?? value.input_modalities ?? value.architecture?.input_modalities;
  if (Array.isArray(modalities)) {
    const input = [...new Set(modalities.filter(item => typeof item === 'string').map(item => item.toLowerCase()).filter(item => ['text', 'image'].includes(item)))];
    if (input.length) result.input = input;
  } else if (typeof capabilities?.image_input?.supported === 'boolean') {
    result.input = capabilities.image_input.supported ? ['text', 'image'] : ['text'];
  }
  return result;
}

export function inferredModelCapabilities(id, supplied = {}) {
  const known = lookupModelCapabilities(id);
  const fields = { ...readModelCapabilities(known), ...readModelCapabilities(supplied) };
  const maxInputTokens = capabilitiesRecord(supplied) ? positiveTokens(supplied.maxInputTokens ?? supplied.inputTokenLimit ?? supplied.max_input_tokens) : undefined;
  return { fields, maxInputTokens: maxInputTokens ?? known?.maxInputTokens, source: Object.keys(readModelCapabilities(supplied)).length ? (typeof supplied.capabilitySource === 'string' ? supplied.capabilitySource : 'api') : known?.source, modalities: known?.modalities ?? fields.input };
}
