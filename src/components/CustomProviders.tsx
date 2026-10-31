import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, RefreshCw } from 'lucide-react';
import { request } from '../lib/bridge';
import type { Copy } from '../lib/i18n';
import type { Bootstrap, Json } from '../lib/types';
import Select from './Select';
import './custom-providers.css';

interface Provider { id: string; api: string; baseUrl: string; hasApiKey: boolean; models: (Json & { id: string })[]; options: Json }
interface Configuration { configPath: string; takeover: { enabled: boolean; active: boolean; unknown?: boolean }; providers: Provider[]; savedProvider?: string }
const protocols = [{ value: 'openai-completions', label: 'OpenAI Chat Completions' }, { value: 'openai-responses', label: 'OpenAI Responses' }, { value: 'anthropic-messages', label: 'Anthropic Messages' }];
const modelFields = ['name', 'api', 'baseUrl', 'contextWindow', 'maxContextWindow', 'maxTokens', 'reasoning', 'input', 'supportsTools', 'cost', 'headers', 'compat', 'omitMaxOutputTokens', 'preferWebsockets', 'compactionModel'];
const modelList = (value: string) => [...new Set(value.split(/\r?\n/).map(value => value.trim()).filter(Boolean))];
const jsonText = (value: unknown) => value == null ? '' : JSON.stringify(value, null, 2);
function jsonObject(value: string, label: string, invalid: string) {
  if (!value.trim()) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw Error(`${label}: ${invalid}`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error(`${label}: ${invalid}`);
  return parsed;
}

function HeadersEditor({ value, onChange, disabled, label, add, remove }: { value?: Record<string, string>; onChange: (value: Record<string, string> | null) => void; disabled: boolean; label: string; add: string; remove: string }) {
  const [rows, setRows] = useState<[string, string][]>(() => Object.entries(value ?? {}));
  const source = JSON.stringify(value ?? {});
  const emitted = useRef(source);
  useEffect(() => { if (source !== emitted.current) setRows(Object.entries(value ?? {})); emitted.current = source; }, [source]);
  const change = (next: [string, string][]) => {
    setRows(next);
    const entries = next.filter(([key]) => key.trim()).map(([key, text]) => [key.trim(), text]);
    const headers = entries.length ? Object.fromEntries(entries) : null;
    emitted.current = JSON.stringify(headers ?? {});
    onChange(headers);
  };
  return <div className="provider-headers"><span>{label}</span>{rows.map(([key, text], index) => <div className="provider-header-row" key={index}><input aria-label={`${label} ${index + 1} key`} value={key} disabled={disabled} placeholder="Header" onChange={event => change(rows.map((row, i) => i === index ? [event.target.value, text] : row))} /><input aria-label={`${label} ${index + 1} value`} value={text} disabled={disabled} placeholder="Value" onChange={event => change(rows.map((row, i) => i === index ? [key, event.target.value] : row))} /><button type="button" className="quiet-button" disabled={disabled} aria-label={`${remove} ${key || index + 1}`} onClick={() => change(rows.filter((_, i) => i !== index))}>{remove}</button></div>)}<button type="button" className="quiet-button" disabled={disabled} onClick={() => setRows([...rows, ['', '']])}>{add}</button></div>;
}

export default function CustomProviders({ bootstrap, t, cwd }: { bootstrap: Bootstrap; t: Copy; cwd: string }) {
  const [configuration, setConfiguration] = useState<Configuration | null>(null);
  const [selected, setSelected] = useState('');
  const [id, setId] = useState('');
  const [api, setApi] = useState('openai-completions');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [modelIds, setModelIds] = useState('');
  const [models, setModels] = useState<{ id: string; name?: string }[]>([]);
  const [working, setWorking] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [options, setOptions] = useState<Json>({ discovery: { type: 'openai-models-list' } });
  const [modelSettings, setModelSettings] = useState<Record<string, Json>>({});
  const [modelSelection, setModelSelection] = useState('');
  const [compat, setCompat] = useState('');
  const [modelCompat, setModelCompat] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const revision = useRef(0);
  const contextRevision = useRef(0);
  const zh = bootstrap.preferences.language === 'zh';
  const text = zh ? {
    advanced: '高级设置', defaults: '模型参数默认采用供应商目录与 OMP 标准，填写后覆盖。', standard: '采用标准', authentication: '认证方式', noAuth: '无需认证', transport: '传输方式', native: 'OMP 原生网关', authHeader: '发送 Bearer 认证头', strict: '停用严格工具参数', discovery: '模型发现', manual: '手动模型列表', timeout: '发现超时（毫秒）', headers: '请求头', addHeader: '添加请求头', compatibility: '兼容参数（JSON）', model: '模型覆盖', name: '显示名称', context: '上下文长度', extended: '扩展上下文长度', output: '最大输出长度', reasoning: '推理能力', input: '输入类型', tools: '工具调用', text: '文本', textImage: '文本与图片', image: '图片', omitOutput: '省略输出上限参数', websockets: '优先 WebSocket', compression: '压缩模型', cost: '费用 / 百万 token', inputCost: '输入', outputCost: '输出', cacheReadCost: '缓存读取', cacheWriteCost: '缓存写入', costHint: '覆盖费用时填写四项；留空采用标准。', reset: '清除以上覆盖', remove: '删除提供商', removeConfirm: '确认删除此提供商？', removed: '提供商已删除。', required: '请填写提供商名称、地址，以及认证和模型来源。',
  } : {
    advanced: 'Advanced settings', defaults: 'Models use provider catalog and OMP defaults. Filled fields override them.', standard: 'Use defaults', authentication: 'Authentication', noAuth: 'No authentication', transport: 'Transport', native: 'OMP native gateway', authHeader: 'Send Bearer authorization header', strict: 'Disable strict tool parameters', discovery: 'Model discovery', manual: 'Manual model list', timeout: 'Discovery timeout (ms)', headers: 'Headers', addHeader: 'Add header', compatibility: 'Compatibility (JSON)', model: 'Model overrides', name: 'Display name', context: 'Context length', extended: 'Extended context length', output: 'Maximum output', reasoning: 'Reasoning', input: 'Input', tools: 'Tool calling', text: 'Text', textImage: 'Text and images', image: 'Images', omitOutput: 'Omit output cap parameter', websockets: 'Prefer WebSocket', compression: 'Compaction model', cost: 'Cost / million tokens', inputCost: 'Input', outputCost: 'Output', cacheReadCost: 'Cache read', cacheWriteCost: 'Cache write', costHint: 'Fill all four prices to override costs; leave blank for defaults.', reset: 'Clear these overrides', remove: 'Delete provider', removeConfirm: 'Delete this provider?', removed: 'Provider deleted.', required: 'Enter a provider name, URL, authentication and model source.',
  };
  const stored = configuration?.providers.find(provider => provider.id === id.trim());
  const hasKey = !!apiKey.trim() || !!stored?.hasApiKey;
  const needsKey = !['none', 'oauth'].includes(options.auth);
  const locked = working === 'save' || working === 'delete';
  const ids = modelList(modelIds);
  const availableIds = [...new Set([...ids, ...models.map(model => model.id)])];
  const activeModel = availableIds.includes(modelSelection) ? modelSelection : availableIds[0] ?? '';
  const currentModel = modelSettings[activeModel] ?? {};
  const discoveryOptions = JSON.stringify(options);
  const load = useCallback(async () => {
    const current = ++contextRevision.current;
    revision.current++;
    setConfiguration(null); setWorking(''); loadFields();
    try { const result = await request<Configuration>('providers.config', { operation: 'list', cwd }); if (current === contextRevision.current) { setConfiguration(result); setError(''); } }
    catch (error) { if (current === contextRevision.current) setError(error instanceof Error ? error.message : String(error)); }
  }, [cwd]);
  useEffect(() => { if (bootstrap.runtime) void load(); return () => { revision.current++; contextRevision.current++; }; }, [bootstrap.dataRoot, !!bootstrap.runtime, load]);
  const discover = useCallback(async () => {
    if (!baseUrl.trim() || needsKey && !hasKey) return;
    const current = ++revision.current;
    setWorking('fetch'); setError(''); setModels([]);
    try {
      const result = await request<{ models: { id: string; name?: string }[] }>('providers.discover', { cwd, provider: { id, api, baseUrl, apiKey, options: JSON.parse(discoveryOptions) } });
      if (revision.current === current) { setModels(result.models); if (!result.models.length) setError(t.providerNoModels); }
    } catch { if (revision.current === current) setError(t.providerDiscoveryFailed); }
    finally { if (revision.current === current) setWorking(''); }
  }, [cwd, id, api, baseUrl, apiKey, hasKey, needsKey, discoveryOptions, t.providerNoModels, t.providerDiscoveryFailed]);
  useEffect(() => {
    if (notice || !baseUrl.trim() || needsKey && !hasKey) return;
    const timer = setTimeout(() => void discover(), 800);
    return () => { clearTimeout(timer); revision.current++; };
  }, [discover, notice]);
  const edit = (change: () => void) => { revision.current++; setNotice(''); setError(''); setModels([]); setWorking(''); setConfirmDelete(false); change(); };
  function loadFields(provider?: Provider) {
    setSelected(provider?.id ?? ''); setId(provider?.id ?? ''); setApi(provider?.api ?? 'openai-completions');
    setBaseUrl(provider?.baseUrl ?? ''); setApiKey(''); setModelIds(provider?.models.map(model => model.id).join('\n') ?? '');
    setOptions(provider?.options ?? { discovery: { type: 'openai-models-list' } }); setCompat(jsonText(provider?.options.compat));
    setModelSettings(Object.fromEntries((provider?.models ?? []).map(({ id, ...settings }) => [id, settings])));
    setModelCompat(Object.fromEntries((provider?.models ?? []).map(model => [model.id, jsonText(model.compat)])));
    setModelSelection('');
  }
  const choose = (value: string) => edit(() => {
    loadFields(configuration?.providers.find(provider => provider.id === value));
  });
  const setOption = (key: string, value: unknown) => { setNotice(''); setOptions(previous => ({ ...previous, [key]: value })); };
  const setModelOption = (key: string, value: unknown) => { setNotice(''); if (!ids.includes(activeModel)) setModelIds([...ids, activeModel].join('\n')); setModelSettings(previous => ({ ...previous, [activeModel]: { ...previous[activeModel], [key]: value } })); };
  const optionalBoolean = (label: string, value: boolean | null | undefined, change: (value: boolean | null) => void) => <label>{label}<Select label={label} value={value == null ? '' : String(value)} disabled={locked} onChange={value => change(value === '' ? null : value === 'true')} options={[{ value: '', label: text.standard }, { value: 'true', label: t.on }, { value: 'false', label: t.off }]} /></label>;
  const changeApi = (value: string) => edit(() => {
    setApi(value);
    if (!selected) setOptions(previous => ({ ...previous, discovery: value.startsWith('openai') ? { type: 'openai-models-list' } : null }));
  });
  const save = async () => {
    if (locked) return;
    if (!id.trim() || !baseUrl.trim() || needsKey && !hasKey || !ids.length && !options.discovery) { setError(text.required); return; }
    const current = contextRevision.current; revision.current++; setWorking('save'); setError(''); setNotice('');
    try {
      const settings = Object.fromEntries(ids.map(model => [model, { ...modelSettings[model], compat: jsonObject(modelCompat[model] ?? '', `${model} ${text.compatibility}`, t.invalidJson) }]));
      const result = await request<Configuration>('providers.config', { operation: 'save', cwd, provider: { id, api, baseUrl, apiKey, options: { ...options, compat: jsonObject(compat, text.compatibility, t.invalidJson) }, modelIds: ids, modelSettings: settings } });
      if (current !== contextRevision.current) return;
      setConfiguration(result);
      const saved = result.providers.find(provider => provider.id === result.savedProvider);
      if (saved) loadFields(saved);
      setNotice(t.providerSaved);
    } catch (error) { if (current === contextRevision.current) setError(error instanceof Error ? error.message : String(error)); }
    finally { if (current === contextRevision.current) setWorking(''); }
  };
  const remove = async () => {
    if (!selected || locked) return;
    const current = contextRevision.current; revision.current++; setWorking('delete'); setError(''); setNotice('');
    try { const result = await request<Configuration>('providers.config', { operation: 'delete', cwd, provider: { id: selected } }); if (current === contextRevision.current) { setConfiguration(result); loadFields(); setConfirmDelete(false); setNotice(text.removed); } }
    catch (error) { if (current === contextRevision.current) setError(error instanceof Error ? error.message : String(error)); }
    finally { if (current === contextRevision.current) setWorking(''); }
  };
  if (!bootstrap.runtime) return <p>{t.installRuntime}</p>;
  return <div className="custom-providers"><h3>{t.customProviders}</h3>
    <p className="provider-scope">{configuration?.takeover.enabled ? configuration.takeover.active ? t.providerManagedCli : t.providerCliShadowed : t.providerManagedOnly}</p>
    {configuration?.takeover.unknown && <p className="provider-scope">{t.providerTakeoverUnknown}</p>}
    {configuration && <code className="provider-config-path">{configuration.configPath}</code>}
    {!configuration ? <><p role="status">{error || t.loading}</p>{error && <button className="quiet-button" onClick={() => void load()}>{t.refresh}</button>}</> : <>
      <div className="provider-picker"><Select label={t.providerName} value={selected} disabled={locked} onChange={choose} options={[{ value: '', label: t.providerNew }, ...configuration.providers.map(provider => ({ value: provider.id, label: provider.id }))]} />
        <button className="quiet-button" aria-pressed={api.startsWith('openai')} disabled={locked} onClick={() => changeApi('openai-completions')}>{t.openaiTemplate}</button>
        <button className="quiet-button" aria-pressed={api === 'anthropic-messages'} disabled={locked} onClick={() => changeApi('anthropic-messages')}>{t.anthropicTemplate}</button>
      </div>
      <form className="provider-form" onSubmit={event => { event.preventDefault(); void save(); }}>
        <div className="provider-fields"><label>{t.providerName}<input aria-label={t.providerName} value={id} disabled={locked} required onChange={event => edit(() => setId(event.target.value))} placeholder={api === 'anthropic-messages' ? 'my-anthropic' : 'my-openai'} /></label>
          <label>{t.protocol}<Select label={t.protocol} value={api} disabled={locked} onChange={changeApi} options={protocols.some(option => option.value === api) ? protocols : [...protocols, { value: api, label: api }]} /></label></div>
        <label>{t.baseUrl}<input type="url" aria-label={t.baseUrl} value={baseUrl} disabled={locked} required placeholder="https://example.com/v1" onChange={event => edit(() => setBaseUrl(event.target.value))} /></label>
        <label>{t.apiKey}<input type="password" aria-label={t.apiKey} value={apiKey} disabled={locked} autoComplete="off" spellCheck={false} required={needsKey && !stored?.hasApiKey} placeholder={stored?.hasApiKey ? t.keepApiKey : ''} onChange={event => edit(() => setApiKey(event.target.value))} /></label>
        <div className="provider-model-heading"><span>{t.providerModels}</span><button type="button" className="quiet-button" disabled={!!working || !baseUrl.trim() || needsKey && !hasKey} onClick={() => void discover()}><RefreshCw size={13} className={working === 'fetch' ? 'spin' : ''} />{working === 'fetch' ? t.loading : t.fetchModels}</button></div>
        {models.length > 0 && <div className="provider-discovery"><details onToggle={event => setExpanded(event.currentTarget.open)}><summary>{models.length} · {t.providerModels}</summary>{expanded && <pre>{models.map(model => model.id).join('\n')}</pre>}</details><button type="button" className="quiet-button" disabled={working === 'save'} onClick={() => setModelIds(previous => [...new Set([...previous.split(/\r?\n/).map(value => value.trim()).filter(Boolean), ...models.map(model => model.id)])].join('\n'))}>{t.applyModels}</button></div>}
        <textarea aria-label={t.providerModels} value={modelIds} rows={4} required={!options.discovery} disabled={locked} placeholder={t.modelIdsHint} onChange={event => { setModelIds(event.target.value); setNotice(''); }} />
        <details className="provider-advanced"><summary><ChevronRight size={14} />{text.advanced}</summary><div className="provider-advanced-content">
          <div className="provider-fields"><label>{text.authentication}<Select label={text.authentication} value={options.auth ?? ''} disabled={locked} onChange={value => setOption('auth', value || null)} options={[{ value: '', label: text.standard }, { value: 'apiKey', label: t.apiKey }, { value: 'none', label: text.noAuth }, { value: 'oauth', label: 'OAuth' }]} /></label><label>{text.transport}<Select label={text.transport} value={options.transport ?? ''} disabled={locked} onChange={value => setOption('transport', value || null)} options={[{ value: '', label: text.standard }, { value: 'pi-native', label: text.native }]} /></label></div>
          <div className="provider-fields">{optionalBoolean(text.authHeader, options.authHeader, value => setOption('authHeader', value))}{optionalBoolean(text.strict, options.disableStrictTools, value => setOption('disableStrictTools', value))}</div>
          <div className="provider-fields"><label>{text.discovery}<Select label={text.discovery} value={options.discovery?.type ?? ''} disabled={locked} onChange={value => setOption('discovery', value ? { type: value, ...(options.discovery?.timeoutMs ? { timeoutMs: options.discovery.timeoutMs } : {}) } : null)} options={[{ value: '', label: text.manual }, ...['openai-models-list', 'ollama', 'lm-studio', 'llama.cpp', 'proxy', 'litellm', 'apple-foundation-models'].map(value => ({ value, label: value }))]} /></label>{options.discovery && <label>{text.timeout}<input type="number" min="1" placeholder={text.standard} disabled={locked} value={options.discovery.timeoutMs ?? ''} onChange={event => { const next = { ...options.discovery }; if (event.target.value === '') delete next.timeoutMs; else next.timeoutMs = Number(event.target.value); setOption('discovery', next); }} /></label>}</div>
          <HeadersEditor value={options.headers} onChange={value => setOption('headers', value)} disabled={locked} label={text.headers} add={text.addHeader} remove={t.remove} />
          <label>{text.compatibility}<textarea rows={3} value={compat} disabled={locked} spellCheck={false} placeholder="{}" onChange={event => { setCompat(event.target.value); setNotice(''); }} /></label>
          {activeModel && <section className="provider-model-options"><h4>{text.model}</h4><p className="provider-scope">{text.defaults}</p><Select label={text.model} value={activeModel} disabled={locked} onChange={setModelSelection} options={availableIds.map(value => ({ value, label: value }))} />
            <div className="provider-fields"><label>{text.name}<input value={currentModel.name ?? ''} disabled={locked} placeholder={text.standard} onChange={event => setModelOption('name', event.target.value || null)} /></label><label>{t.protocol}<Select label={t.protocol} value={currentModel.api ?? ''} disabled={locked} onChange={value => setModelOption('api', value || null)} options={[{ value: '', label: text.standard }, ...protocols, ...(currentModel.api && !protocols.some(option => option.value === currentModel.api) ? [{ value: currentModel.api, label: currentModel.api }] : [])]} /></label></div>
            <label>{t.baseUrl}<input type="url" value={currentModel.baseUrl ?? ''} disabled={locked} placeholder={text.standard} onChange={event => setModelOption('baseUrl', event.target.value || null)} /></label>
            <div className="provider-model-numbers">{[['contextWindow', text.context], ['maxContextWindow', text.extended], ['maxTokens', text.output]].map(([key, label]) => <label key={key}>{label}<input type="number" min="1" step="1" disabled={locked} value={currentModel[key] ?? ''} placeholder={text.standard} onChange={event => setModelOption(key, event.target.value === '' ? null : Number(event.target.value))} /></label>)}</div>
            <div className="provider-fields">{optionalBoolean(text.reasoning, currentModel.reasoning, value => setModelOption('reasoning', value))}<label>{text.input}<Select label={text.input} value={currentModel.input?.join(',') ?? ''} disabled={locked} onChange={value => setModelOption('input', value ? value.split(',') : null)} options={[{ value: '', label: text.standard }, { value: 'text', label: text.text }, { value: 'text,image', label: text.textImage }, { value: 'image', label: text.image }]} /></label>{optionalBoolean(text.tools, currentModel.supportsTools, value => setModelOption('supportsTools', value))}{optionalBoolean(text.omitOutput, currentModel.omitMaxOutputTokens, value => setModelOption('omitMaxOutputTokens', value))}{optionalBoolean(text.websockets, currentModel.preferWebsockets, value => setModelOption('preferWebsockets', value))}<label>{text.compression}<input value={currentModel.compactionModel ?? ''} disabled={locked} placeholder={text.standard} onChange={event => setModelOption('compactionModel', event.target.value || null)} /></label></div>
            <div className="provider-costs"><strong>{text.cost}</strong><div className="provider-fields">{[['input', text.inputCost], ['output', text.outputCost], ['cacheRead', text.cacheReadCost], ['cacheWrite', text.cacheWriteCost]].map(([key, label]) => <label key={key}>{label}<input type="number" min="0" step="any" disabled={locked} value={currentModel.cost?.[key] ?? ''} placeholder={text.standard} onChange={event => { const next = { ...currentModel.cost }; if (event.target.value === '') delete next[key]; else next[key] = Number(event.target.value); setModelOption('cost', Object.keys(next).length ? next : null); }} /></label>)}</div><small>{text.costHint}</small></div>
            <HeadersEditor key={activeModel} value={currentModel.headers} onChange={value => setModelOption('headers', value)} disabled={locked} label={text.headers} add={text.addHeader} remove={t.remove} />
            <label>{text.compatibility}<textarea rows={3} value={modelCompat[activeModel] ?? ''} disabled={locked} spellCheck={false} placeholder="{}" onChange={event => { if (!ids.includes(activeModel)) setModelIds([...ids, activeModel].join('\n')); setModelCompat(previous => ({ ...previous, [activeModel]: event.target.value })); setNotice(''); }} /></label>
            <button type="button" className="quiet-button" disabled={locked} onClick={() => { setModelSettings(previous => ({ ...previous, [activeModel]: Object.fromEntries(modelFields.map(key => [key, null])) })); setModelCompat(previous => ({ ...previous, [activeModel]: '' })); setNotice(''); }}>{text.reset}</button>
          </section>}
        </div></details>
        {error && <p className="provider-error" role="alert">{error}</p>}{notice && <p className="provider-notice" role="status">{notice}</p>}
        <div className="provider-form-actions"><button type="submit" className="secondary-button" disabled={locked}>{working === 'save' ? t.loading : t.save}</button>{selected && (confirmDelete ? <span className="provider-delete-confirm"><span>{text.removeConfirm}</span><button type="button" className="quiet-button danger" disabled={locked} onClick={() => void remove()}>{text.remove}</button><button type="button" className="quiet-button" disabled={locked} onClick={() => setConfirmDelete(false)}>{t.cancel}</button></span> : <button type="button" className="quiet-button danger" disabled={locked} onClick={() => setConfirmDelete(true)}>{text.remove}</button>)}</div>
      </form>
    </>}
  </div>;
}
