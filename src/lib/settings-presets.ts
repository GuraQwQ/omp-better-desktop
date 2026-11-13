import { normalizeGenUIConfiguration } from './genui-config';
import type { Preferences } from './types';

type Value = string | number | boolean;
export type PresetDesktop = { asyncQuestions: boolean; showTurnNumber: boolean; notifyOnDone: boolean; reviews: boolean; genui: boolean; usage: 'explicit' | 'auto' | 'prefer' };
export interface SettingsPreset { id: string; name: string; desktop: PresetDesktop; omp: Record<string, Value>; advisorWhenConfigured?: boolean }
export interface PresetSetting { path: string; type: string; defaultValue?: unknown; globalValue?: unknown; value?: unknown; effectiveValue?: unknown; provenance: string; enumValues?: string[]; ui?: Record<string, any> }
export interface PresetSettings { settings: PresetSetting[]; profilePath: string; advisorConfigured: boolean }
export interface PresetState { version: 1; custom: SettingsPreset[]; active?: { id: string; fingerprint: string }; pending?: SettingsPreset }

const common = {
  personality: 'pragmatic',
  'ask.enabled': true, 'async.enabled': true, 'async.widgets': false,
  'grep.enabled': true, 'glob.enabled': true, 'find.enabled': 'auto', 'bash.enabled': true, 'fetch.enabled': true, 'web_search.enabled': true,
  'tools.xdev': true, 'tools.xdevDocs': 'catalog', 'tools.intentTracing': false, 'tools.speculativeExecution.enabled': false,
  'composer.predictions': false, 'recap.enabled': false, 'autolearn.enabled': false, 'autolearn.autoContinue': false,
  'prewalk.enabled': false, 'prewalk.auto': 'off', 'task.prewalk': false, 'task.speculativeLaunch': false,
  'task.eager': 'default', 'task.batch': false, 'task.structured': false, 'task.maxConcurrency': 1, 'task.maxRecursionDepth': 1, 'task.enableLsp': false,
  'lsp.enabled': false, 'lsp.lazy': true, 'lsp.shared': true, 'lsp.diagnosticsOnWrite': false, 'lsp.diagnosticsOnEdit': false, 'lsp.diagnosticsDeduplicate': true,
  'plan.enabled': false, 'plan.defaultOnStartup': false, 'plan.autosave': false,
  'advisor.enabled': false, 'advisor.reviewMode': 'agent-end',
  'debug.enabled': false, 'launch.enabled': false, 'astEdit.enabled': false, 'archive.enabled': false, 'out.enabled': false,
  'todo.enabled': true, 'todo.eager': 'default', 'todo.reminders': false, includeWorkspaceTree: false, skillful: true,
} satisfies Record<string, Value>;
const desktop = (genui: boolean, usage: PresetDesktop['usage'], reviews = false): PresetDesktop => ({ asyncQuestions: true, showTurnNumber: true, notifyOnDone: true, reviews, genui, usage });
const code = { 'task.batch': true, 'task.maxConcurrency': 2, 'task.maxRecursionDepth': 1, 'lsp.enabled': true, 'lsp.diagnosticsOnWrite': true, 'plan.enabled': true, 'debug.enabled': true, 'launch.enabled': true, 'astEdit.enabled': true, 'archive.enabled': true, 'out.enabled': true, 'todo.reminders': true };

export const BUILTIN_SETTINGS_PRESETS: SettingsPreset[] = [
  { id: 'learning', name: '学习', desktop: desktop(true, 'prefer'), omp: { ...common, personality: 'friendly', 'out.enabled': true } },
  { id: 'office', name: '办公', desktop: { ...desktop(true, 'auto'), showTurnNumber: false }, omp: { ...common, 'archive.enabled': true, 'out.enabled': true } },
  { id: 'code', name: '代码', desktop: desktop(true, 'auto'), omp: { ...common, ...code } },
  { id: 'code-minimal', name: '代码－极简', desktop: desktop(false, 'explicit'), omp: { ...common } },
  { id: 'code-full', name: '代码－完全', desktop: desktop(true, 'auto', true), omp: { ...common, ...code, 'task.eager': 'preferred', 'task.structured': true, 'task.maxConcurrency': 4, 'task.maxRecursionDepth': 2, 'task.enableLsp': true, 'lsp.diagnosticsOnEdit': true, 'plan.autosave': true }, advisorWhenConfigured: true },
  { id: 'chat', name: '聊天', desktop: { ...desktop(false, 'explicit'), showTurnNumber: false, notifyOnDone: false }, omp: { ...common, personality: 'friendly' } },
];
export const PRESET_OMP_KEYS = Object.keys(common);
export const PRESET_NAMES_EN: Record<string, string> = { learning: 'Learning', office: 'Office', code: 'Code', 'code-minimal': 'Code · Minimal', 'code-full': 'Code · Complete', chat: 'Chat' };

export function presetDesktopValues(preferences: Preferences): PresetDesktop {
  const config = normalizeGenUIConfiguration(preferences.generativeUI);
  return { asyncQuestions: preferences.asyncQuestions !== false, showTurnNumber: preferences.showTurnNumber !== false, notifyOnDone: preferences.notifyOnDone !== false, reviews: preferences.features?.reviews === true, genui: config.enabled, usage: config.usage };
}

export function presetPreferencePatch(preset: SettingsPreset, preferences: Preferences): Partial<Preferences> {
  const values = preset.desktop;
  return { asyncQuestions: values.asyncQuestions, showTurnNumber: values.showTurnNumber, notifyOnDone: values.notifyOnDone, features: { ...preferences.features, reviews: values.reviews }, generativeUI: { ...normalizeGenUIConfiguration(preferences.generativeUI), enabled: values.genui, usage: values.usage } };
}

export function presetGlobalValues(snapshot: PresetSettings): Record<string, Value> {
  const rows = new Map(snapshot.settings.map(row => [row.path, row]));
  return Object.fromEntries(PRESET_OMP_KEYS.map(key => {
    const row = rows.get(key);
    if (!row) throw new Error(`运行时缺少预设配置项：${key} / Preset setting is missing: ${key}`);
    const value = row.globalValue ?? row.defaultValue;
    if (!['boolean', 'number', 'string'].includes(typeof value)) throw new Error(`无法读取预设配置项：${key} / Preset setting could not be read: ${key}`);
    return [key, value as Value];
  }));
}

export function resolveSettingsPreset(preset: SettingsPreset, snapshot: PresetSettings): SettingsPreset {
  const resolved = { ...preset, desktop: { ...preset.desktop }, omp: { ...preset.omp } };
  if (resolved.advisorWhenConfigured) resolved.omp['advisor.enabled'] = snapshot.advisorConfigured === true;
  for (const [key, value] of Object.entries(resolved.omp)) {
    const row = snapshot.settings.find(row => row.path === key);
    if (!row || row.type === 'boolean' && typeof value !== 'boolean' || row.type === 'number' && typeof value !== 'number' || row.type === 'enum' && !row.enumValues?.includes(String(value))) throw new Error(`预设与运行时配置不匹配：${key} / Preset does not match the runtime: ${key}`);
  }
  delete resolved.advisorWhenConfigured;
  return resolved;
}

export function settingsPresetFingerprint(snapshot: PresetSettings, preferences: Preferences): string {
  return JSON.stringify({ desktop: presetDesktopValues(preferences), omp: presetGlobalValues(snapshot) });
}

export function readSettingsPresetState(value: unknown): PresetState {
  if (value == null) return { version: 1, custom: [] };
  const state = value as PresetState;
  const valid = (preset: SettingsPreset) => preset && typeof preset.id === 'string' && typeof preset.name === 'string' && preset.desktop && ['asyncQuestions', 'showTurnNumber', 'notifyOnDone', 'reviews', 'genui'].every(key => typeof preset.desktop[key as keyof PresetDesktop] === 'boolean') && ['explicit', 'auto', 'prefer'].includes(preset.desktop.usage) && preset.omp && PRESET_OMP_KEYS.every(key => typeof preset.omp[key] === typeof common[key as keyof typeof common]) && Object.keys(preset.omp).every(key => PRESET_OMP_KEYS.includes(key));
  if (state.version !== 1 || !Array.isArray(state.custom) || !state.custom.every(valid) || state.active && (typeof state.active.id !== 'string' || typeof state.active.fingerprint !== 'string') || state.pending && !valid(state.pending)) throw new Error('无法读取已保存的预设，请重试。 / Saved presets could not be read. Retry.');
  return state;
}
