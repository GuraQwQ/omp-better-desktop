import type { Json, Language } from './types';
import { settingsZh } from './settings-zh';

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

export function settingOptionValues(setting: Json): (string | number | boolean)[] {
  const values = [setting.ui?.options, setting.enumValues, setting.values, setting.options].find(Array.isArray);
  return values?.flatMap(option => {
    const value = option && typeof option === 'object' ? option.value : option;
    return ['string', 'number', 'boolean'].includes(typeof value) ? [value] : [];
  }) ?? [];
}

export function settingView(setting: Json, language: Language) {
  const translated = language === 'zh' ? settingsZh[setting.path ?? setting.id] : undefined;
  return {
    label: translated?.label ?? settingText(setting.ui?.label ?? setting.label ?? setting.path ?? setting.id),
    description: translated?.description ?? settingText(setting.ui?.description ?? setting.description),
    options: settingOptions(setting).map(option => ({ ...option, label: translated?.options?.[option.value] ?? option.label })),
  };
}

export function parseSettingInput(setting: Json, text: string): unknown {
  if (setting.type === 'number') {
    if (!text.trim() || !Number.isFinite(Number(text))) throw Error('number');
    return Number(text);
  }
  if (setting.type === 'boolean') {
    if (!['true', 'false'].includes(text.trim())) throw Error('boolean');
    return text.trim() === 'true';
  }
  if (['array', 'record', 'object'].includes(setting.type)) {
    const value = JSON.parse(text);
    if (setting.type === 'array' ? !Array.isArray(value) : !value || typeof value !== 'object' || Array.isArray(value)) throw Error('json');
    return value;
  }
  return text;
}

export interface SettingRecordRow { key: string; text: string; type: string }

export function parseSettingRecord(rows: SettingRecordRow[], numeric = false): Json {
  const entries: [string, unknown][] = [];
  const names = new Set<string>();
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) { if (row.text !== '') throw Error('key'); continue; }
    if (names.has(key)) throw Error('key');
    names.add(key);
    entries.push([key, parseSettingInput({ type: numeric ? 'number' : row.type }, row.text)]);
  }
  return Object.fromEntries(entries);
}

export function parseSettingLines(text: string): string[] {
  return text === '' ? [] : text.split(/\r?\n/);
}

export function settingCategory(setting: Json): string {
  return setting.ui?.tab ?? 'advanced';
}

export function settingApplicable(setting: Json, values: Json): boolean {
  const conditions: Record<string, boolean> = {
    advisorEnabled: values['advisor.enabled'] === true,
    hindsightActive: values['memory.backend'] === 'hindsight',
    mnemopiActive: values['memory.backend'] === 'mnemopi',
    autolearnActive: values['autolearn.enabled'] === true,
    autoThinkingActive: values.defaultThinkingLevel === 'auto',
    usageAwareFallbackEnabled: values['retry.usageAwareFallback'] === true,
    planModeEnabled: values['plan.enabled'] === true,
    planAutosaveEnabled: values['plan.enabled'] === true && values['plan.autosave'] === true,
    unexpectedStopDetection: values['features.unexpectedStopDetection'] === true,
  };
  return conditions[setting.ui?.condition] ?? true;
}

export function settingManagedInDesktop(setting: Json): boolean {
  return !/^skills\.(enable(?:Codex|Claude|Pi|Agents)(?:User|Project)|customDirectories)$/.test(setting.path);
}

export function settingMatches(setting: Json, query: string, language: Language): boolean {
  const view = settingView(setting, language);
  return [setting.path, setting.ui?.label, setting.ui?.description, view.label, view.description, setting.ui?.group].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}
