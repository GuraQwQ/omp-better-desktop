import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, FolderOpen, Plus, RefreshCw } from 'lucide-react';
import Select from '../components/Select';
import AgentSourceIcon from '../components/AgentSourceIcon';
import { pickPath } from '../lib/bridge';
import { localizeError } from '../lib/i18n';
import { agentModelOptions, keyValueLines, lineValues, manage, settingInput, type ManagedItem } from '../lib/management';
import type { Json, Language } from '../lib/types';
import './managed-resources.css';

interface Props { resource: string; sessionId: string; language: Language; onError: (error: unknown) => void }
type Words = ReturnType<typeof words>;
const words = (language: Language) => language === 'zh' ? {
  refresh: '刷新', add: '添加', create: '创建', save: '保存', cancel: '取消', close: '收起', edit: '编辑', remove: '删除', confirmRemove: '确认删除',
  search: '搜索名称或来源…', loading: '正在读取…', empty: '暂无条目', noMatches: '没有匹配的条目', working: '正在处理…', done: '已完成', retry: '重试', nextSession: '重新连接会话后生效。',
  enabled: '已启用', disabled: '已停用', enable: '启用', disable: '停用', details: '详情', preview: '内容', advanced: '高级设置', name: '名称', description: '说明',
  scope: '保存位置', user: '用户', project: '当前项目', source: '来源', managed: 'OMP 托管', test: '测试连接', reconnect: '重连', reauth: '重新授权',
  transport: '连接方式', command: '命令', args: '参数，每行一个', env: '环境变量', headers: '请求头', keyValue: '名称=值，每行一项', url: '地址',
  mcp: 'MCP 服务', skills: '技能', plugins: '插件', agents: '代理定义', ssh: 'SSH 主机', resources: '指令与记忆',
  mcpHint: '管理服务连接及其工具。', skillsHint: '查看已发现的技能，管理 OMP 托管技能。', pluginsHint: '管理插件、功能和市场来源。',
  agentsHint: '为已发现的代理选择模型和运行方式。', sshHint: '保存并测试远程主机连接。', resourcesHint: '查看指令来源与记忆内容，管理已发现的 Hook。',
  body: '正文', skillName: '技能名称', install: '安装', installSource: '插件来源', installHint: 'npm 包、本地路径或 名称@市场', update: '升级', uninstall: '卸载', keepSecret: '留空保留已保存值', pluginScope: '市场插件可保存到当前项目；npm 与本地插件安装到用户目录。',
  marketplaces: '插件市场', marketSource: '市场地址或来源', browse: '浏览插件', features: '功能', settings: '配置', reset: '重置', inherit: '继承默认', model: '模型覆盖',
  searchModels: '搜索模型或提供商…', prewalk: '预先执行', on: '开启', off: '关闭', host: '主机地址', username: '用户名', port: '端口', keyPath: '密钥文件', choose: '选择文件',
  compat: '兼容模式', hooks: 'Hooks', commands: '自定义命令', templates: '提示词模板', memory: '记忆', optional: '可选', invalid: '请检查输入。',
} : {
  refresh: 'Refresh', add: 'Add', create: 'Create', save: 'Save', cancel: 'Cancel', close: 'Collapse', edit: 'Edit', remove: 'Delete', confirmRemove: 'Confirm delete',
  search: 'Search name or source…', loading: 'Loading…', empty: 'No items yet', noMatches: 'No matching items', working: 'Working…', done: 'Done', retry: 'Retry', nextSession: 'Reconnect the session to apply.',
  enabled: 'Enabled', disabled: 'Disabled', enable: 'Enable', disable: 'Disable', details: 'Details', preview: 'Content', advanced: 'Advanced settings', name: 'Name', description: 'Description',
  scope: 'Save to', user: 'User', project: 'Current project', source: 'Source', managed: 'Managed by OMP', test: 'Test connection', reconnect: 'Reconnect', reauth: 'Reauthorize',
  transport: 'Transport', command: 'Command', args: 'Arguments, one per line', env: 'Environment variables', headers: 'Headers', keyValue: 'name=value, one per line', url: 'URL',
  mcp: 'MCP servers', skills: 'Skills', plugins: 'Plugins', agents: 'Agent definitions', ssh: 'SSH hosts', resources: 'Instructions & memory',
  mcpHint: 'Manage server connections and their tools.', skillsHint: 'Browse discovered skills and manage OMP skills.', pluginsHint: 'Manage plugins, features, and marketplace sources.',
  agentsHint: 'Choose models and behavior for discovered agents.', sshHint: 'Save and test remote host connections.', resourcesHint: 'Inspect instructions and memory, and manage discovered hooks.',
  body: 'Body', skillName: 'Skill name', install: 'Install', installSource: 'Plugin source', installHint: 'npm package, local path, or name@marketplace', update: 'Update', uninstall: 'Uninstall', keepSecret: 'Leave blank to keep the saved value', pluginScope: 'Marketplace plugins support project installs; npm and local plugins install to the user directory.',
  marketplaces: 'Marketplaces', marketSource: 'Marketplace URL or source', browse: 'Browse plugins', features: 'Features', settings: 'Settings', reset: 'Reset', inherit: 'Inherit default', model: 'Model override',
  searchModels: 'Search models or providers…', prewalk: 'Prewalk', on: 'On', off: 'Off', host: 'Hostname', username: 'Username', port: 'Port', keyPath: 'Key file', choose: 'Choose file',
  compat: 'Compatibility mode', hooks: 'Hooks', commands: 'Custom commands', templates: 'Prompt templates', memory: 'Memory', optional: 'Optional', invalid: 'Check the input.',
};

function useManager({ resource, sessionId, language, onError }: Props, listArgs: Json = {}) {
  const [items, setItems] = useState<ManagedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [version, setVersion] = useState(0);
  const active = useRef(true);
  const pending = useRef(false);
  const requestVersion = useRef(0);
  const errorHandler = useRef(onError);
  errorHandler.current = onError;
  const listKey = JSON.stringify(listArgs);
  const fail = useCallback((error: unknown) => {
    if (!active.current) return;
    setError(localizeError(error instanceof Error ? error.message : String(error), language)); errorHandler.current(error);
  }, [language]);
  const load = useCallback(async () => {
    const revision = ++requestVersion.current;
    setLoading(true); setError('');
    try {
      const result = await manage<{ items: ManagedItem[] }>(sessionId, resource, 'list', JSON.parse(listKey));
      if (active.current && revision === requestVersion.current) { setItems(result.items); setVersion(value => value + 1); }
    } catch (error) { if (revision === requestVersion.current) fail(error); }
    finally { if (active.current && revision === requestVersion.current) setLoading(false); }
  }, [sessionId, resource, listKey, fail]);
  useEffect(() => { active.current = true; void load(); return () => { active.current = false; }; }, [load]);
  const run = async (action: string, args: Json = {}, refresh = true, targetResource = resource) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await manage(sessionId, targetResource, action, args);
      if (!active.current) return;
      const message = result.message ?? (action === 'test' ? JSON.stringify(result, null, 2) : words(language).done);
      setNotice(result.restartRequired ? `${message} ${words(language).nextSession}` : message);
      if (refresh) await load();
      return result;
    } catch (error) { fail(error); }
    finally { pending.current = false; if (active.current) setBusy(false); }
  };
  const detail = async (id: string, args: Json = {}) => (await manage<{ item: ManagedItem }>(sessionId, resource, 'detail', { id, ...args })).item;
  return { items, loading, busy, error, notice, version, load, run, detail, fail };
}
type Manager = ReturnType<typeof useManager>;

export default function ManagedResources(props: Props) {
  return <ManagementPage key={`${props.sessionId}:${props.resource}`} {...props} />;
}

function ManagementPage(props: Props) {
  if (props.resource === 'resources') return <ResourceInventory {...props} />;
  if (props.resource === 'plugins') return <PluginsPage {...props} />;
  if (props.resource === 'mcp') return <McpPage {...props} />;
  if (props.resource === 'skills') return <SkillsPage {...props} />;
  if (props.resource === 'agents') return <AgentsPage {...props} />;
  if (props.resource === 'ssh') return <SshPage {...props} />;
  return null;
}

function Page({ manager, title, hint, text, children, add, query, setQuery }: { manager: Manager; title: string; hint?: string; text: Words; children: ReactNode; add?: ReactNode; query?: string; setQuery?: (value: string) => void }) {
  return <section className="managed-resources" aria-label={title} aria-busy={manager.loading || manager.busy}>
    <header className="managed-header"><div><h2>{title}</h2>{hint && <p>{hint}</p>}</div><button type="button" className="quiet-button" disabled={manager.busy || manager.loading} onClick={() => void manager.load()}><RefreshCw size={14} />{text.refresh}</button></header>
    {(setQuery || add) && <div className="managed-toolbar">{setQuery && <input type="search" aria-label={text.search} placeholder={text.search} disabled={manager.busy} value={query} onChange={event => setQuery(event.target.value)} />}{add}</div>}
    {manager.error && <div className="managed-feedback" role="alert"><p>{manager.error}</p><button className="quiet-button" type="button" disabled={manager.busy} onClick={() => void manager.load()}>{text.retry}</button></div>}
    {(manager.notice || manager.busy) && <p className="managed-notice" role="status">{manager.busy ? text.working : manager.notice}</p>}
    {manager.loading ? <p className="managed-empty" role="status">{text.loading}</p> : children}
  </section>;
}

const matches = (item: ManagedItem, query: string) => `${item.name} ${item.description ?? ''} ${item.source ?? ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase());
function Empty({ items, query, text }: { items: ManagedItem[]; query?: string; text: Words }) { return !items.length ? <p className="managed-empty">{query ? text.noMatches : text.empty}</p> : null; }
function ItemTitle({ item, text }: { item: ManagedItem; text: Words }) {
  return <div className="managed-item-title"><div className="agent-source-name"><AgentSourceIcon source={item.importSource ?? item.provider ?? item.source} path={item.importPath ?? item.filePath ?? item.path} /><strong>{item.name}</strong></div><div className="managed-meta">{item.scope && <span>{item.scope === 'user' ? text.user : item.scope === 'project' ? text.project : item.scope}</span>}{item.managed && <span>{text.managed}</span>}{item.type && <span>{String(item.type)}</span>}{item.source && <span title={item.source}>{item.source}</span>}{item.enabled !== undefined && <span>{item.enabled ? text.enabled : text.disabled}</span>}{item.status && <span>{String(item.status)}</span>}</div>{item.description && <p>{item.description}</p>}</div>;
}
function Scope({ value, onChange, text, disabled }: { value: string; onChange: (value: string) => void; text: Words; disabled?: boolean }) {
  return <label className="managed-field"><span>{text.scope}</span><Select label={text.scope} value={value} onChange={onChange} disabled={disabled} options={[{ value: 'user', label: text.user }, { value: 'project', label: text.project }]} /></label>;
}
function Toggle({ item, manager, text, args = {} }: { item: ManagedItem; manager: Manager; text: Words; args?: Json }) {
  return <button type="button" className="quiet-button" disabled={manager.busy} onClick={() => void manager.run(item.enabled === false ? 'enable' : 'disable', { id: item.id, scope: item.scope, ...args })}>{item.enabled === false ? text.enable : text.disable}</button>;
}
function Delete({ manager, text, item, action = 'remove', args = {}, label }: { manager: Manager; text: Words; item: ManagedItem; action?: string; args?: Json; label?: string }) {
  const [confirm, setConfirm] = useState(false);
  return confirm ? <span className="managed-confirm"><span>{item.name}</span><button type="button" className="quiet-button managed-danger" disabled={manager.busy} onClick={async () => { if (await manager.run(action, { id: item.id, scope: item.scope, ...args })) setConfirm(false); }}>{text.confirmRemove}</button><button type="button" className="quiet-button" disabled={manager.busy} onClick={() => setConfirm(false)}>{text.cancel}</button></span> : <button type="button" className="quiet-button" disabled={manager.busy} onClick={() => setConfirm(true)}>{label ?? text.remove}</button>;
}
function BodyPreview({ item }: { item: Json }) {
  const body = item.body ?? item.content ?? item.systemPrompt;
  return <>{item.filePath && <code className="managed-path">{item.filePath}</code>}{body !== undefined && <pre className="managed-preview">{typeof body === 'string' ? body : JSON.stringify(body, null, 2)}</pre>}</>;
}
function Detail({ manager, item, text, children, args }: { manager: Manager; item: ManagedItem; text: Words; children?: (detail: ManagedItem) => ReactNode; args?: Json }) {
  const [detail, setDetail] = useState<ManagedItem>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const load = async () => {
    setLoading(true); setError('');
    try { const result = await manager.detail(item.id, args); if (active.current) setDetail(result); }
    catch (error) { if (active.current) setError(error instanceof Error ? error.message : String(error)); }
    finally { if (active.current) setLoading(false); }
  };
  return <details className="managed-detail" onToggle={event => { if (event.currentTarget.open && !detail && !loading && !error) void load(); }}><summary><ChevronDown size={13} />{text.details}</summary>{loading ? <p role="status">{text.loading}</p> : error ? <div role="alert"><p>{error}</p><button type="button" className="quiet-button" onClick={() => void load()}>{text.retry}</button></div> : detail ? <><BodyPreview item={detail} />{children?.(detail)}</> : null}</details>;
}
function FormActions({ manager, text, cancel, children }: { manager: Manager; text: Words; cancel: () => void; children?: ReactNode }) {
  return <div className="managed-actions"><button className="secondary-button" type="submit" disabled={manager.busy}>{text.save}</button>{children}<button type="button" className="quiet-button" disabled={manager.busy} onClick={cancel}>{text.cancel}</button></div>;
}

function McpPage(props: Props) {
  const m = useManager(props), t = words(props.language);
  const [query, setQuery] = useState(''), [adding, setAdding] = useState(false);
  const [authId, setAuthId] = useState(''), [cancelling, setCancelling] = useState(false);
  const [name, setName] = useState(''), [scope, setScope] = useState('user'), [transport, setTransport] = useState('stdio');
  const [command, setCommand] = useState(''), [args, setArgs] = useState(''), [env, setEnv] = useState(''), [url, setUrl] = useState(''), [headers, setHeaders] = useState('');
  const config = () => transport === 'stdio' ? { type: transport, command: command.trim(), args: lineValues(args), env: keyValueLines(env) } : { type: transport, url: url.trim(), headers: keyValueLines(headers) };
  const submit = async (test = false) => {
    try { const result = await m.run(test ? 'test' : 'add', { name: name.trim(), scope, config: config() }, !test); if (result && !test) { setAdding(false); setName(''); setCommand(''); setArgs(''); setEnv(''); setUrl(''); setHeaders(''); } }
    catch (error) { m.fail(error); }
  };
  const authorize = async (item: ManagedItem) => { setAuthId(item.id); await m.run('reauth', { id: item.id, scope: item.scope }); setAuthId(''); };
  const cancelAuth = async () => {
    setCancelling(true);
    try { await manage(props.sessionId, 'mcp', 'cancel_auth', { id: authId }); }
    catch (error) { m.fail(error); }
    finally { setCancelling(false); }
  };
  const shown = m.items.filter(item => matches(item, query));
  return <Page manager={m} title={t.mcp} hint={t.mcpHint} text={t} query={query} setQuery={setQuery} add={<button className="secondary-button" disabled={m.busy} onClick={() => setAdding(true)}><Plus size={14} />{t.add}</button>}>
    {adding && <form className="managed-form" onSubmit={event => { event.preventDefault(); void submit(); }}><fieldset disabled={m.busy}>
      <div className="managed-columns"><label className="managed-field">{t.name}<input value={name} required onChange={event => setName(event.target.value)} /></label><Scope value={scope} onChange={setScope} text={t} /></div>
      <label className="managed-field">{t.transport}<Select label={t.transport} value={transport} onChange={setTransport} options={['stdio', 'http', 'sse'].map(value => ({ value, label: value === 'http' ? 'HTTP' : value === 'sse' ? 'SSE' : 'stdio' }))} /></label>
      {transport === 'stdio' ? <><label className="managed-field">{t.command}<input required value={command} onChange={event => setCommand(event.target.value)} /></label><label className="managed-field">{t.args}<textarea aria-label={t.args} rows={3} value={args} onChange={event => setArgs(event.target.value)} /></label></> : <label className="managed-field">{t.url}<input required type="url" value={url} onChange={event => setUrl(event.target.value)} /></label>}
      <details className="managed-detail"><summary><ChevronDown size={13} />{t.advanced}</summary>{transport === 'stdio' ? <label className="managed-field">{t.env}<textarea aria-label={t.env} rows={3} placeholder={t.keyValue} value={env} onChange={event => setEnv(event.target.value)} /></label> : <label className="managed-field">{t.headers}<textarea aria-label={t.headers} rows={3} placeholder={t.keyValue} value={headers} onChange={event => setHeaders(event.target.value)} /></label>}</details>
    </fieldset><FormActions manager={m} text={t} cancel={() => setAdding(false)}><button className="quiet-button" type="button" disabled={m.busy || !(transport === 'stdio' ? command.trim() : url.trim())} onClick={() => void submit(true)}>{t.test}</button></FormActions></form>}
    <Empty items={shown} query={query} text={t} />{shown.map(item => <article className="managed-item" key={item.id}><ItemTitle item={item} text={t} /><div className="managed-actions"><Toggle manager={m} item={item} text={t} /><button type="button" className="quiet-button" disabled={m.busy} onClick={() => void m.run('test', { id: item.id, scope: item.scope }, false)}>{t.test}</button><button type="button" className="quiet-button" disabled={m.busy} onClick={() => void m.run('reconnect', { id: item.id, scope: item.scope })}>{t.reconnect}</button><button type="button" className="quiet-button" disabled={m.busy} onClick={() => void authorize(item)}>{t.reauth}</button>{authId === item.id && <button type="button" className="quiet-button" disabled={cancelling} onClick={() => void cancelAuth()}>{t.cancel}</button>}{!item.readOnly && <Delete manager={m} item={item} text={t} />}</div>{(item.command || item.url) && <code className="managed-path">{item.command ?? item.url}</code>}</article>)}
  </Page>;
}

function SkillsPage(props: Props) {
  const m = useManager(props), t = words(props.language);
  const [query, setQuery] = useState(''), [edit, setEdit] = useState<ManagedItem | null | undefined>();
  const [name, setName] = useState(''), [description, setDescription] = useState(''), [body, setBody] = useState('');
  const open = (item: ManagedItem | null) => { setEdit(item); setName(item?.name ?? ''); setDescription(item?.description ?? ''); setBody(item?.body ?? item?.content ?? ''); };
  const shown = m.items.filter(item => matches(item, query));
  return <Page manager={m} title={t.skills} hint={t.skillsHint} text={t} query={query} setQuery={setQuery} add={<button className="secondary-button" disabled={m.busy} onClick={() => open(null)}><Plus size={14} />{t.create}</button>}>
    {edit !== undefined && <form className="managed-form" onSubmit={event => { event.preventDefault(); void m.run(edit ? 'update' : 'create', { id: edit?.id, name: name.trim(), description: description.trim(), body }).then(result => { if (result) setEdit(undefined); }); }}><fieldset disabled={m.busy}><label className="managed-field">{t.skillName}<input required value={name} disabled={!!edit} onChange={event => setName(event.target.value)} /></label><label className="managed-field">{t.description}<input required value={description} onChange={event => setDescription(event.target.value)} /></label><label className="managed-field">{t.body}<textarea aria-label={t.body} required rows={10} value={body} onChange={event => setBody(event.target.value)} /></label></fieldset><FormActions manager={m} text={t} cancel={() => setEdit(undefined)} /></form>}
    <Empty items={shown} query={query} text={t} />{shown.map(item => <article className="managed-item" key={item.id}><ItemTitle item={item} text={t} /><div className="managed-actions"><Toggle manager={m} item={item} text={t} />{item.managed && <Delete manager={m} item={item} action="delete" text={t} />}</div><Detail manager={m} item={item} text={t} key={`${item.id}:${m.version}`}>{detail => detail.managed || item.managed ? <button type="button" className="quiet-button" disabled={m.busy} onClick={() => open(detail)}>{t.edit}</button> : null}</Detail></article>)}
  </Page>;
}

function PluginsPage(props: Props) {
  const m = useManager(props), t = words(props.language);
  const [query, setQuery] = useState(''), [adding, setAdding] = useState(false), [source, setSource] = useState(''), [scope, setScope] = useState('user');
  const [marketplaces, setMarketplaces] = useState<string[]>([]);
  const isMarketplace = marketplaces.some(name => source.trim().endsWith(`@${name}`));
  const shown = m.items.filter(item => matches(item, query));
  return <><Page manager={m} title={t.plugins} hint={t.pluginsHint} text={t} query={query} setQuery={setQuery} add={<button type="button" className="secondary-button" disabled={m.busy} onClick={() => setAdding(true)}><Plus size={14} />{t.install}</button>}>
    {adding && <form className="managed-form" onSubmit={event => { event.preventDefault(); void m.run('install', { source: source.trim(), scope: isMarketplace ? scope : 'user' }).then(result => { if (result) { setAdding(false); setSource(''); } }); }}><fieldset disabled={m.busy}><label className="managed-field">{t.installSource}<input value={source} required placeholder={t.installHint} onChange={event => setSource(event.target.value)} /></label><Scope value={isMarketplace ? scope : 'user'} onChange={setScope} text={t} disabled={!isMarketplace} /><small>{t.pluginScope}</small></fieldset><FormActions manager={m} text={t} cancel={() => setAdding(false)} /></form>}
    <Empty items={shown} query={query} text={t} />{shown.map(item => <article className="managed-item" key={`${item.scope}:${item.id}`}><ItemTitle item={item} text={t} /><div className="managed-actions"><Toggle manager={m} item={item} text={t} /><button type="button" className="quiet-button" disabled={m.busy} onClick={() => void m.run('update', { id: item.id, scope: item.scope })}>{t.update}</button><Delete manager={m} item={item} text={t} label={t.uninstall} /></div><Detail manager={m} item={item} text={t} args={{ scope: item.scope }} key={`${item.scope}:${item.id}:${m.version}`}>{detail => <PluginSettings item={{ ...detail, scope: item.scope }} manager={m} text={t} />}</Detail></article>)}
  </Page><MarketplacesPage {...props} resource="marketplaces" onInstalled={m.load} onSources={setMarketplaces} /></>;
}

function PluginSettings({ item, manager, text }: { item: ManagedItem; manager: Manager; text: Words }) {
  const [features, setFeatures] = useState<string[]>(item.enabledFeatures ?? item.features ?? []);
  const schema = item.schema?.properties ?? item.schema ?? {};
  return <>{Array.isArray(item.features) && item.features.length > 0 && <fieldset disabled={manager.busy}><legend>{text.features}</legend><div className="managed-features">{item.features.map((feature: string) => <label key={feature}><input type="checkbox" checked={features.includes(feature)} onChange={event => setFeatures(old => event.target.checked ? [...old, feature] : old.filter(value => value !== feature))} />{feature}</label>)}</div><button type="button" className="quiet-button" onClick={() => void manager.run('features', { id: item.id, scope: item.scope, features })}>{text.save}</button></fieldset>}{Object.entries(schema).map(([key, field]) => typeof field === 'object' && field ? <PluginSetting key={key} item={item} path={key} field={field as Json} manager={manager} text={text} /> : null)}</>;
}

function PluginSetting({ item, path, field, manager, text }: { item: ManagedItem; path: string; field: Json; manager: Manager; text: Words }) {
  const initial = field.secret ? undefined : item.settings?.[path] ?? field.default;
  const [value, setValue] = useState(typeof initial === 'object' ? JSON.stringify(initial, null, 2) : String(initial ?? ''));
  const [error, setError] = useState('');
  const id = useId();
  const label = field.title ?? path;
  const options = field.values ?? field.enum;
  const save = () => {
    try { const parsed = field.type === 'boolean' ? value === 'true' : settingInput(value, field.type); setError(''); void manager.run('setting', { id: item.id, scope: item.scope, key: path, value: parsed }); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
  };
  return <div className="managed-plugin-setting"><label htmlFor={id}><strong>{label}</strong>{field.description && <small>{field.description}</small>}</label><div className="managed-setting-control">{field.type === 'boolean' ? <Select label={label} value={value} disabled={manager.busy} onChange={setValue} options={[{ value: 'true', label: text.on }, { value: 'false', label: text.off }]} /> : options ? <Select label={label} value={value} disabled={manager.busy} onChange={setValue} options={options.map((option: unknown) => ({ value: String(option), label: String(option) }))} /> : ['array', 'object'].includes(field.type) ? <textarea id={id} aria-label={label} rows={3} disabled={manager.busy} value={value} onChange={event => setValue(event.target.value)} /> : <input id={id} type={field.format === 'password' || field.secret ? 'password' : field.type === 'number' || field.type === 'integer' ? 'number' : 'text'} min={field.min} max={field.max} step={field.step} placeholder={field.secret ? text.keepSecret : undefined} disabled={manager.busy} value={value} onChange={event => setValue(event.target.value)} />}<button type="button" className="quiet-button" disabled={manager.busy || field.secret && !value} onClick={save}>{text.save}</button><button type="button" className="quiet-button" disabled={manager.busy} onClick={() => void manager.run('reset', { id: item.id, scope: item.scope, key: path })}>{text.reset}</button></div>{error && <p role="alert">{error}</p>}</div>;
}

function MarketplacesPage(props: Props & { onInstalled: () => Promise<void>; onSources: (names: string[]) => void }) {
  const m = useManager(props), t = words(props.language);
  const [source, setSource] = useState(''), [available, setAvailable] = useState<{ id: string; items: ManagedItem[] }>();
  useEffect(() => { props.onSources(m.items.map(item => item.name)); }, [m.items, props.onSources]);
  const browse = async (id: string) => {
    const result = await m.run('list_available', { id }, false);
    if (result) setAvailable({ id, items: result.items });
  };
  return <Page manager={m} title={t.marketplaces} text={t}>
    <form className="managed-inline-form" onSubmit={event => { event.preventDefault(); void m.run('add', { source: source.trim() }).then(result => { if (result) setSource(''); }); }}><input required aria-label={t.marketSource} placeholder={t.marketSource} value={source} onChange={event => setSource(event.target.value)} /><button type="submit" className="quiet-button" disabled={m.busy}>{t.add}</button></form>
    <Empty items={m.items} text={t} />{m.items.map(item => <article className="managed-item" key={item.id}><ItemTitle item={item} text={t} /><div className="managed-actions"><button type="button" className="quiet-button" disabled={m.busy} onClick={() => void browse(item.id)}>{t.browse}</button><button type="button" className="quiet-button" disabled={m.busy} onClick={() => void m.run('refresh', { id: item.id })}>{t.refresh}</button><Delete manager={m} text={t} item={item} /></div>{available?.id === item.id && <div className="managed-market-catalog"><button type="button" className="quiet-button" onClick={() => setAvailable(undefined)}>{t.close}</button><Empty items={available.items} text={t} />{available.items.map(plugin => <div className="managed-market-plugin" key={plugin.id}><div><strong>{plugin.name}</strong>{plugin.description && <p>{plugin.description}</p>}</div><button type="button" className="quiet-button" disabled={m.busy} onClick={async () => { if (await m.run('install', { source: plugin.source ?? `${plugin.name}@${item.name}`, scope: 'user' }, false, 'plugins')) await props.onInstalled(); }}>{t.install}</button></div>)}</div>}</article>)}
  </Page>;
}

function AgentsPage(props: Props) {
  const m = useManager(props), t = words(props.language);
  const [query, setQuery] = useState('');
  const [models, setModels] = useState<Json[]>([]), [modelsLoading, setModelsLoading] = useState(true);
  const modelRequest = useRef(0);
  const loadModels = useCallback(async () => {
    const revision = ++modelRequest.current;
    setModelsLoading(true);
    try { const result = await manage<{ models: Json[] }>(props.sessionId, 'models', 'list'); if (revision === modelRequest.current) setModels(result.models); }
    catch (error) { if (revision === modelRequest.current) m.fail(error); }
    finally { if (revision === modelRequest.current) setModelsLoading(false); }
  }, [props.sessionId, m.fail]);
  useEffect(() => { void loadModels(); return () => { modelRequest.current++; }; }, [loadModels]);
  const shown = m.items.filter(item => matches(item, query));
  return <Page manager={{ ...m, load: async () => { await Promise.all([m.load(), loadModels()]); } }} title={t.agents} hint={t.agentsHint} text={t} query={query} setQuery={setQuery}><Empty items={shown} query={query} text={t} />{shown.map(item => <article className="managed-item" key={item.id}><ItemTitle item={item} text={t} /><div className="managed-actions"><Toggle item={item} manager={m} text={t} /></div><AgentOptions item={item} manager={m} text={t} models={models} modelsLoading={modelsLoading} key={`${item.id}:${m.version}`} /></article>)}</Page>;
}
function AgentOptions({ item, manager, text, models, modelsLoading }: { item: ManagedItem; manager: Manager; text: Words; models: Json[]; modelsLoading: boolean }) {
  const [model, setModel] = useState(item.modelOverride ?? ''), [prewalk, setPrewalk] = useState(item.prewalkOverride ?? 'default');
  const [query, setQuery] = useState('');
  const options = [{ value: '', label: item.model ? `${text.inherit} · ${item.model}` : text.inherit }, ...agentModelOptions(models, model, query)];
  return <details className="managed-detail"><summary><ChevronDown size={13} />{text.details}</summary><BodyPreview item={item} /><div className="managed-plugin-setting"><label className="managed-field">{text.model}<input type="search" value={query} disabled={manager.busy || modelsLoading} aria-label={text.searchModels} placeholder={text.searchModels} onChange={event => setQuery(event.target.value)} /></label><div className="managed-setting-control"><Select label={text.model} value={model} disabled={manager.busy || modelsLoading} onChange={setModel} options={options} /><button type="button" className="quiet-button" disabled={manager.busy || modelsLoading} onClick={() => void manager.run('model', { id: item.id, model })}>{text.save}</button></div>{modelsLoading && <small role="status">{text.loading}</small>}</div><div className="managed-plugin-setting"><label className="managed-field">{text.prewalk}<Select label={text.prewalk} disabled={manager.busy} value={prewalk} onChange={setPrewalk} options={[{ value: 'default', label: text.inherit }, { value: 'on', label: text.on }, { value: 'off', label: text.off }]} /></label><button type="button" className="quiet-button" disabled={manager.busy} onClick={() => void manager.run('prewalk', { id: item.id, value: prewalk })}>{text.save}</button></div>{Array.isArray(item.tools) && <p className="managed-meta">{item.tools.join(', ')}</p>}</details>;
}

function SshPage(props: Props) {
  const m = useManager(props), t = words(props.language);
  const [query, setQuery] = useState(''), [editing, setEditing] = useState<ManagedItem | null | undefined>();
  const [name, setName] = useState(''), [scope, setScope] = useState('user'), [host, setHost] = useState(''), [username, setUsername] = useState(''), [port, setPort] = useState(''), [keyPath, setKeyPath] = useState(''), [description, setDescription] = useState(''), [compat, setCompat] = useState(false);
  const open = (item: ManagedItem | null) => { setEditing(item); setName(item?.name ?? ''); setScope(item?.scope ?? 'user'); setHost(item?.host ?? ''); setUsername(item?.username ?? ''); setPort(String(item?.port ?? '')); setKeyPath(item?.keyPath ?? ''); setDescription(item?.description ?? ''); setCompat(item?.compat ?? false); };
  const hostValue = () => {
    const parsed = port.trim() ? Number(port) : undefined;
    if (parsed !== undefined && (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535)) throw new Error(props.language === 'zh' ? '端口应为 1 至 65535 的整数。' : 'Port must be an integer from 1 to 65535.');
    return { host: host.trim(), username: username.trim() || undefined, port: parsed, keyPath: keyPath.trim() || undefined, description: description.trim() || undefined, compat };
  };
  const submit = async (test = false) => {
    try { const result = await m.run(test ? 'test' : editing ? 'update' : 'create', { name: name.trim(), scope, previousName: editing?.name, previousScope: editing?.scope, host: hostValue() }, !test); if (result && !test) setEditing(undefined); }
    catch (error) { m.fail(error); }
  };
  const shown = m.items.filter(item => matches(item, query));
  return <Page manager={m} title={t.ssh} hint={t.sshHint} text={t} query={query} setQuery={setQuery} add={<button type="button" className="secondary-button" disabled={m.busy} onClick={() => open(null)}><Plus size={14} />{t.add}</button>}>
    {editing !== undefined && <form className="managed-form" onSubmit={event => { event.preventDefault(); void submit(); }}><fieldset disabled={m.busy}><div className="managed-columns"><label className="managed-field">{t.name}<input value={name} required onChange={event => setName(event.target.value)} /></label><Scope value={scope} onChange={setScope} text={t} /></div><label className="managed-field">{t.host}<input value={host} required onChange={event => setHost(event.target.value)} /></label><div className="managed-columns"><label className="managed-field">{t.username}<input value={username} onChange={event => setUsername(event.target.value)} /></label><label className="managed-field">{t.port}<input value={port} type="number" min={1} max={65535} placeholder="22" onChange={event => setPort(event.target.value)} /></label></div><details className="managed-detail"><summary><ChevronDown size={13} />{t.advanced}</summary><label className="managed-field">{t.keyPath}<div className="managed-file-input"><input aria-label={t.keyPath} value={keyPath} onChange={event => setKeyPath(event.target.value)} /><button type="button" className="quiet-button" onClick={() => void pickPath(false).then(value => { if (value) setKeyPath(value); }).catch(m.fail)}><FolderOpen size={14} />{t.choose}</button></div></label><label className="managed-field">{t.description}<input value={description} onChange={event => setDescription(event.target.value)} /></label><label className="managed-checkbox"><input type="checkbox" checked={compat} onChange={event => setCompat(event.target.checked)} />{t.compat}</label></details></fieldset><FormActions manager={m} text={t} cancel={() => setEditing(undefined)}><button type="button" className="quiet-button" disabled={m.busy || !host.trim()} onClick={() => void submit(true)}>{t.test}</button></FormActions></form>}
    <Empty items={shown} query={query} text={t} />{shown.map(item => <article className="managed-item" key={`${item.scope}:${item.id}`}><ItemTitle item={item} text={t} /><code className="managed-path">{item.username ? `${item.username}@` : ''}{item.host}{item.port ? `:${item.port}` : ''}</code><div className="managed-actions">{!item.readOnly && <button type="button" className="quiet-button" disabled={m.busy} onClick={() => open(item)}>{t.edit}</button>}<button type="button" className="quiet-button" disabled={m.busy} onClick={() => void m.run('test', { id: item.id, host: { host: item.host, username: item.username, port: item.port, keyPath: item.keyPath, description: item.description, compat: item.compat } }, false)}>{t.test}</button>{!item.readOnly && <Delete item={item} manager={m} text={t} action="delete" />}</div></article>)}
  </Page>;
}

function ResourceInventory(props: Props) {
  const [kind, setKind] = useState('hooks');
  const t = words(props.language);
  return <section className="managed-resources"><h2>{t.resources}</h2><p className="managed-intro">{t.resourcesHint}</p><nav className="managed-tabs" aria-label={t.resources}>{(['hooks', 'commands', 'templates', 'memory'] as const).map(value => <button type="button" key={value} aria-pressed={kind === value} onClick={() => setKind(value)}>{t[value]}</button>)}</nav><InventorySection key={`${props.sessionId}:${kind}`} {...props} kind={kind} /></section>;
}
function InventorySection(props: Props & { kind: string }) {
  const m = useManager(props, { kind: props.kind }), t = words(props.language);
  const [query, setQuery] = useState('');
  const shown = m.items.filter(item => matches(item, query));
  const title = t[props.kind as 'hooks' | 'commands' | 'templates' | 'memory'];
  return <Page manager={m} title={title} text={t} query={query} setQuery={setQuery}><Empty items={shown} query={query} text={t} />{shown.map(item => <article className="managed-item" key={item.id}><ItemTitle item={item} text={t} />{props.kind === 'hooks' && <div className="managed-actions"><Toggle item={item} manager={m} text={t} args={{ kind: 'hooks' }} /></div>}<Detail key={`${item.id}:${m.version}`} item={item} manager={m} text={t} args={{ kind: props.kind }} /></article>)}</Page>;
}
