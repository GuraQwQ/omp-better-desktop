import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ChevronRight } from 'lucide-react';
import { GENUI_CAPABILITIES, GENUI_COMPONENTS, GENUI_FEATURES, GENUI_GROUPS, normalizeGenUIConfiguration, buildGenUIInstructions, type GenUIConfiguration, type GenUIFeature, type GenUIGroup } from '../lib/genui-config';
import type { Language } from '../lib/types';
import { request } from '../lib/bridge';
import { GenUISettingsDraft } from '../lib/genui-settings-draft';
import './generative-ui-settings.css';

export default function GenerativeUISettings({ language, configuration, onChange }: { language: Language; configuration: unknown; onChange: (value: GenUIConfiguration) => void | Promise<void> }) {
  const zh = language === 'zh';
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [draft] = useState(() => new GenUISettingsDraft(configuration, value => onChangeRef.current(value)));
  const { configuration: config, saving, error: saveError } = useSyncExternalStore(draft.subscribe, draft.getSnapshot);
  useEffect(() => { draft.receive(configuration); }, [draft, configuration]);
  const [query, setQuery] = useState('');
  const [openGroups, setOpenGroups] = useState(() => new Set<GenUIGroup>(['layout', 'text', 'forms', 'tables']));
  const [closedSearchGroups, setClosedSearchGroups] = useState(() => new Set<GenUIGroup>());
  const [showInstructions, setShowInstructions] = useState(false);
  const [clearing, setClearing] = useState(false), [notice, setNotice] = useState('');
  const update = (patch: Partial<GenUIConfiguration>) => draft.update(current => ({ ...current, ...patch }));
  const toggleFeature = (name: GenUIFeature, enabled: boolean) => draft.update(current => {
    const features = { ...current.features, [name]: enabled };
    if (name === 'repair' && !enabled) features.autoRepair = false;
    if (name === 'autoRepair' && enabled) features.repair = true;
    return { ...current, features };
  });
  const choose = (names: string[], enabled: boolean) => draft.update(current => ({ ...current, components: enabled ? [...new Set([...current.components, ...names])] : current.components.filter(name => !names.includes(name)) }));
  const toggleGroup = (group: GenUIGroup) => {
    const change = (previous: Set<GenUIGroup>) => { const next = new Set(previous); if (next.has(group)) next.delete(group); else next.add(group); return next; };
    if (query.trim()) setClosedSearchGroups(change); else setOpenGroups(change);
  };
  const matching = GENUI_COMPONENTS.filter(item => `${item.name} ${item.label}`.toLowerCase().includes(query.trim().toLowerCase()));
  const groups = Object.keys(GENUI_GROUPS) as GenUIGroup[];
  return <section className="genui-settings">
    <h2>{zh ? '生成式UI' : 'Generative UI'}</h2>
    <div className="setting-row"><div><strong id="genui-enabled">{zh ? '生成可交互界面' : 'Generate interactive interfaces'}</strong><small>{zh ? '让助手使用 OpenUI Lang 或 HTML 呈现交互界面。组件选择同步决定模型说明和运行时注册。' : 'Let the assistant render interfaces with OpenUI Lang or HTML. Your selection controls both model instructions and runtime registration.'}</small></div><input className="capture-switch genui-master-switch" type="checkbox" role="switch" aria-labelledby="genui-enabled" checked={config.enabled} onChange={event => update({ enabled: event.target.checked })} /></div>
    <fieldset disabled={!config.enabled} className="genui-options">
      <legend>{zh ? '界面能力' : 'Interface features'}</legend>
      <div className="genui-feature-list">{Object.entries(GENUI_FEATURES).map(([name, feature]) => <label className="genui-setting-option" key={name}><input type="checkbox" checked={config.features[name as GenUIFeature]} onChange={event => toggleFeature(name as GenUIFeature, event.target.checked)} /><span><strong>{!zh && 'labelEn' in feature ? feature.labelEn : feature.label}</strong><small>{!zh && 'hintEn' in feature ? feature.hintEn : feature.hint}</small></span></label>)}</div>
      <h3>{zh ? '暴露给助手的组件' : 'Components available to the assistant'}</h3>
      <p className="settings-hint">{zh ? `已选 ${config.components.length} / ${GENUI_COMPONENTS.length} 项。选择越少，组件说明越短；地图和公式仅在实际使用时加载。` : `${config.components.length} / ${GENUI_COMPONENTS.length} selected. Fewer components mean shorter instructions. Maps and formulas load on use.`}</p>
      <input className="genui-component-search" type="search" aria-label={zh ? '搜索生成式UI组件' : 'Search Generative UI components'} placeholder={zh ? '搜索名称或用途…' : 'Search name or purpose…'} value={query} onChange={event => { setQuery(event.target.value); setClosedSearchGroups(new Set()); }} />
      {groups.map(group => {
        const items = matching.filter(item => item.group === group);
        if (!items.length) return null;
        const names = GENUI_COMPONENTS.filter(item => item.group === group).map(item => item.name);
        const count = names.filter(name => config.components.includes(name)).length;
        const open = query.trim() ? !closedSearchGroups.has(group) : openGroups.has(group);
        const contentId = `genui-components-${group}`;
        return <section className="genui-component-group" key={group}><button type="button" className="genui-group-toggle" aria-expanded={open} aria-controls={contentId} onClick={() => toggleGroup(group)}><ChevronRight size={14} aria-hidden="true" /><span>{GENUI_GROUPS[group]}</span><small>{count}/{names.length}</small></button><div id={contentId} className={`genui-group-reveal${open ? ' is-open' : ''}`} inert={!open} aria-hidden={!open}><div className="genui-group-inner"><div className="genui-group-tools"><button type="button" className="quiet-button" onClick={() => choose(names, true)}>{zh ? '全选此类' : 'Select group'}</button><button type="button" className="quiet-button" onClick={() => choose(names, false)}>{zh ? '清空此类' : 'Clear group'}</button></div><div className="genui-component-grid">{items.map(item => <label key={item.name} className="genui-component-option"><input type="checkbox" checked={config.components.includes(item.name)} onChange={event => choose([item.name], event.target.checked)} /><span>{item.label}<code>{item.name}</code></span></label>)}</div></div></div></section>;
      })}
      {!matching.length && <p role="status">{zh ? '没有匹配的组件。' : 'No matching components.'}</p>}
      <h3>{zh ? '宿主能力' : 'Host capabilities'}</h3>
      <div className="genui-feature-list">{GENUI_CAPABILITIES.map(item => <label key={item.name} className="genui-setting-option"><input type="checkbox" disabled={!config.features.hostCalls} checked={config.capabilities.includes(item.name)} onChange={event => { const enabled = event.target.checked; draft.update(current => ({ ...current, capabilities: enabled ? [...current.capabilities, item.name] : current.capabilities.filter(name => name !== item.name) })); }} /><span><strong>{item.label}</strong><small>{item.name}</small></span></label>)}</div>
      <div className="genui-instruction-preview"><button type="button" className="genui-group-toggle" aria-expanded={showInstructions} aria-controls="genui-model-instructions" onClick={() => setShowInstructions(value => !value)}><ChevronRight size={14} aria-hidden="true" /><span>{zh ? '查看当前模型说明' : 'View current model instructions'}</span></button><div id="genui-model-instructions" className={`genui-group-reveal${showInstructions ? ' is-open' : ''}`} inert={!showInstructions} aria-hidden={!showInstructions}><div className="genui-group-inner"><pre>{buildGenUIInstructions(config)}</pre></div></div></div>
    </fieldset>
    <div className="settings-actions"><button type="button" className="quiet-button" onClick={() => draft.update(current => ({ ...normalizeGenUIConfiguration(), enabled: current.enabled }))}>{zh ? '恢复默认选择' : 'Restore default selections'}</button><button type="button" className="quiet-button" disabled={clearing} onClick={() => { setClearing(true);setNotice('');void request<{cleared:number}>('genui.clear').then(value => setNotice(zh ? `已清空 ${value.cleared} 个已保存界面。` : `Cleared ${value.cleared} saved interfaces.`)).catch(error => setNotice(String(error))).finally(() => setClearing(false)); }}>{zh ? '清空已保存界面' : 'Clear saved interfaces'}</button></div>
    {saving && <p role="status" className="settings-hint">{zh ? '正在保存选择…' : 'Saving selections…'}</p>}
    {saveError && <div role="alert" className="genui-save-error"><p>{zh ? '选择尚未保存：' : 'Selections are not saved: '}{saveError}</p><button type="button" className="quiet-button" onClick={() => draft.retry()}>{zh ? '重试保存' : 'Retry saving'}</button></div>}
    {notice && <p role="status" className="settings-hint">{notice}</p>}
  </section>;
}
