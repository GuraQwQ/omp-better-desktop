import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Check, Download, FolderOpen, LoaderCircle, RefreshCw } from 'lucide-react';
import { pickPath, request, rpc } from '../lib/bridge';
import type { Copy } from '../lib/i18n';
import type { Bootstrap, Json, Preferences } from '../lib/types';
import Select from '../components/Select';
import CustomProviders from '../components/CustomProviders';
import AdvancedSettings from './AdvancedSettings';
import { settingText, settingView } from '../lib/settings-values';
import './import-status.css';

interface ImportResult { copied: number; skipped: number; completed: boolean; retryable: boolean; conflicts: string[] }

export default function Settings({ bootstrap, t, sessionId, ensureSession, update, onError, close, initialTab = 'general', initialQuery = '' }: { bootstrap: Bootstrap; t: Copy; sessionId?: string; ensureSession?: () => Promise<string>; update: (value: Bootstrap) => void; onError: (error: unknown) => void; close: () => void; initialTab?: string; initialQuery?: string }) {
  const [tab, setTab] = useState(initialTab);
  const [working, setWorking] = useState('');
  const [notice, setNotice] = useState('');
  const [found, setFound] = useState<Json[]>([]);
  const [importResult, setImportResult] = useState<{ path: string; result: ImportResult } | null>(null);
  const [importDetails, setImportDetails] = useState(false);
  const [settings, setSettings] = useState<Json[]>([]);
  const [query, setQuery] = useState(initialQuery);
  const [providers, setProviders] = useState<Json[]>([]);
  const [providersStatus, setProvidersStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [connectionError, setConnectionError] = useState(false);
  const connect = useRef(ensureSession);
  connect.current = ensureSession;
  const canConnect = !!ensureSession;
  const perform = async (name: string, action: () => Promise<any>) => {
    setWorking(name); setNotice('');
    try { const result = await action(); setNotice(typeof result === 'string' ? result : t.done); return result; } catch (error) { onError(error); }
    finally { setWorking(''); }
  };
  const reconnect = async () => {
    setConnectionError(false);
    try { await connect.current?.(); } catch (error) { setConnectionError(true); onError(error); }
  };
  const applySettings = (result: Json) => {
    const entries = result.entries ?? result.settings ?? result;
    const values: Json[] = Array.isArray(entries) ? entries.map(entry => ({ ...entry, path: entry.path ?? entry.id ?? entry.key })) : Object.entries(entries).map(([key, value]) => ({ path: key, ...(typeof value === 'object' && value ? value : { value }) }));
    setSettings(values);
    return values;
  };
  const reload = async () => update(await request<Bootstrap>('bootstrap'));
  const preference = async (patch: Partial<Preferences>) => {
    const preferences = { ...bootstrap.preferences, ...patch };
    await request('preferences.set', { patch }); update({ ...bootstrap, preferences });
  };
  const loadProviders = async () => {
    if (!sessionId) return;
    setProvidersStatus('loading');
    try {
      const result = await rpc(sessionId, 'get_login_providers');
      const values = result.providers ?? result;
      setProviders(Array.isArray(values) ? values : []);
      setProvidersStatus('ready');
    } catch (error) { setProvidersStatus('error'); onError(error); }
  };
  useEffect(() => {
    if (!['providers', 'omp'].includes(tab)) return;
    if (!sessionId) { if (canConnect) void reconnect(); return; }
    if (tab === 'providers') void loadProviders();
    if (tab === 'omp') rpc(sessionId, 'desktop_settings', { operation: 'list' }).then(applySettings).catch(onError);
  }, [tab, sessionId, canConnect]);
  const importFolder = (path: string) => {
    setImportResult(null); setImportDetails(false);
    return perform('import', async () => {
      const result = await request<ImportResult>('data.import', { path });
      setImportResult({ path, result });
      await reload();
      return '';
    });
  };
  const visibleSettings = settings.filter(setting => {
    const view = settingView(setting, bootstrap.preferences.language);
    return `${setting.path ?? setting.id} ${setting.label ?? setting.ui?.label ?? ''} ${setting.description ?? setting.ui?.description ?? ''} ${view.label} ${view.description}`.toLowerCase().includes(query.toLowerCase());
  });
  const connection = !canConnect ? <p>{t.selectProject}</p> : connectionError ? <button className="quiet-button" onClick={() => void reconnect()}><RefreshCw size={14} />{t.refresh}</button> : <p role="status">{t.loading}</p>;
  return <div className="settings-page">
    <header className="page-header"><button className="icon-button" title={t.close} onClick={close}><ArrowLeft size={18} /></button><h1>{t.settings}</h1></header>
    <div className="settings-layout"><nav className="settings-nav" aria-label={t.settings}>{[['general', t.appearance], ['runtime', t.runtime], ['data', t.data], ['providers', t.providers], ['omp', t.sessionSettings], ['advanced', t.advanced]].map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}</nav>
      <section className="settings-content">
        {tab === 'advanced' && <AdvancedSettings language={bootstrap.preferences.language} />}
        {tab === 'general' && <><h2>{t.appearance}</h2><div className="setting-row"><div><strong>{t.language}</strong></div><Select label={t.language} value={bootstrap.preferences.language} onChange={value => preference({ language: value as Preferences['language'] }).catch(onError)} options={[{ value: 'en', label: 'English' }, { value: 'zh', label: '简体中文' }]} /></div><div className="setting-row"><strong>{t.theme}</strong><Select label={t.theme} value={bootstrap.preferences.theme} onChange={value => preference({ theme: value as Preferences['theme'] }).catch(onError)} options={[{ value: 'system', label: t.system }, { value: 'light', label: t.light }, { value: 'dark', label: t.dark }]} /></div><div className="settings-note"><strong>{t.dataRoot}</strong><code>{bootstrap.dataRoot || t.nativeOnly}</code></div></>}
        {tab === 'runtime' && <><h2>{t.runtime}</h2><div className="runtime-status"><span className={`status-dot ${bootstrap.runtime ? 'connected' : ''}`} /><strong>{bootstrap.runtime ? `${t.installed} · OMP ${bootstrap.runtime.version}` : t.notInstalled}</strong></div><p>{t.installText}</p>{bootstrap.runtime && <code className="path-value">{bootstrap.runtime.path}</code>}{bootstrap.runtime && <div className="settings-actions"><button className="quiet-button" disabled={!!working} onClick={() => perform('install', async () => { const path = await pickPath(true); if (!path) return ''; await request('runtime.install', { path }); await reload(); })}><Download size={15} />{t.choosePackage}</button><button className="quiet-button" disabled={!!working || !bootstrap.runtime} onClick={() => perform('rollback', async () => { await request('runtime.rollback'); await reload(); })}>{t.rollback}</button></div>}<div className="setting-row"><strong>{t.clean}</strong><button className="quiet-button" disabled={!!working} onClick={() => perform('clean', () => request('runtime.clean'))}>{t.clean}</button></div></>}
        {tab === 'data' && <><h2>{t.data}</h2><p>{t.setupDescription}</p><div className="settings-actions"><button className="secondary-button" disabled={!!working} onClick={() => perform('discover', async () => { setFound(await request<Json[]>('data.discover')); })}><RefreshCw size={14} />{t.discover}</button><button className="quiet-button" disabled={!!working} onClick={async () => { try { const path = await pickPath(); if (path) await importFolder(path); } catch (e) { onError(e); } }}><FolderOpen size={14} />{t.importFolder}</button></div>{found.map(source => <div className="source-row" key={source.path}><div><code>{source.path}</code><small>{source.sessionCount ?? 0} {t.history.toLowerCase()}</small></div><button className="secondary-button" disabled={!!working} onClick={() => importFolder(source.path)}>{t.importData}</button></div>)}{importResult && <section className={`import-status${importResult.result.completed ? ' is-complete' : ''}`} aria-label={t.importData} role="status">
          <strong>{importResult.result.completed ? t.importComplete : t.importIncomplete}</strong>
          <p>{t.importCopied} {importResult.result.copied} · {t.importSkipped} {importResult.result.skipped}</p>
          {!importResult.result.completed && <p>{importResult.result.conflicts.length ? t.importConflictHint : t.importChanging}</p>}
          {importResult.result.conflicts.length > 0 && <details onToggle={event => setImportDetails(event.currentTarget.open)}><summary>{t.importConflicts} · {importResult.result.conflicts.length}</summary>{importDetails && <pre>{importResult.result.conflicts.join('\n')}</pre>}</details>}
          {importResult.result.retryable && <button className="quiet-button" disabled={!!working} onClick={() => void importFolder(importResult.path)}><RefreshCw size={14} />{t.importRetry}</button>}
        </section>}<h3>{t.takeover}</h3><p>{t.takeoverText}</p><div className="settings-actions"><button className="secondary-button" disabled={!!working || !bootstrap.runtime} onClick={() => perform('takeover', () => request('data.takeover', { enabled: true }))}>{t.takeover}<ArrowUpRight size={14} /></button><button className="quiet-button" disabled={!!working} onClick={() => perform('restore', () => request('data.takeover', { enabled: false }))}>{t.restoreCli}</button></div></>}
        {tab === 'providers' && <><h2>{t.providers}</h2><CustomProviders bootstrap={bootstrap} t={t} /><h3>{t.login}</h3>{!sessionId ? connection : providersStatus === 'loading' ? <p role="status">{t.loading}</p> : providersStatus === 'error' ? <><p>{t.error}</p><button className="quiet-button" onClick={() => void loadProviders()}><RefreshCw size={14} />{t.refresh}</button></> : providers.length ? providers.map(provider => <div className="setting-row" key={provider.id ?? provider.name}><div><strong>{provider.name ?? provider.id}</strong><small>{provider.authenticated ? t.installed : provider.description}</small></div><button className="secondary-button" disabled={!!working} onClick={() => perform(provider.id, () => rpc(sessionId, 'login', { providerId: provider.id ?? provider.name }))}>{t.login}<ArrowUpRight size={14} /></button></div>) : <p>{t.noResults}</p>}</>}
        {tab === 'omp' && <><h2>{t.sessionSettings}</h2>{!sessionId ? connection : <><input className="settings-search" aria-label={t.settingSearch} placeholder={t.settingSearch} value={query} onChange={e => setQuery(e.target.value)} />{visibleSettings.map(setting => <SettingEditor key={setting.path ?? setting.id} setting={setting} language={bootstrap.preferences.language} t={t} save={(value, reset) => perform('setting', async () => applySettings(await rpc(sessionId, 'desktop_settings', { operation: reset ? 'unset' : 'set', key: setting.path ?? setting.id, value })).find(entry => entry.path === setting.path))} />)}{!visibleSettings.length && <p>{t.noResults}</p>}</>}</>}
        {working && <div className="inline-progress" role="status"><LoaderCircle className="spin" size={15} />{t.loading}</div>}{notice && <div className="inline-success" role="status"><Check size={15} />{notice}</div>}
      </section>
    </div>
  </div>;
}

function SettingEditor({ setting, language, t, save }: { setting: Json; language: Preferences['language']; t: Copy; save: (value: any, reset?: boolean) => Promise<any> }) {
  const stored = settingText(setting.value ?? setting.defaultValue ?? setting.default ?? '');
  const [value, setValue] = useState(stored);
  const [invalid, setInvalid] = useState('');
  useEffect(() => { setValue(stored); setInvalid(''); }, [stored]);
  const { label, description, options } = settingView(setting, language);
  const update = async (value: any, reset?: boolean) => {
    const saved = await save(value, reset);
    if (saved) { setValue(settingText(saved.value ?? saved.defaultValue ?? saved.default ?? '')); setInvalid(''); }
  };
  const commit = () => {
    try { setInvalid(''); const parsed = setting.type === 'boolean' ? value === 'true' : setting.type === 'number' ? Number(value) : ['array', 'object', 'record'].includes(setting.type) ? JSON.parse(value) : value; if (typeof parsed === 'number' && !Number.isFinite(parsed)) throw Error(t.invalidNumber); void update(parsed); } catch { setInvalid(setting.type === 'number' ? t.invalidNumber : t.invalidJson); }
  };
  return <div className="setting-editor"><label htmlFor={`setting-${setting.path ?? setting.id}`}><strong>{label}</strong><small>{description}</small></label><div className="setting-edit-controls">{setting.type === 'boolean' ? <Select label={label} value={value} onChange={setValue} options={[{ value: 'true', label: t.on }, { value: 'false', label: t.off }]} /> : options.length ? <Select label={label} value={value} onChange={setValue} options={options} /> : <input id={`setting-${setting.path ?? setting.id}`} type={setting.credential ? 'password' : setting.type === 'number' ? 'number' : 'text'} value={value} placeholder={setting.redacted ? '••••••••' : ''} onChange={e => setValue(e.target.value)} />}<button className="quiet-button" onClick={commit}>{t.save}</button><button className="quiet-button" onClick={() => void update(undefined, true)}>{t.reset}</button></div>{invalid && <small role="alert">{invalid}</small>}</div>;
}
