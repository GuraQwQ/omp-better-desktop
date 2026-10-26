import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { request } from '../lib/bridge';
import type { Copy } from '../lib/i18n';
import type { Bootstrap } from '../lib/types';
import Select from './Select';
import './custom-providers.css';

interface Provider { id: string; api: string; baseUrl: string; hasApiKey: boolean; models: { id: string; name?: string }[] }
interface Configuration { configPath: string; takeover: { enabled: boolean; active: boolean; unknown?: boolean }; providers: Provider[]; savedProvider?: string }

export default function CustomProviders({ bootstrap, t }: { bootstrap: Bootstrap; t: Copy }) {
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
  const revision = useRef(0);
  const stored = configuration?.providers.find(provider => provider.id === id.trim());
  const hasKey = !!apiKey.trim() || !!stored?.hasApiKey;
  const load = useCallback(async () => {
    try { setConfiguration(await request<Configuration>('providers.config', { operation: 'list' })); setError(''); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
  }, []);
  useEffect(() => { if (bootstrap.runtime) void load(); }, [bootstrap.dataRoot, !!bootstrap.runtime, load]);
  const discover = useCallback(async () => {
    if (!baseUrl.trim() || !hasKey) return;
    const current = ++revision.current;
    setWorking('fetch'); setError(''); setModels([]);
    try {
      const result = await request<{ models: { id: string; name?: string }[] }>('providers.discover', { provider: { id, api, baseUrl, apiKey } });
      if (revision.current === current) { setModels(result.models); if (!result.models.length) setError(t.providerNoModels); }
    } catch { if (revision.current === current) setError(t.providerDiscoveryFailed); }
    finally { if (revision.current === current) setWorking(''); }
  }, [id, api, baseUrl, apiKey, hasKey, t.providerNoModels, t.providerDiscoveryFailed]);
  useEffect(() => {
    if (notice || !baseUrl.trim() || !hasKey) return;
    const timer = setTimeout(() => void discover(), 800);
    return () => { clearTimeout(timer); revision.current++; };
  }, [discover, notice]);
  const edit = (change: () => void) => { revision.current++; setNotice(''); setError(''); setModels([]); setWorking(''); change(); };
  const choose = (value: string) => edit(() => {
    const provider = configuration?.providers.find(provider => provider.id === value);
    setSelected(value); setId(provider?.id ?? ''); setApi(provider?.api ?? 'openai-completions');
    setBaseUrl(provider?.baseUrl ?? ''); setApiKey(''); setModelIds(provider?.models.map(model => model.id).join('\n') ?? '');
  });
  const save = async () => {
    if (working === 'save') return;
    if (!id.trim() || !baseUrl.trim() || !hasKey || !modelIds.trim()) { setError(t.providerRequired); return; }
    revision.current++; setWorking('save'); setError(''); setNotice('');
    try {
      const result = await request<Configuration>('providers.config', { operation: 'save', provider: { id, api, baseUrl, apiKey, modelIds: modelIds.split(/\r?\n/).map(value => value.trim()).filter(Boolean) } });
      setConfiguration(result); setSelected(result.savedProvider ?? id.trim()); setId(result.savedProvider ?? id.trim());
      const saved = result.providers.find(provider => provider.id === result.savedProvider);
      if (saved) { setBaseUrl(saved.baseUrl); setModelIds(saved.models.map(model => model.id).join('\n')); }
      setApiKey(''); setNotice(t.providerSaved);
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setWorking(''); }
  };
  if (!bootstrap.runtime) return <p>{t.installRuntime}</p>;
  return <div className="custom-providers"><h3>{t.customProviders}</h3>
    <p className="provider-scope">{configuration?.takeover.enabled ? configuration.takeover.active ? t.providerManagedCli : t.providerCliShadowed : t.providerManagedOnly}</p>
    {configuration?.takeover.unknown && <p className="provider-scope">{t.providerTakeoverUnknown}</p>}
    {configuration && <code className="provider-config-path">{configuration.configPath}</code>}
    {!configuration ? <><p role="status">{error || t.loading}</p>{error && <button className="quiet-button" onClick={() => void load()}>{t.refresh}</button>}</> : <>
      <div className="provider-picker"><Select label={t.providerName} value={selected} disabled={working === 'save'} onChange={choose} options={[{ value: '', label: t.providerNew }, ...configuration.providers.map(provider => ({ value: provider.id, label: provider.id }))]} />
        <button className="quiet-button" aria-pressed={api.startsWith('openai')} disabled={working === 'save'} onClick={() => edit(() => setApi('openai-completions'))}>{t.openaiTemplate}</button>
        <button className="quiet-button" aria-pressed={api === 'anthropic-messages'} disabled={working === 'save'} onClick={() => edit(() => setApi('anthropic-messages'))}>{t.anthropicTemplate}</button>
      </div>
      <form className="provider-form" onSubmit={event => { event.preventDefault(); void save(); }}>
        <div className="provider-fields"><label>{t.providerName}<input aria-label={t.providerName} value={id} disabled={working === 'save'} required onChange={event => edit(() => setId(event.target.value))} placeholder={api === 'anthropic-messages' ? 'my-anthropic' : 'my-openai'} /></label>
          <label>{t.protocol}<Select label={t.protocol} value={api} disabled={working === 'save'} onChange={value => edit(() => setApi(value))} options={[{ value: 'openai-completions', label: 'OpenAI Chat Completions' }, { value: 'openai-responses', label: 'OpenAI Responses' }, { value: 'anthropic-messages', label: 'Anthropic Messages' }]} /></label></div>
        <label>{t.baseUrl}<input type="url" aria-label={t.baseUrl} value={baseUrl} disabled={working === 'save'} required placeholder="https://example.com/v1" onChange={event => edit(() => setBaseUrl(event.target.value))} /></label>
        <label>{t.apiKey}<input type="password" aria-label={t.apiKey} value={apiKey} disabled={working === 'save'} autoComplete="off" spellCheck={false} required={!stored?.hasApiKey} placeholder={stored?.hasApiKey ? t.keepApiKey : ''} onChange={event => edit(() => setApiKey(event.target.value))} /></label>
        <div className="provider-model-heading"><span>{t.providerModels}</span><button type="button" className="quiet-button" disabled={!!working || !baseUrl.trim() || !hasKey} onClick={() => void discover()}><RefreshCw size={13} className={working === 'fetch' ? 'spin' : ''} />{working === 'fetch' ? t.loading : t.fetchModels}</button></div>
        {models.length > 0 && <div className="provider-discovery"><details onToggle={event => setExpanded(event.currentTarget.open)}><summary>{models.length} · {t.providerModels}</summary>{expanded && <pre>{models.map(model => model.id).join('\n')}</pre>}</details><button type="button" className="quiet-button" disabled={working === 'save'} onClick={() => setModelIds(previous => [...new Set([...previous.split(/\r?\n/).map(value => value.trim()).filter(Boolean), ...models.map(model => model.id)])].join('\n'))}>{t.applyModels}</button></div>}
        <textarea aria-label={t.providerModels} value={modelIds} rows={4} required disabled={working === 'save'} placeholder={t.modelIdsHint} onChange={event => { setModelIds(event.target.value); setNotice(''); }} />
        {error && <p className="provider-error" role="alert">{error}</p>}{notice && <p className="provider-notice" role="status">{notice}</p>}
        <button type="submit" className="secondary-button" disabled={working === 'save'}>{working === 'save' ? t.loading : t.save}</button>
      </form>
    </>}
  </div>;
}
