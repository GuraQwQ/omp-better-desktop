import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Check, Download, FolderOpen, LoaderCircle, RefreshCw } from 'lucide-react';
import { pickPath, request, rpc } from '../lib/bridge';
import type { Copy } from '../lib/i18n';
import type { Bootstrap, Json, Preferences } from '../lib/types';
import Select from '../components/Select';
import { settingOptions, settingText } from '../lib/settings-values';

export default function Settings({ bootstrap, t, sessionId, update, onError, close, initialTab = 'general', initialQuery = '' }: { bootstrap: Bootstrap; t: Copy; sessionId?: string; update: (value: Bootstrap) => void; onError: (error: unknown) => void; close: () => void; initialTab?: string; initialQuery?: string }) {
  const [tab, setTab] = useState(initialTab);
  const [working, setWorking] = useState('');
  const [notice, setNotice] = useState('');
  const [found, setFound] = useState<Json[]>([]);
  const [settings, setSettings] = useState<Json[]>([]);
  const [query, setQuery] = useState(initialQuery);
  const [providers, setProviders] = useState<Json[]>([]);
  const [providersStatus, setProvidersStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const perform = async (name: string, action: () => Promise<any>) => {
    setWorking(name); setNotice('');
    try { const result = await action(); setNotice(typeof result === 'string' ? result : t.done); } catch (error) { onError(error); }
    finally { setWorking(''); }
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
    if (!sessionId) return;
    if (tab === 'providers') void loadProviders();
    if (tab === 'omp') rpc(sessionId, 'desktop_settings', { operation: 'list' }).then(result => {
      const entries = result.entries ?? result.settings ?? result;
      setSettings(Array.isArray(entries) ? entries.map(entry => ({ ...entry, path: entry.path ?? entry.id ?? entry.key })) : Object.entries(entries).map(([key, value]) => ({ path: key, ...(typeof value === 'object' && value ? value : { value }) })));
    }).catch(onError);
  }, [tab, sessionId]);
  const importFolder = async (path: string) => perform('import', async () => { const result = await request('data.import', { path }); await reload(); return `${t.importComplete}: ${result.filesCopied ?? result.copied ?? ''}`; });
  return <div className="settings-page">
    <header className="page-header"><button className="icon-button" title={t.close} onClick={close}><ArrowLeft size={18} /></button><h1>{t.settings}</h1></header>
    <div className="settings-layout"><nav className="settings-nav" aria-label={t.settings}>{[['general', t.appearance], ['runtime', t.runtime], ['data', t.data], ['providers', t.providers], ['omp', t.sessionSettings]].map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}</nav>
      <section className="settings-content">
        {tab === 'general' && <><h2>{t.appearance}</h2><div className="setting-row"><div><strong>{t.language}</strong></div><Select label={t.language} value={bootstrap.preferences.language} onChange={value => preference({ language: value as Preferences['language'] }).catch(onError)} options={[{ value: 'en', label: 'English' }, { value: 'zh', label: '简体中文' }]} /></div><div className="setting-row"><strong>{t.theme}</strong><Select label={t.theme} value={bootstrap.preferences.theme} onChange={value => preference({ theme: value as Preferences['theme'] }).catch(onError)} options={[{ value: 'system', label: t.system }, { value: 'light', label: t.light }, { value: 'dark', label: t.dark }]} /></div><div className="settings-note"><strong>{t.dataRoot}</strong><code>{bootstrap.dataRoot || t.nativeOnly}</code></div></>}
        {tab === 'runtime' && <><h2>{t.runtime}</h2><div className="runtime-status"><span className={`status-dot ${bootstrap.runtime ? 'connected' : ''}`} /><strong>{bootstrap.runtime ? `${t.installed} · OMP ${bootstrap.runtime.version}` : t.notInstalled}</strong></div><p>{t.installText}</p>{bootstrap.runtime && <code className="path-value">{bootstrap.runtime.path}</code>}{bootstrap.runtime && <div className="settings-actions"><button className="quiet-button" disabled={!!working} onClick={() => perform('install', async () => { const path = await pickPath(true); if (!path) return ''; await request('runtime.install', { path }); await reload(); })}><Download size={15} />{t.choosePackage}</button><button className="quiet-button" disabled={!!working || !bootstrap.runtime} onClick={() => perform('rollback', async () => { await request('runtime.rollback'); await reload(); })}>{t.rollback}</button></div>}<div className="setting-row"><strong>{t.clean}</strong><button className="quiet-button" disabled={!!working} onClick={() => perform('clean', () => request('runtime.clean'))}>{t.clean}</button></div></>}
        {tab === 'data' && <><h2>{t.data}</h2><p>{t.setupDescription}</p><div className="settings-actions"><button className="secondary-button" disabled={!!working} onClick={() => perform('discover', async () => { setFound(await request<Json[]>('data.discover')); })}><RefreshCw size={14} />{t.discover}</button><button className="quiet-button" disabled={!!working} onClick={async () => { try { const path = await pickPath(); if (path) await importFolder(path); } catch (e) { onError(e); } }}><FolderOpen size={14} />{t.importFolder}</button></div>{found.map(source => <div className="source-row" key={source.path}><div><code>{source.path}</code><small>{source.sessionCount ?? 0} {t.history.toLowerCase()}</small></div><button className="secondary-button" disabled={!!working} onClick={() => importFolder(source.path)}>{t.importData}</button></div>)}<h3>{t.takeover}</h3><p>{t.takeoverText}</p><div className="settings-actions"><button className="secondary-button" disabled={!!working || !bootstrap.runtime} onClick={() => perform('takeover', () => request('data.takeover', { enabled: true }))}>{t.takeover}<ArrowUpRight size={14} /></button><button className="quiet-button" disabled={!!working} onClick={() => perform('restore', () => request('data.takeover', { enabled: false }))}>{t.restoreCli}</button></div></>}
        {tab === 'providers' && <><h2>{t.providers}</h2>{!sessionId ? <p>{t.selectProject}</p> : providersStatus === 'loading' ? <p role="status">{t.loading}</p> : providersStatus === 'error' ? <><p>{t.error}</p><button className="quiet-button" onClick={() => void loadProviders()}><RefreshCw size={14} />{t.refresh}</button></> : providers.length ? providers.map(provider => <div className="setting-row" key={provider.id ?? provider.name}><div><strong>{provider.name ?? provider.id}</strong><small>{provider.authenticated ? t.installed : provider.description}</small></div><button className="secondary-button" disabled={!!working} onClick={() => perform(provider.id, () => rpc(sessionId, 'login', { providerId: provider.id ?? provider.name }))}>{t.login}<ArrowUpRight size={14} /></button></div>) : <p>{t.noResults}</p>}</>}
        {tab === 'omp' && <><h2>{t.sessionSettings}</h2>{!sessionId ? <p>{t.selectProject}</p> : <><input className="settings-search" placeholder={t.settingSearch} value={query} onChange={e => setQuery(e.target.value)} />{settings.filter(setting => `${setting.path ?? setting.id} ${setting.label ?? setting.ui?.label ?? ''} ${setting.description ?? ''}`.toLowerCase().includes(query.toLowerCase())).map(setting => <SettingEditor key={setting.path ?? setting.id} setting={setting} t={t} save={(value, reset) => perform('setting', () => rpc(sessionId, 'desktop_settings', { operation: reset ? 'unset' : 'set', key: setting.path ?? setting.id, value }))} />)}</>}</>}
        {working && <div className="inline-progress" role="status"><LoaderCircle className="spin" size={15} />{t.loading}</div>}{notice && <div className="inline-success" role="status"><Check size={15} />{notice}</div>}
      </section>
    </div>
  </div>;
}

function SettingEditor({ setting, t, save }: { setting: Json; t: Copy; save: (value: any, reset?: boolean) => Promise<any> }) {
  const raw = setting.value ?? setting.defaultValue ?? setting.default ?? '';
  const [value, setValue] = useState(settingText(raw));
  const [invalid, setInvalid] = useState('');
  const options = settingOptions(setting);
  const label = settingText(setting.ui?.label ?? setting.label ?? setting.path ?? setting.id);
  const commit = () => {
    try { setInvalid(''); const parsed = setting.type === 'boolean' ? value === 'true' : setting.type === 'number' ? Number(value) : ['array', 'object', 'record'].includes(setting.type) ? JSON.parse(value) : value; if (typeof parsed === 'number' && !Number.isFinite(parsed)) throw Error('Enter a valid number.'); void save(parsed); } catch (error) { setInvalid(String(error)); }
  };
  return <div className="setting-editor"><label htmlFor={`setting-${setting.path ?? setting.id}`}><strong>{label}</strong><small>{settingText(setting.ui?.description ?? setting.description)}</small></label><div className="setting-edit-controls">{setting.type === 'boolean' ? <Select label={label} value={value} onChange={setValue} options={[{ value: 'true', label: 'On' }, { value: 'false', label: 'Off' }]} /> : options.length ? <Select label={label} value={value} onChange={setValue} options={options} /> : <input id={`setting-${setting.path ?? setting.id}`} type={setting.credential ? 'password' : setting.type === 'number' ? 'number' : 'text'} value={value} placeholder={setting.redacted ? '••••••••' : ''} onChange={e => setValue(e.target.value)} />}<button className="quiet-button" onClick={commit}>{t.save}</button><button className="quiet-button" onClick={() => save(undefined, true)}>{t.reset}</button></div>{invalid && <small role="alert">{invalid}</small>}</div>;
}
