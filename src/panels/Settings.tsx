import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Check, Download, FolderOpen, LoaderCircle, RefreshCw } from 'lucide-react';
import { pickPath, request } from '../lib/bridge';
import type { Copy } from '../lib/i18n';
import type { Bootstrap, Json, MotionLevel, Preferences } from '../lib/types';
import { normalizeMotion } from '../lib/motion';
import Select from '../components/Select';
import CustomProviders from '../components/CustomProviders';
import AdvancedSettings from './AdvancedSettings';
import './import-status.css';
import './omp-settings.css';

const OmpSettings = lazy(() => import('./OmpSettings'));
const ModelRoles = lazy(() => import('./ModelRoles'));
const ManagedResources = lazy(() => import('./ManagedResources'));
const LaunchSettings = lazy(() => import('./LaunchSettings'));
const ProviderAccounts = lazy(() => import('./ProviderAccounts'));
const ImportResources = lazy(() => import('./ImportResources'));
const managedTabs = ['mcp', 'skills', 'plugins', 'agents', 'ssh', 'resources'];

interface ImportResult { copied: number; skipped: number; completed: boolean; retryable: boolean; conflicts: string[] }

export default function Settings({ bootstrap, t, sessionId, cwd = '', ensureSession, reconnectSession, update, onError, close, initialTab = 'general', initialQuery = '' }: { bootstrap: Bootstrap; t: Copy; sessionId?: string; cwd?: string; ensureSession?: () => Promise<string>; reconnectSession?: () => Promise<void>; update: (value: Bootstrap) => void; onError: (error: unknown) => void; close: () => void; initialTab?: string; initialQuery?: string }) {
  const [tab, setTab] = useState(initialTab);
  const [working, setWorking] = useState('');
  const [notice, setNotice] = useState('');
  const [found, setFound] = useState<Json[]>([]);
  const [importResult, setImportResult] = useState<{ path: string; result: ImportResult } | null>(null);
  const [importDetails, setImportDetails] = useState(false);
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
  const reload = async () => update(await request<Bootstrap>('bootstrap'));
  const preference = async (patch: Partial<Preferences>) => {
    const preferences = { ...bootstrap.preferences, ...patch };
    await request('preferences.set', { patch }); update({ ...bootstrap, preferences });
  };
  useEffect(() => {
    if (!['providers', 'omp', 'models', ...managedTabs].includes(tab)) return;
    if (!sessionId) { if (canConnect) void reconnect(); return; }
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
  const language = bootstrap.preferences.language;
  const zh = language === 'zh';
  const navigation = [
    { group: 'OMP', tabs: [['omp', zh ? 'OMP 配置' : 'OMP settings'], ['models', zh ? '模型角色' : 'Model roles'], ['providers', t.providers]] },
    { group: zh ? '能力' : 'Capabilities', tabs: [['imports', zh ? '发现与导入' : 'Discover & import'], ['mcp', zh ? 'MCP 服务' : 'MCP servers'], ['skills', zh ? '技能' : 'Skills'], ['plugins', zh ? '插件与市场' : 'Plugins'], ['agents', zh ? '代理定义' : 'Agent definitions'], ['resources', zh ? '指令与记忆' : 'Instructions & memory'], ['ssh', zh ? 'SSH 主机' : 'SSH hosts']] },
    { group: zh ? '应用' : 'Application', tabs: [['general', t.appearance], ['launch', zh ? '项目启动配置' : 'Project launch'], ['runtime', t.runtime], ['data', t.data], ['advanced', t.advanced]] },
  ];
  const connection = !canConnect ? <p>{t.selectProject}</p> : connectionError ? <button className="quiet-button" onClick={() => void reconnect()}><RefreshCw size={14} />{t.refresh}</button> : <p role="status">{t.loading}</p>;
  return <div className="settings-page">
    <header className="page-header"><button className="icon-button" title={t.close} onClick={close}><ArrowLeft size={18} /></button><h1>{t.settings}</h1></header>
    <div className="settings-layout"><nav className="settings-nav" aria-label={t.settings}>{navigation.map(group => <div key={group.group}><small>{group.group}</small>{group.tabs.map(([id, label]) => <button key={id} aria-current={tab === id ? 'page' : undefined} className={tab === id ? 'active' : ''} onClick={() => { setNotice(''); setTab(id); }}>{label}</button>)}</div>)}</nav>
      <section className="settings-content" key={tab}><Suspense fallback={<p role="status">{t.loading}</p>}>
        {tab === 'advanced' && <AdvancedSettings language={bootstrap.preferences.language} />}
        {tab === 'general' && <><h2>{t.appearance}</h2><div className="setting-row"><div><strong>{t.language}</strong></div><Select label={t.language} value={bootstrap.preferences.language} onChange={value => preference({ language: value as Preferences['language'] }).catch(onError)} options={[{ value: 'en', label: 'English' }, { value: 'zh', label: '简体中文' }]} /></div><div className="setting-row"><strong>{t.theme}</strong><Select label={t.theme} value={bootstrap.preferences.theme} onChange={value => preference({ theme: value as Preferences['theme'] }).catch(onError)} options={[{ value: 'system', label: t.system }, { value: 'light', label: t.light }, { value: 'dark', label: t.dark }]} /></div><div className="setting-row"><div><strong>{t.animation}</strong><small>{t.motionHints[normalizeMotion(bootstrap.preferences.motion)]}</small></div><Select label={t.animation} value={normalizeMotion(bootstrap.preferences.motion)} onChange={value => preference({ motion: value as MotionLevel }).catch(onError)} options={Object.entries(t.motionLevels).map(([value, label]) => ({ value, label }))} /></div><div className="setting-row"><div><strong id="show-turn-label">{t.showTurnNumber}</strong><small>{t.showTurnNumberHint}</small></div><input className="capture-switch" type="checkbox" role="switch" aria-labelledby="show-turn-label" checked={bootstrap.preferences.showTurnNumber !== false} onChange={event => preference({ showTurnNumber: event.target.checked }).catch(onError)} /></div><div className="setting-row"><div><strong id="notify-label">{t.notifyOnDone}</strong><small>{t.notifyOnDoneHint}</small></div><input className="capture-switch" type="checkbox" role="switch" aria-labelledby="notify-label" checked={bootstrap.preferences.notifyOnDone !== false} onChange={event => preference({ notifyOnDone: event.target.checked }).catch(onError)} /></div><div className="settings-note"><strong>{t.dataRoot}</strong><code>{bootstrap.dataRoot || t.nativeOnly}</code></div></>}
        {tab === 'runtime' && <><h2>{t.runtime}</h2><div className="runtime-status"><span className={`status-dot ${bootstrap.runtime ? 'connected' : ''}`} /><strong>{bootstrap.runtime ? `${t.installed} · OMP ${bootstrap.runtime.version}` : t.notInstalled}</strong></div><p>{t.installText}</p>{bootstrap.runtime && <code className="path-value">{bootstrap.runtime.path}</code>}{bootstrap.runtime && <div className="settings-actions"><button className="quiet-button" disabled={!!working} onClick={() => perform('install', async () => { const path = await pickPath(true); if (!path) return ''; await request('runtime.install', { path }); await reload(); })}><Download size={15} />{t.choosePackage}</button><button className="quiet-button" disabled={!!working || !bootstrap.runtime} onClick={() => perform('rollback', async () => { await request('runtime.rollback'); await reload(); })}>{t.rollback}</button></div>}<div className="setting-row"><strong>{t.clean}</strong><button className="quiet-button" disabled={!!working} onClick={() => perform('clean', () => request('runtime.clean'))}>{t.clean}</button></div></>}
        {tab === 'data' && <><h2>{t.data}</h2><p>{t.setupDescription}</p><div className="settings-actions"><button className="secondary-button" disabled={!!working} onClick={() => perform('discover', async () => { setFound(await request<Json[]>('data.discover')); })}><RefreshCw size={14} />{t.discover}</button><button className="quiet-button" disabled={!!working} onClick={async () => { try { const path = await pickPath(); if (path) await importFolder(path); } catch (e) { onError(e); } }}><FolderOpen size={14} />{t.importFolder}</button></div>{found.map(source => <div className="source-row" key={source.path}><div><code>{source.path}</code><small>{source.sessionCount ?? 0} {t.history.toLowerCase()}</small></div><button className="secondary-button" disabled={!!working} onClick={() => importFolder(source.path)}>{t.importData}</button></div>)}{importResult && <section className={`import-status${importResult.result.completed ? ' is-complete' : ''}`} aria-label={t.importData} role="status">
          <strong>{importResult.result.completed ? t.importComplete : t.importIncomplete}</strong>
          <p>{t.importCopied} {importResult.result.copied} · {t.importSkipped} {importResult.result.skipped}</p>
          {!importResult.result.completed && <p>{importResult.result.conflicts.length ? t.importConflictHint : t.importChanging}</p>}
          {importResult.result.conflicts.length > 0 && <details onToggle={event => setImportDetails(event.currentTarget.open)}><summary>{t.importConflicts} · {importResult.result.conflicts.length}</summary>{importDetails && <pre>{importResult.result.conflicts.join('\n')}</pre>}</details>}
          {importResult.result.retryable && <button className="quiet-button" disabled={!!working} onClick={() => void importFolder(importResult.path)}><RefreshCw size={14} />{t.importRetry}</button>}
        </section>}<h3>{t.takeover}</h3><p>{t.takeoverText}</p><div className="settings-actions"><button className="secondary-button" disabled={!!working || !bootstrap.runtime} onClick={() => perform('takeover', () => request('data.takeover', { enabled: true }))}>{t.takeover}<ArrowUpRight size={14} /></button><button className="quiet-button" disabled={!!working} onClick={() => perform('restore', () => request('data.takeover', { enabled: false }))}>{t.restoreCli}</button></div></>}
        {tab === 'providers' && <><h2>{t.providers}</h2><CustomProviders bootstrap={bootstrap} t={t} cwd={cwd} />{sessionId ? <ProviderAccounts key={sessionId} sessionId={sessionId} language={language} t={t} onError={onError} /> : connection}</>}
        {tab === 'omp' && (sessionId ? <OmpSettings key={sessionId} sessionId={sessionId} language={language} initialQuery={initialQuery} /> : connection)}
        {tab === 'models' && (sessionId ? <ModelRoles key={sessionId} sessionId={sessionId} language={language} /> : connection)}
        {managedTabs.includes(tab) && <>{['skills', 'mcp'].includes(tab) && <div className="settings-import-entry"><button className="quiet-button" onClick={() => setTab('imports')}>{zh ? '发现与导入' : 'Discover & import'}</button></div>}{sessionId ? <ManagedResources resource={tab} sessionId={sessionId} language={language} onError={onError} /> : connection}</>}
        {tab === 'imports' && (ensureSession ? <ImportResources language={language} cwd={cwd} ensureSession={ensureSession} reconnect={reconnectSession} /> : <p>{t.selectProject}</p>)}
        {tab === 'launch' && (cwd ? <LaunchSettings key={cwd} cwd={cwd} language={language} reconnect={reconnectSession} /> : <p>{t.selectProject}</p>)}
        {working && <div className="inline-progress" role="status"><LoaderCircle className="spin" size={15} />{t.loading}</div>}{notice && <div className="inline-success" role="status"><Check size={15} />{notice}</div>}
      </Suspense></section>
    </div>
  </div>;
}
