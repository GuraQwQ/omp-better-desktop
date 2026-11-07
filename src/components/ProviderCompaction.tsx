import { useEffect, useRef, useState } from 'react';
import { rpc } from '../lib/bridge';
import { compactionThresholdChanges, formatCompactionThreshold } from '../lib/model-compaction';
import type { Json, Language } from '../lib/types';

export default function ProviderCompaction({ provider, model, sessionId, ensureSession, language }: { provider: string; model: string; sessionId?: string; ensureSession?: () => Promise<string>; language: Language }) {
  const zh = language === 'zh';
  const [providerInput, setProviderInput] = useState('');
  const [modelInput, setModelInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [source, setSource] = useState('');
  const revision = useRef(0);
  const loadedValues = useRef<Json>({});
  const active = useRef({ provider, model, sessionId });
  active.current = { provider, model, sessionId };
  const connect = () => sessionId ? Promise.resolve(sessionId) : ensureSession ? ensureSession() : Promise.reject(new Error(zh ? '请先选择项目。' : 'Choose a project first.'));
  const read = (id: string) => rpc<{ settings: Json[] }>(id, 'desktop_settings', { operation: 'list' });
  const show = (settings: Json[]) => {
    const field = settings.find(setting => setting.path === 'compaction.modelThresholds');
    const values = field?.value ?? field?.defaultValue ?? {};
    loadedValues.current = values;
    setProviderInput(formatCompactionThreshold(values[`${provider}/*`]));
    setModelInput(formatCompactionThreshold(values[`${provider}/${model}`]));
    setEnabled(settings.find(setting => setting.path === 'compaction.modelThresholdsEnabled')?.value !== false);
    setSource(typeof field?.provenance === 'string' ? field.provenance : '');
  };
  const load = async () => {
    const current = ++revision.current;
    setBusy(true); setError(''); setNotice('');
    try { const result = await read(await connect()); if (current === revision.current) show(result.settings); }
    catch (error) { if (current === revision.current) setError(error instanceof Error ? error.message : String(error)); }
    finally { if (current === revision.current) setBusy(false); }
  };
  useEffect(() => { setProviderInput(''); setModelInput(''); if (sessionId || ensureSession) void load(); return () => { revision.current++; }; }, [provider, model, sessionId]);
  const save = async () => {
    const current = ++revision.current;
    const target = { provider, model, sessionId };
    setBusy(true); setError(''); setNotice('');
    let saved = 0;
    try {
      const changes = compactionThresholdChanges(loadedValues.current, provider, model, providerInput, modelInput);
      const id = await connect();
      let result = await read(id);
      for (const change of changes) {
        if (current !== revision.current || target.provider !== active.current.provider || target.model !== active.current.model || target.sessionId !== active.current.sessionId) return;
        result = await rpc<{ settings: Json[] }>(id, 'desktop_settings', { operation: change.value === null ? 'unset' : 'set', key: 'compaction.modelThresholds', entry: change.entry, ...(change.value === null ? {} : { value: change.value }) });
        saved++;
      }
      if (current === revision.current) { show(result.settings); setNotice(zh ? '压缩阈值已保存。' : 'Compaction thresholds saved.'); }
    } catch (error) { if (current === revision.current) { setError(error instanceof Error ? error.message : String(error)); if (saved) setNotice(zh ? `${saved} 项已保存，其余修改可重试。` : `${saved} saved; retry the remaining changes.`); } }
    finally { if (current === revision.current) setBusy(false); }
  };
  return <section className="provider-compaction"><h4>{zh ? '自动压缩阈值' : 'Auto-compaction thresholds'}</h4><p className="provider-scope">{zh ? '单模型优先于提供商，再采用全局设置。填写百分比或固定 token 数，留空采用上一层。更改保存到当前 OMP 配置。' : 'Model overrides provider, then global settings. Enter a percentage or fixed token count; leave blank to inherit. Saved in the active OMP profile.'}</p><div className="provider-fields"><label>{zh ? '此提供商' : 'This provider'}<input value={providerInput} disabled={busy || !provider} placeholder="80% / 90k" onChange={event => { setProviderInput(event.target.value); setNotice(''); }} /></label>{model && <label>{zh ? '此模型' : 'This model'}<input value={modelInput} disabled={busy || !provider} placeholder={providerInput || (zh ? '采用提供商或全局设置' : 'Use provider or global settings')} onChange={event => { setModelInput(event.target.value); setNotice(''); }} /></label>}</div>{!enabled && <p className="provider-scope">{zh ? 'OMP 当前已停用模型阈值；可在 OMP 配置中开启 compaction.modelThresholdsEnabled。' : 'Model thresholds are disabled in OMP. Enable compaction.modelThresholdsEnabled in OMP settings.'}</p>}{source && source !== 'global' && source !== 'default' && <p className="provider-scope">{zh ? `实际来源：${source}，它可能覆盖这里保存的值。` : `Effective source: ${source}; it may override saved values.`}</p>}<div className="provider-form-actions"><button type="button" className="quiet-button" disabled={busy || !provider} onClick={() => void load()}>{zh ? '读取当前阈值' : 'Load thresholds'}</button><button type="button" className="quiet-button" disabled={busy || !provider} onClick={() => void save()}>{busy ? (zh ? '正在保存…' : 'Saving…') : (zh ? '保存阈值' : 'Save thresholds')}</button></div>{error && <p className="provider-error" role="alert">{error}</p>}{notice && <p className="provider-notice" role="status">{notice}</p>}</section>;
}
