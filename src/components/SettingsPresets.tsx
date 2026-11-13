import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Save } from 'lucide-react';
import { request, rpc } from '../lib/bridge';
import { sessionPathKey } from '../lib/session-identity';
import { settingView } from '../lib/settings-values';
import { BUILTIN_SETTINGS_PRESETS, PRESET_NAMES_EN, presetDesktopValues, presetGlobalValues, presetPreferencePatch, readSettingsPresetState, resolveSettingsPreset, settingsPresetFingerprint, type PresetDesktop, type PresetSettings, type PresetState, type SettingsPreset } from '../lib/settings-presets';
import type { Preferences } from '../lib/types';
import Select from './Select';
import './settings-presets.css';

type Context = { id: string; snapshot: PresetSettings; state: PresetState; key: string };
type Props = { preferences: Preferences; sessionId?: string; ensureSession?: () => Promise<string>; changePreferences: (patch: Partial<Preferences>) => Promise<Preferences> };
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const cancelled = () => new DOMException('Cancelled', 'AbortError');

export default function SettingsPresets({ preferences, sessionId, ensureSession, changePreferences }: Props) {
  const zh = preferences.language === 'zh';
  const [context, setContext] = useState<Context>();
  const [choice, setChoice] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const epoch = useRef(0);
  const loadingRevision = useRef(0);
  const previousSession = useRef(sessionId);
  const live = useRef({ preferences, ensureSession, changePreferences, busy }); live.current = { preferences, ensureSession, changePreferences, busy };
  const load = async (): Promise<Context> => {
    const current = epoch.current;
    const revision = ++loadingRevision.current;
    const id = sessionId ?? await live.current.ensureSession?.();
    if (!id) throw new Error(zh ? '请先选择项目，再读取全局设置。' : 'Choose a project to load global settings.');
    const snapshot = await rpc<PresetSettings>(id, 'desktop_settings', { operation: 'list' });
    if (!snapshot.profilePath) throw new Error(zh ? '更新 OMP 运行时后可使用设置预设。' : 'Update the OMP runtime to use settings presets.');
    presetGlobalValues(snapshot);
    const key = `settings-presets:${sessionPathKey(snapshot.profilePath)}`;
    const state = readSettingsPresetState(await request('desktop.state.get', { key }));
    if (current !== epoch.current || revision !== loadingRevision.current) throw cancelled();
    const next = { id, snapshot, state, key }; setContext(next); return next;
  };
  const showError = (value: unknown) => { if (!(value instanceof DOMException && value.name === 'AbortError')) setError(value instanceof Error ? value.message : String(value)); };
  useEffect(() => {
    epoch.current++; setContext(undefined); setError(''); setNotice('');
    if (previousSession.current && previousSession.current !== sessionId) setChoice('');
    previousSession.current = sessionId;
    const current = epoch.current;
    if (sessionId) { setBusy(true); void load().catch(showError).finally(() => { if (current === epoch.current) setBusy(false); }); }
    return () => { epoch.current++; };
  }, [sessionId]);
  useEffect(() => {
    const refresh = () => { if (sessionId && !live.current.busy) void load().catch(showError); };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [sessionId]);
  const presets = [...BUILTIN_SETTINGS_PRESETS, ...(context?.state.custom ?? [])];
  const fingerprint = context ? settingsPresetFingerprint(context.snapshot, preferences) : '';
  const active = !context?.state.pending && context?.state.active?.fingerprint === fingerprint ? context.state.active.id : 'custom';
  const label = (preset: SettingsPreset) => zh ? preset.name : PRESET_NAMES_EN[preset.id] ?? preset.name;
  const selected = context?.state.pending?.id === choice ? context.state.pending : presets.find(preset => preset.id === choice);
  let proposed: SettingsPreset | undefined, previewError = '';
  try { if (selected && context) proposed = resolveSettingsPreset(selected, context.snapshot); } catch (value) { previewError = String(value); }
  const before = context ? presetGlobalValues(context.snapshot) : {};
  const desktopBefore = presetDesktopValues(preferences);
  const desktopLabels: Record<keyof PresetDesktop, [string, string]> = { asyncQuestions: ['异步提问', 'Asynchronous questions'], showTurnNumber: ['显示轮次', 'Show turn numbers'], notifyOnDone: ['后台完成通知', 'Completion notifications'], reviews: ['结构化评审面板', 'Structured reviews'], genui: ['生成式UI', 'Generative UI'], usage: ['生成式UI使用偏好', 'Generative UI usage'] };
  const changes = proposed ? [
    ...Object.entries(proposed.desktop).filter(([key, value]) => !same(desktopBefore[key as keyof PresetDesktop], value)).map(([key, value]) => ({ key: `desktop:${key}`, label: desktopLabels[key as keyof PresetDesktop][zh ? 0 : 1], before: desktopBefore[key as keyof PresetDesktop], after: value, effective: undefined, source: '' })),
    ...Object.entries(proposed.omp).filter(([key, value]) => !same(before[key], value)).map(([key, value]) => {
      const row = context!.snapshot.settings.find(row => row.path === key)!;
      return { key, label: settingView(row, preferences.language).label, before: before[key], after: value, effective: row.effectiveValue ?? row.value, source: row.provenance };
    }),
  ] : [];
  const format = (value: unknown) => typeof value === 'boolean' ? value ? zh ? '开启' : 'On' : zh ? '关闭' : 'Off' : ({ explicit: zh ? '仅明确要求时' : 'Only when requested', auto: zh ? '适合时使用' : 'When useful', prefer: zh ? '优先使用' : 'Prefer', friendly: zh ? '友好' : 'Friendly', pragmatic: zh ? '务实' : 'Pragmatic', 'agent-end': zh ? '最终结果' : 'Final result', catalog: zh ? '按需目录' : 'On-demand catalog', off: zh ? '关闭' : 'Off', default: zh ? '默认' : 'Default', preferred: zh ? '优先委派' : 'Prefer delegation' }[String(value)] ?? String(value));
  const sourceName = (source: string) => ({ project: zh ? '项目' : 'Project', overlay: zh ? '启动配置' : 'Launch overlay', runtime: zh ? '运行时' : 'Runtime', env: zh ? '环境变量' : 'Environment', global: zh ? '全局' : 'Global', default: zh ? '默认' : 'Default' }[source] ?? source);
  const overrides = context?.snapshot.settings.filter(row => row.path in before && !['global', 'default'].includes(row.provenance) && !same(row.effectiveValue ?? row.value, before[row.path])) ?? [];
  const persist = async (target: Context, state: PresetState) => {
    const current = epoch.current;
    await request('desktop.state.set', { key: target.key, value: state });
    if (current !== epoch.current) throw cancelled();
    const next = { ...target, state }; setContext(next); return next;
  };
  const apply = async () => {
    if (!selected || !context || busy) return;
    const current = epoch.current, originalFingerprint = settingsPresetFingerprint(context.snapshot, live.current.preferences);
    const check = () => { if (current !== epoch.current) throw cancelled(); };
    setBusy(true); setError(''); setNotice('');
    try {
      let target = await load(); check();
      if (settingsPresetFingerprint(target.snapshot, live.current.preferences) !== originalFingerprint) { setNotice(zh ? '设置已变化，请核对更新后的预览再应用。' : 'Settings changed. Review the updated preview before applying.'); return; }
      const preset = resolveSettingsPreset(selected, target.snapshot);
      if (!same(preset, resolveSettingsPreset(selected, context.snapshot))) { setNotice(zh ? '可用配置已变化，请核对更新后的预览再应用。' : 'Available configuration changed. Review the updated preview before applying.'); return; }
      target = await persist(target, { ...target.state, active: undefined, pending: preset }); check();
      const global = presetGlobalValues(target.snapshot);
      const updates = Object.entries(preset.omp).filter(([key, value]) => !same(global[key], value));
      for (const [index, [key, value]] of updates.entries()) {
        check(); setProgress(`${index + 1} / ${updates.length} · ${key}`);
        await rpc(target.id, 'desktop_settings', { operation: 'set', key, value });
      }
      check();
      const saved = same(presetDesktopValues(live.current.preferences), preset.desktop) ? live.current.preferences : await live.current.changePreferences(presetPreferencePatch(preset, live.current.preferences));
      check(); live.current.preferences = saved;
      const snapshot = await rpc<PresetSettings>(target.id, 'desktop_settings', { operation: 'list' }); check();
      const actual = presetGlobalValues(snapshot);
      if (Object.entries(preset.omp).some(([key, value]) => !same(actual[key], value)) || !same(presetDesktopValues(saved), preset.desktop)) throw new Error(zh ? '部分设置尚未保存，可继续应用。' : 'Some settings are not saved yet. Continue applying.');
      await persist({ ...target, snapshot }, { ...target.state, pending: undefined, active: { id: preset.id, fingerprint: settingsPresetFingerprint(snapshot, saved) } });
      check(); setChoice(''); setNotice(zh ? '已应用。工具列表与计划设置在新连接生效，当前请求继续使用原配置。' : 'Applied. Tool and plan settings take effect on the next connection; current requests keep their configuration.');
    } catch (value) { showError(value); if (current === epoch.current) await load().catch(() => {}); }
    finally { if (current === epoch.current) { setBusy(false); setProgress(''); } }
  };
  const save = async () => {
    if (!name.trim() || busy) return;
    const current = epoch.current; setBusy(true); setError(''); setNotice('');
    try {
      const target = await load();
      if (target.state.custom.some(preset => preset.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase())) throw new Error(zh ? '该预设名称已存在，请换一个名称。' : 'A preset with this name already exists. Choose another name.');
      const preset: SettingsPreset = { id: `user:${crypto.randomUUID()}`, name: name.trim(), desktop: presetDesktopValues(live.current.preferences), omp: presetGlobalValues(target.snapshot) };
      await persist(target, { version: 1, custom: [...target.state.custom, preset], active: { id: preset.id, fingerprint: settingsPresetFingerprint(target.snapshot, live.current.preferences) } });
      if (current === epoch.current) { setName(''); setChoice(''); setNotice(zh ? '已保存当前设置。' : 'Current settings saved.'); }
    } catch (value) { showError(value); }
    finally { if (current === epoch.current) setBusy(false); }
  };
  const select = (id: string) => { setChoice(id); setError(''); setNotice(''); if (!context) { setBusy(true); void load().catch(showError).finally(() => setBusy(false)); } };
  return <section className="settings-presets" aria-label={zh ? '全局设置预设' : 'Global settings presets'}>
    <div className="settings-section-heading"><h3>{zh ? '工作预设' : 'Work presets'}</h3><button className="icon-button" title={zh ? '读取当前设置' : 'Read current settings'} aria-label={zh ? '读取当前设置' : 'Read current settings'} disabled={busy} onClick={() => { setBusy(true); void load().catch(showError).finally(() => setBusy(false)); }}><RefreshCw size={14} /></button></div>
    <p className="settings-hint">{zh ? '选择一组全局行为与界面设置，预览后应用。调整设置后会显示为自定义，也可以另存自己的预设。' : 'Choose global behavior and interface settings, then review and apply them. Editing a covered setting switches to Custom; save your own presets below.'}</p>
    <div className="preset-select"><span>{context?.state.pending ? zh ? '应用未完成' : 'Application incomplete' : active === 'custom' ? zh ? '当前：自定义' : 'Current: Custom' : `${zh ? '当前：' : 'Current: '}${label(presets.find(preset => preset.id === active) ?? { name: active } as SettingsPreset)}`}</span><Select label={zh ? '选择工作预设' : 'Choose a work preset'} disabled={busy} value={choice || active} options={[{ value: 'custom', label: zh ? '自定义' : 'Custom', disabled: true }, ...presets.map(preset => ({ value: preset.id, label: label(preset) }))]} onChange={select} /></div>
    {context?.state.pending && !choice && <button className="quiet-button" disabled={busy} onClick={() => select(context.state.pending!.id)}>{zh ? '继续应用' : 'Continue applying'} · {label(context.state.pending)}</button>}
    {choice === 'code-minimal' && <p className="settings-hint">{zh ? '保留读写编辑、文件搜索、命令、网络资料、异步提问与一个按需子代理；关闭语言服务、专用计划、生成式UI和额外自动运行。' : 'Keep file editing, search, commands, web references, asynchronous questions and one on-demand subagent. Turn off language servers, dedicated planning, Generative UI and extra automatic work.'}</p>}
    {proposed && <div className="preset-preview"><strong>{label(proposed)} · {changes.length} {zh ? '项更改' : 'changes'}</strong><p className="settings-hint">{zh ? '模型、压缩、凭据和组件选择沿用当前配置。' : 'Model, compaction, credentials and component choices follow the current configuration.'}</p>
      <div className="preset-change-list">{changes.map(change => <div className="preset-change" key={change.key}><span>{change.label}<code>{change.key.startsWith('desktop:') ? '' : change.key}</code></span><span>{format(change.before)} → <strong>{format(change.after)}</strong>{change.source && !['global', 'default'].includes(change.source) && <small>{zh ? '当前生效：' : 'Effective: '}{format(change.effective)} · {sourceName(change.source)}</small>}</span></div>)}</div>
      <div className="settings-actions"><button className="primary-button" disabled={busy || !!previewError} onClick={() => void apply()}>{busy ? zh ? '正在应用…' : 'Applying…' : zh ? '应用预设' : 'Apply preset'}</button><button className="quiet-button" disabled={busy} onClick={() => setChoice('')}>{zh ? '取消' : 'Cancel'}</button></div>
    </div>}
    {overrides.length > 0 && <details className="preset-overrides"><summary>{zh ? '项目与启动配置的实际覆盖' : 'Effective project and launch overrides'}</summary>{overrides.map(row => <div className="preset-change" key={row.path}><span>{settingView(row, preferences.language).label}<code>{row.path}</code></span><span>{format(row.effectiveValue ?? row.value)}<small>{sourceName(row.provenance)} · {zh ? '全局：' : 'Global: '}{format(before[row.path])}</small></span></div>)}</details>}
    {progress && <p className="settings-hint" role="status">{progress}</p>}{(error || previewError) && <p className="settings-error" role="alert">{error || previewError}</p>}{notice && <p className="settings-hint" role="status">{notice}</p>}
    <form className="preset-save" onSubmit={event => { event.preventDefault(); void save(); }}><input aria-label={zh ? '新预设名称' : 'New preset name'} placeholder={zh ? '将当前设置另存为…' : 'Save current settings as…'} value={name} maxLength={80} disabled={busy} onChange={event => setName(event.target.value)} /><button className="secondary-button" type="submit" disabled={busy || !name.trim()}><Save size={14} />{zh ? '保存预设' : 'Save preset'}</button></form>
  </section>;
}
