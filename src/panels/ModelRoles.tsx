import { useEffect, useRef, useState } from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { rpc } from '../lib/bridge';
import { manage } from '../lib/management';
import type { Json, Language } from '../lib/types';
import Select from '../components/Select';
import './managed-resources.css';

export default function ModelRoles({ sessionId, language }: { sessionId: string; language: Language }) {
  const zh = language === 'zh';
  const [data, setData] = useState<Json>({ items: [], models: [] });
  const [storage, setStorage] = useState('global');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [presetName, setPresetName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState('');
  const revision = useRef(0);
  const load = async () => {
    const current = ++revision.current;
    setLoading(true); setError('');
    try {
      const [roles, settings] = await Promise.all([manage(sessionId, 'models', 'list'), rpc(sessionId, 'desktop_settings', { operation: 'list' })]);
      if (current === revision.current) {
        setData(roles);
        setStorage(settings.settings.find((setting: Json) => setting.path === 'modelRoleStorage')?.value ?? 'global');
      }
    } catch (error) { if (current === revision.current) setError(String(error)); }
    finally { if (current === revision.current) setLoading(false); }
  };
  useEffect(() => { void load(); return () => { revision.current++; }; }, [sessionId]);
  const act = async (id: string, action: () => Promise<unknown>) => {
    setBusy(id); setError(''); setNotice('');
    try {
      const result = await action() as Json | undefined;
      await load();
      setNotice(result?.restartRequired ? zh ? '已保存，新连接的会话生效。' : 'Saved. Applies on the next connection.' : zh ? '已保存。' : 'Saved.');
    } catch (error) { setError(String(error)); } finally { setBusy(''); }
  };
  return <section>
    <div className="settings-section-heading"><h2>{zh ? '模型角色' : 'Model roles'}</h2><button className="icon-button" title={zh ? '刷新' : 'Refresh'} disabled={!!busy || loading} onClick={() => void load()}><RefreshCw size={15} /></button></div>
    <p className="settings-hint">{zh ? '为不同任务分配模型。留空沿用 OMP 默认选择，当前运行中的任务继续使用原模型。' : 'Assign models to different tasks. Empty roles use OMP defaults; running tasks keep their current model.'}</p>
    {error && <p className="settings-error" role="alert">{error}</p>}
    {notice && <p className="settings-hint" role="status">{notice}</p>}
    <div className="setting-row"><strong>{zh ? '角色保存位置' : 'Save roles to'}</strong><Select label={zh ? '角色保存位置' : 'Save roles to'} value={storage} disabled={!!busy || loading} options={[{ value: 'global', label: zh ? '当前配置 · 全局' : 'Active profile · Global' }, { value: 'project', label: zh ? '当前项目' : 'Current project' }]} onChange={value => void act('storage', () => rpc(sessionId, 'desktop_settings', { operation: 'set', key: 'modelRoleStorage', value }))} /></div>
    <input className="settings-search" type="search" aria-label={zh ? '筛选候选模型' : 'Filter model candidates'} placeholder={zh ? '按名称、提供商筛选候选模型' : 'Filter candidates by name or provider'} value={query} onChange={event => setQuery(event.target.value)} />
    {loading ? <p role="status">{zh ? '正在读取…' : 'Loading…'}</p> : data.items.map((role: Json) => {
      const pool: Json[] = role.candidates ?? data.models;
      const selected = role.modelId ?? '';
      const selectedModel = pool.find(model => (model.value ?? `${model.provider}/${model.id}`) === selected);
      const thinkingLevels: string[] = selectedModel?.thinkingLevels ?? [];
      const candidates = pool.filter(model => `${model.name} ${model.id} ${model.provider}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
      const options = [{ value: '', label: zh ? '继承默认' : 'Inherit default' }, ...candidates.map(model => ({ value: model.value ?? `${model.provider}/${model.id}`, label: `${model.name ?? model.id} · ${model.provider}` }))];
      if (selected && !options.some(option => option.value === selected)) options.push({ value: selected, label: selected });
      return <div className="setting-editor" key={role.id}>
        <div className="setting-field-heading"><strong>{role.name ?? role.id}</strong><span className="setting-source">{role.id}{role.source ? ` · ${role.source}` : ''}</span></div>
        <div className="setting-edit-controls"><Select label={`${role.name ?? role.id} ${zh ? '模型' : 'model'}`} value={selected} disabled={!!busy} options={options} onChange={modelId => void act(role.id, () => manage(sessionId, 'models', 'set', { role: role.id, modelId: modelId || null }))} /><button className="quiet-button" disabled={!!busy || !selected} onClick={() => void act(role.id, () => manage(sessionId, 'models', 'set', { role: role.id, modelId: null }))}>{zh ? '清除覆盖' : 'Clear override'}</button></div>
        {selected && thinkingLevels.length > 0 && <details className="managed-detail"><summary><ChevronDown size={13} />{zh ? '高级设置' : 'Advanced settings'}</summary><label className="managed-field"><span>{zh ? '角色思考程度' : 'Role thinking level'}</span><Select label={`${role.name ?? role.id} ${zh ? '思考程度' : 'thinking level'}`} value={role.thinkingLevel ?? ''} disabled={!!busy} options={[{ value: '', label: zh ? '继承默认' : 'Inherit default' }, ...thinkingLevels.map((level: string) => ({ value: level, label: level }))]} onChange={thinkingLevel => void act(role.id, () => manage(sessionId, 'models', 'set', { role: role.id, modelId: selected, thinkingLevel: thinkingLevel || null }))} /></label></details>}
      </div>;
    })}
    <details className="managed-detail"><summary><ChevronDown size={14} />{zh ? '模型预设' : 'Model presets'}</summary>
      <form className="managed-inline-form" onSubmit={event => { event.preventDefault(); void act('preset', async () => { await manage(sessionId, 'models', 'preset_save', { name: presetName.trim() }); setPresetName(''); }); }}><input aria-label={zh ? '预设名称' : 'Preset name'} placeholder={zh ? '将当前角色分配保存为预设' : 'Save current role assignments'} required value={presetName} disabled={!!busy} onChange={event => setPresetName(event.target.value)} /><button type="submit" className="quiet-button" disabled={!!busy || !presetName.trim()}>{zh ? '保存' : 'Save'}</button></form>
      {(data.presets ?? []).map((preset: Json) => <div className="setting-row" key={preset.id}><strong>{preset.name}</strong><button className="quiet-button" disabled={!!busy} onClick={() => void act('preset', () => manage(sessionId, 'models', 'preset_apply', { name: preset.id }))}>{zh ? '应用' : 'Apply'}</button>{confirmDelete === preset.id ? <><button className="quiet-button" disabled={!!busy} onClick={() => void act('preset', async () => { await manage(sessionId, 'models', 'preset_delete', { name: preset.id }); setConfirmDelete(''); })}>{zh ? '确认删除' : 'Confirm delete'}</button><button className="quiet-button" onClick={() => setConfirmDelete('')}>{zh ? '取消' : 'Cancel'}</button></> : <button className="quiet-button" disabled={!!busy} onClick={() => setConfirmDelete(preset.id)}>{zh ? '删除' : 'Delete'}</button>}</div>)}
    </details>
  </section>;
}
