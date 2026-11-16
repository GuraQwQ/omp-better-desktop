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

const commonOptionsZh: Record<string, string> = { default: '默认', auto: '自动', on: '开启', off: '关闭', enabled: '开启', disabled: '关闭', true: '是', false: '否', global: '全局', project: '项目', never: '从不', always: '始终', inherit: '沿用上级', all: '全部', none: '无', minimal: '极低', low: '低', medium: '中', high: '高', xhigh: '更高', max: '最高', custom: '自定义', manual: '手动', system: '系统', light: '浅色', dark: '深色', stable: '稳定版', canary: '预览版' };

export function settingView(setting: Json, language: Language) {
  const translated = language === 'zh' ? settingsZh[setting.path ?? setting.id] : undefined;
  return {
    label: translated?.label ?? settingText(setting.ui?.label ?? setting.label ?? setting.path ?? setting.id),
    description: translated?.description ?? settingText(setting.ui?.description ?? setting.description),
    options: settingOptions(setting).map(option => ({ ...option, label: translated?.options?.[option.value] ?? (language === 'zh' ? commonOptionsZh[option.value] : undefined) ?? option.label })),
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
  if (setting.path === 'images.autoResize' || setting.path === 'images.blockImages') return 'model';
  // 原生界面行为集中保留；模型、认证、工具与共享运行策略仍按原分类显示。
  if (!settingManagedInDesktop(setting) || /^(?:tui\.|terminal\.|theme\.|statusLine\.|display\.|composer\.|spelling\.|paste\.|stt\.)/.test(setting.path)
    || ['symbolPreset', 'colorBlindMode', 'showHardwareCursor', 'doubleEscapeAction', 'treeFilterMode', 'autocompleteMaxVisible', 'emojiAutocomplete', 'autoResume', 'git.enabled', 'input.bareExitOnEmptySession', 'input.bareSlashCommands', 'startup.quiet', 'startup.showSplash', 'startup.setupWizard', 'startup.checkUpdate', 'startup.changelogMode', 'update.channel', 'update.auto', 'completion.notify', 'error.notify', 'ask.notify', 'recap.enabled', 'recap.idleSeconds', 'task.showResolvedModelBadge', 'btw.inject', 'extensionRenderers.assistantText', 'extensionRenderers.transcriptPresenters'].includes(setting.path)) return 'terminal';
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
