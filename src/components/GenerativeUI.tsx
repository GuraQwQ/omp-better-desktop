import { createStreamingParser, Renderer, type ActionEvent, type OpenUIError } from '@openuidev/react-lang';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { native, request, rpc } from '../lib/bridge';
import { convertFileSrc } from '@tauri-apps/api/core';
import { Code2 } from 'lucide-react';
import { genUIRuntimeConfigurationKey, normalizeGenUIConfiguration } from '../lib/genui-config';
import { genUIRepairMessage, safeGenUIUrl, type GenUIKind } from '../lib/genui';
import type { Language } from '../lib/types';
import { createGenUILibrary } from './genui-openui';
import { genUIHtmlDocument, genUITheme } from './genui-html';
import './genui.css';

interface Props { source: string; kind?: GenUIKind; id: string; sessionId?: string; sessionKey?: string; cwd: string; language: Language; configuration: unknown; onSend: (text: string) => void; isStreaming?: boolean; repairReason?: string }
interface Saved { source: string; state: Record<string, unknown>; revision: string; configurationKey: string }
const emptyState: Record<string, unknown> = {};
// 虚拟列表卸载界面时保留本地输入，最多缓存最近 128 个界面。
const viewCache = new Map<string, { state: Record<string, unknown>; source: string; configurationKey: string }>();
function rememberView(id: string, state: Record<string, unknown>, source: string, configurationKey: string) {
  viewCache.delete(id); viewCache.set(id,{state,source,configurationKey});
  if (viewCache.size > 128) viewCache.delete(viewCache.keys().next().value!);
}

export default function GenerativeUI({ source, kind = 'openui', id, sessionId, sessionKey, cwd, language, configuration, onSend, isStreaming = false, repairReason }: Props) {
  const zh = language === 'zh';
  const config = normalizeGenUIConfiguration(configuration);
  const configKey = genUIRuntimeConfigurationKey(config);
  const library = useMemo(() => createGenUILibrary(config), [configKey]);
  const parser = useMemo(() => createStreamingParser(library.toJSONSchema()), [library]);
  const ownerId = `${sessionKey ?? sessionId ?? cwd}:${id}`;
  const previousOwner = useRef({ ownerId, sessionId });
  const container = useRef<HTMLDivElement>(null), frame = useRef<HTMLIFrameElement>(null);
  const localState = useRef<Record<string, unknown>>({}), savedRevision = useRef<string | null>(null);
  const current = useRef({ source, ownerId, configKey, config, kind });
  current.current = { source, ownerId, configKey, config, kind };
  const [initialState, setInitialState] = useState<Record<string, unknown>>(emptyState);
  const [loaded, setLoaded] = useState(!config.features.persistence);
  const [lastGood, setLastGood] = useState('');
  const [runtimeErrors, setRuntimeErrors] = useState<string[]>([]), [verification, setVerification] = useState<string[]>([]), [storageError, setStorageError] = useState('');
  const [height, setHeight] = useState(120), [theme, setTheme] = useState<Record<string, string>>({});
  const [remoteSaved, setRemoteSaved] = useState<Saved | null>(null);
  const [documentUrl, setDocumentUrl] = useState('');
  const [repairing, setRepairing] = useState(false), [retry, setRetry] = useState(0);
  const repairAttempts = useRef(0), cancelledRepair = useRef(false), repairingSource = useRef('');
  const htmlErrorSource = useRef('');
  const pendingSave = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), saveQueue = useRef(Promise.resolve());
  const channel = useMemo(() => crypto.randomUUID(), [ownerId, configKey]);
  const result = useMemo(() => kind === 'openui' ? parser.set(source, !isStreaming) : null, [source, kind, parser, isStreaming]);
  const parseErrors = kind === 'openui' && !isStreaming ? [...(result?.meta.errors.map(error => error.message) ?? []), ...(!result?.root && !result?.rootExpression ? ['未找到可渲染的 root 组件。'] : []), ...(result?.meta.unresolved.length ? [`引用未定义：${result.meta.unresolved.join(', ')}`] : []), ...(result?.meta.incomplete ? ['源码尚未完整。'] : [])] : [];
  const errors = [...new Set([...parseErrors, ...runtimeErrors, ...verification, ...(repairReason ? [repairReason] : [])])];
  const displaySource = lastGood && (kind === 'openui' && parseErrors.length || kind === 'html' && runtimeErrors.length && !isStreaming) ? lastGood : source;

  const save = useCallback(() => {
    const snapshot = current.current;
    if (!snapshot.config.enabled || !snapshot.config.features.persistence) return;
    const state = { ...localState.current };
    saveQueue.current = saveQueue.current.then(async () => {
      if (current.current.ownerId !== snapshot.ownerId || !current.current.config.features.persistence) return;
      try {
        const cached = viewCache.get(snapshot.ownerId);
        const saved = await request<Saved | null>('genui.save', { id: snapshot.ownerId, source: cached?.configurationKey === snapshot.configKey ? cached.source : snapshot.source, kind: snapshot.kind, state, baseRevision: savedRevision.current, configurationKey: snapshot.configKey });
        if (saved && current.current.ownerId === snapshot.ownerId) { savedRevision.current = saved.revision; setStorageError(''); }
      } catch (error) { if (current.current.ownerId === snapshot.ownerId) setStorageError(String(error)); }
    });
  }, []);
  const stateUpdated = useCallback((state: Record<string, unknown>) => {
    if (!current.current.config.features.state) return;
    localState.current = state;
    const snapshot = current.current;
    rememberView(snapshot.ownerId,state,viewCache.get(snapshot.ownerId)?.source ?? snapshot.source,snapshot.configKey);
    if (pendingSave.current) clearTimeout(pendingSave.current);
    pendingSave.current = setTimeout(save, 400);
  }, [save]);
  useEffect(() => {
    let cancelled = false;
    const cached = viewCache.get(ownerId);
    const continuing = previousOwner.current.ownerId !== ownerId && previousOwner.current.sessionId === sessionId;
    localState.current = cached?.state ?? (continuing ? localState.current : {}); savedRevision.current = null;
    previousOwner.current = {ownerId,sessionId};
    setInitialState(localState.current); setLastGood(cached?.configurationKey === configKey ? cached.source : ''); setStorageError(''); setLoaded(!config.features.persistence);
    if (config.enabled && config.features.persistence) void request<Saved | null>('genui.get', { id: ownerId }).then(saved => {
      if (cancelled) return;
      savedRevision.current = saved?.revision ?? null;
      if (saved) { localState.current = { ...saved.state, ...localState.current }; setInitialState(localState.current); if (saved.configurationKey === current.current.configKey) setLastGood(cached?.source ?? saved.source); }
    }).catch(error => { if (!cancelled) setStorageError(String(error)); }).finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; if (pendingSave.current) clearTimeout(pendingSave.current); };
  }, [ownerId, config.enabled, config.features.persistence]);
  useEffect(() => {
    setRuntimeErrors([]); setVerification([]); htmlErrorSource.current = '';
    if (isStreaming && !config.features.streaming) setInitialState({ ...localState.current });
    if (repairingSource.current && repairingSource.current !== source) { setRepairing(false); repairingSource.current = ''; setInitialState({ ...localState.current }); }
    if (kind === 'openui' && !isStreaming && !parseErrors.length) { setLastGood(source); rememberView(ownerId,localState.current,source,configKey); }
  }, [source, isStreaming, kind, config.features.streaming]);
  useEffect(() => { if (loaded && !isStreaming && !parseErrors.length && !runtimeErrors.length) save(); }, [loaded, source, isStreaming, configKey, runtimeErrors.length, save]);
  useEffect(() => {
    if (!container.current) return;
    const refresh = () => setTheme(genUITheme(container.current!));
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-motion', 'style', 'class'] });
    return () => observer.disconnect();
  }, [config.features.theme]);
  useEffect(() => { frame.current?.contentWindow?.postMessage({ channel, type: 'theme', theme }, '*'); }, [theme, channel]);
  const sendAction = useCallback((event: ActionEvent) => {
    if (!current.current.config.features.actions) return;
    if (event.type === 'open_url') { const url = safeGenUIUrl(event.params.url); if (url) void request('system.open_url', { url }).catch(error => setRuntimeErrors([String(error)])); return; }
    if (event.type === 'continue_conversation') onSend(`${event.humanFriendlyMessage}\n\n界面 ${id} 当前状态：${JSON.stringify(event.formState ?? localState.current)}`);
  }, [onSend, id]);
  const toolProvider = useMemo(() => config.features.hostCalls ? Object.fromEntries(config.capabilities.map(capability => [capability, (args: Record<string, unknown>) => request('genui.call', { cwd, capability, args })])) : undefined, [cwd, configKey]);
  const reportedErrors = useCallback((errors: OpenUIError[]) => setRuntimeErrors(previous => { const next = errors.filter(error => error.severity !== 'warning').map(error => `${error.component ?? error.toolName ?? error.statementId ?? error.code}: ${error.message}`); return JSON.stringify(previous) === JSON.stringify(next) ? previous : next; }), []);
  const repair = useCallback((automatic = false) => {
    if (!config.features.repair || isStreaming || !errors.length || repairing || automatic && (cancelledRepair.current || repairAttempts.current >= 2)) return;
    if (automatic) repairAttempts.current++;
    repairingSource.current = source; setRepairing(true);
    onSend(genUIRepairMessage(id, kind, source, errors.join('\n'), localState.current));
  }, [config.features.repair, isStreaming, errors.join('\n'), repairing, source, id, kind, onSend]);
  useEffect(() => { if (config.features.autoRepair && errors.length && !isStreaming && !repairing) repair(true); }, [config.features.autoRepair, errors.join('\n'), isStreaming, repairing, repair]);
  const cancelRepair = async () => {
    cancelledRepair.current = true; setRepairing(false); repairingSource.current = '';
    if (sessionId) try { await rpc(sessionId, 'abort'); } catch (error) { setRuntimeErrors([String(error)]); }
  };
  const htmlDocument = useMemo(() => kind === 'html' && config.features.html ? genUIHtmlDocument(displaySource, config, channel, localState.current, theme, !isStreaming) : undefined, [displaySource, kind, configKey, channel, initialState, isStreaming, retry]);
  useEffect(() => {
    let cancelled = false, token = '';
    if (!config.enabled || !htmlDocument || isStreaming && !config.features.streaming) { setDocumentUrl(''); return; }
    if (!native) { setDocumentUrl(htmlDocument.url); return; }
    void request<{token:string}>('genui.document',{html:htmlDocument.html,csp:htmlDocument.csp}).then(document => {
      token = document.token;
      if (cancelled) { void request('genui.document.release',{token}).catch(() => {}); return; }
      setDocumentUrl(convertFileSrc(token,'genui'));
    }).catch(error => { if (!cancelled) setRuntimeErrors([String(error)]); });
    return () => { cancelled = true; if (token) void request('genui.document.release',{token}).catch(() => {}); };
  },[htmlDocument,config.enabled,isStreaming,config.features.streaming]);
  useEffect(() => {
    if (kind !== 'html') return;
    let active = true;
    const reply = (id: string, value?: unknown, error?: string) => { if (active) frame.current?.contentWindow?.postMessage({ channel, type: 'result', id, value, error }, '*'); };
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.channel !== channel) return;
      const message = event.data;
      switch (message.type) {
        case 'height': if (Number.isFinite(message.height)) setHeight(Math.max(80, Math.min(1200, message.height))); break;
        case 'state': if (message.state && typeof message.state === 'object' && !Array.isArray(message.state)) stateUpdated(message.state); break;
        case 'action': if (config.features.actions && !isStreaming && typeof message.text === 'string') onSend(`${message.text}\n\n界面 ${id} 当前状态：${JSON.stringify(message.state ?? {})}`); break;
        case 'open': { const url = safeGenUIUrl(message.url); if (url) void request('system.open_url', { url }).catch(error => setRuntimeErrors([String(error)])); break; }
        case 'call': if (typeof message.id === 'string' && typeof message.capability === 'string') void request('genui.call', { cwd, capability: message.capability, args: message.args }).then(value => reply(message.id, value)).catch(error => reply(message.id, undefined, String(error))); break;
        case 'error': htmlErrorSource.current = source; setRuntimeErrors(previous => [...new Set([...previous, String(message.error)])]); break;
        case 'verified': if (config.features.verify && Array.isArray(message.issues)) setVerification(message.issues.map(String)); break;
        case 'ready': frame.current?.contentWindow?.postMessage({ channel, type: 'theme', theme: genUITheme(container.current!) }, '*'); if (!isStreaming && htmlErrorSource.current !== source && displaySource === source) { setLastGood(source); rememberView(ownerId,localState.current,source,configKey); } break;
      }
    };
    window.addEventListener('message', receive);
    return () => { active = false; window.removeEventListener('message', receive); };
  }, [kind, channel, cwd, configKey, isStreaming, stateUpdated, onSend, id, source, displaySource, runtimeErrors.length]);
  const verify = () => {
    if (kind === 'html') { frame.current?.contentWindow?.postMessage({ channel, type: 'verify' }, '*'); return; }
    const element = container.current?.querySelector('.genui-content');
    const issues: string[] = [];
    if (element && !element.textContent?.trim() && !element.querySelector('img,svg,input,button,video')) issues.push('界面为空。');
    if (element && element.scrollWidth > element.clientWidth + 2) issues.push('内容横向溢出。');
    element?.querySelectorAll<HTMLInputElement>('input,select,textarea').forEach(field => { if (!field.checkValidity()) issues.push(`${field.name || field.type} 的输入无效。`); });
    setVerification(issues);
  };
  useEffect(() => {
    if (!config.enabled || !config.features.verify || !loaded || isStreaming || kind!=='openui') return;
    const frame = requestAnimationFrame(verify);
    return () => cancelAnimationFrame(frame);
  },[config.enabled,config.features.verify,loaded,isStreaming,source,kind,retry]);
  if (!config.enabled) return null;
  return <div className="genui-view"><div className={`genui ${config.features.theme ? '' : 'genui-independent-theme'}`} ref={container}>
    <div className="genui-toolbar"><span>{kind === 'html' ? 'HTML' : 'OpenUI Lang'}</span>{isStreaming && <small role="status">{zh ? '正在生成…' : 'Generating…'}</small>}<div>{config.features.verify && <button type="button" className="quiet-button" disabled={isStreaming || !loaded} onClick={verify}>{zh ? '复验' : 'Verify'}</button>}</div></div>
    {!loaded ? <p role="status">{zh ? '正在恢复界面…' : 'Restoring interface…'}</p> : <div className="genui-content">{!config.features.streaming && isStreaming ? <p role="status">{zh ? '等待界面生成完成…' : 'Waiting for complete interface…'}</p> : kind === 'html' ? config.features.html ? documentUrl ? <iframe ref={frame} src={documentUrl} sandbox="allow-scripts" title={zh ? '生成式 HTML 界面' : 'Generated HTML interface'} style={{ height }} /> : <p role="status">{zh ? '正在载入界面文档…' : 'Loading interface document…'}</p> : <pre>{source}</pre> : <Renderer key={`${ownerId}:${retry}`} response={displaySource} library={library} initialState={initialState} isStreaming={isStreaming} toolProvider={toolProvider} onAction={sendAction} onStateUpdate={stateUpdated} onError={reportedErrors} publishObservability={false}><Renderer.Content /><Renderer.QueryLoading><p role="status">{zh ? '正在读取项目数据…' : 'Loading project data…'}</p></Renderer.QueryLoading><Renderer.QueryError><Renderer.Retry>{zh ? '重试能力调用' : 'Retry data source'}</Renderer.Retry></Renderer.QueryError></Renderer>}</div>}
    {errors.length > 0 && !isStreaming && <div className="genui-error" role="alert"><p>{zh ? '界面需要调整，当前输入已保留。' : 'The interface needs adjustment. Your current input is preserved.'}</p>{config.features.diagnostics && <ul>{errors.map((error, index) => <li key={index}>{error}</li>)}</ul>}<div>{config.features.repair && <button type="button" className="quiet-button" disabled={repairing} onClick={() => repair()}>{zh ? '交给助手修复' : 'Ask assistant to repair'}</button>}<button className="quiet-button" onClick={() => { setInitialState({ ...localState.current }); setRuntimeErrors([]); setRetry(value => value + 1); }}>{zh ? '重新渲染' : 'Render again'}</button>{repairing && <button type="button" className="quiet-button" onClick={() => void cancelRepair()}>{zh ? '取消修复' : 'Cancel repair'}</button>}</div></div>}
    {repairing && !errors.length && <p role="status">{zh ? '助手正在修复…' : 'Assistant is repairing…'}<button className="quiet-button" onClick={() => void cancelRepair()}>{zh ? '取消' : 'Cancel'}</button></p>}
    {storageError && <div role="alert" className="genui-error"><p>{storageError}</p><button className="quiet-button" onClick={() => void request<Saved | null>('genui.get', { id: ownerId }).then(setRemoteSaved).catch(error => setStorageError(String(error)))}>{zh ? '读取最新保存版本' : 'Read latest saved version'}</button>{remoteSaved && <details open><summary>{zh ? '最新保存版本' : 'Latest saved version'}</summary><pre>{remoteSaved.source}</pre><pre>{JSON.stringify(remoteSaved.state,null,2)}</pre><button className="quiet-button" onClick={() => { savedRevision.current = remoteSaved.revision; setRemoteSaved(null); save(); }}>{zh ? '用当前源码和输入保存' : 'Save current source and input'}</button><button className="quiet-button" onClick={() => { savedRevision.current = remoteSaved.revision; localState.current = remoteSaved.state; setInitialState(remoteSaved.state); setRemoteSaved(null); setStorageError(''); setRetry(value => value + 1); }}>{zh ? '恢复已保存输入' : 'Restore saved input'}</button></details>}</div>}
    </div>
    {config.features.showSource && <details className="genui-source"><summary className="icon-button genui-source-toggle" title={zh ? '查看源码' : 'View source'} aria-label={zh ? '查看源码' : 'View source'}><Code2 size={12} aria-hidden="true" /></summary><pre tabIndex={0} role="region" aria-label={zh ? '生成式UI源码' : 'Generated UI source'}><code>{source}</code></pre></details>}
  </div>;
}
