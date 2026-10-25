import type { Json } from './types';

export function settingText(value: unknown): string {
  return value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export function settingOptions(setting: Json): { value: string; label: string }[] {
  // 动态选项以 "runtime" 标记；只有具体的数组才生成下拉选项。
  const values = [setting.ui?.options, setting.enumValues, setting.values, setting.options].find(Array.isArray);
  return values?.flatMap(option => {
    const value = option && typeof option === 'object' ? option.value : option;
    if (!['string', 'number', 'boolean'].includes(typeof value)) return [];
    return [{ value: String(value), label: settingText(option?.label ?? value) }];
  }) ?? [];
}
