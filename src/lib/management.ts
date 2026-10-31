import { rpc } from './bridge';
import type { Json } from './types';

export interface ManagedItem extends Json { id: string; name: string; description?: string; source?: string; scope?: string; enabled?: boolean }
export const manage = <T = Json>(sessionId: string, resource: string, action: string, args: Json = {}) => rpc<T>(sessionId, 'desktop_manage', { resource, action, args });

export const lineValues = (text: string): string[] => text.split(/\r?\n/).map(value => value.trim()).filter(Boolean);

export function agentModelOptions(models: Json[], selected: string, query: string): { value: string; label: string }[] {
  const options = models.filter(model => model.kind === 'chat').map(model => ({ value: String(model.value), label: `${model.name ?? model.id} · ${model.provider}` }));
  if (selected && !options.some(option => option.value === selected)) options.unshift({ value: selected, label: selected });
  const search = query.toLocaleLowerCase();
  return options.filter(option => option.value === selected || `${option.value} ${option.label}`.toLocaleLowerCase().includes(search));
}

export function keyValueLines(text: string): Record<string, string> {
  return Object.fromEntries(lineValues(text).map(line => {
    const index = line.indexOf('=');
    const key = line.slice(0, index).trim();
    if (index < 1 || !key) throw new Error('请使用 名称=值，每行一项。 / Use name=value, one per line.');
    return [key, line.slice(index + 1).trim()];
  }));
}

export function settingInput(text: string, type?: string): unknown {
  if (type === 'number' || type === 'integer') {
    const value = Number(text);
    if (!text.trim() || !Number.isFinite(value) || type === 'integer' && !Number.isInteger(value)) throw new Error('请输入有效数字。 / Enter a valid number.');
    return value;
  }
  if (type === 'object' || type === 'array') {
    const value = JSON.parse(text);
    if (type === 'array' ? !Array.isArray(value) : !value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON 类型不匹配。 / JSON type does not match.');
    return value;
  }
  return text;
}
