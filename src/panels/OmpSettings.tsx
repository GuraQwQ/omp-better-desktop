import { Fragment, useEffect, useId, useRef, useState } from 'react';
import { Plus, RefreshCw, X } from 'lucide-react';
import { rpc } from '../lib/bridge';
import { parseSettingInput, parseSettingLines, parseSettingRecord, settingApplicable, settingCategory, settingManagedInDesktop, settingMatches, settingOptionValues, settingText, settingView, type SettingRecordRow } from '../lib/settings-values';
import type { Json, Language } from '../lib/types';
import Select from '../components/Select';
import './omp-settings.css';

const categories: Record<string, [string, string]> = {
  model: ['模型', 'Models'], context: ['上下文', 'Context'], memory: ['记忆', 'Memory'],
  tools: ['工具', 'Tools'], tasks: ['任务', 'Tasks'], files: ['文件', 'Files'], shell: ['Shell', 'Shell'],
  interaction: ['交互', 'Interaction'], providers: ['服务', 'Services'], appearance: ['终端外观', 'Terminal'], advanced: ['高级', 'Advanced'],
};
const sources: Record<string, [string, string]> = {
  env: ['环境变量', 'Environment'], runtime: ['当前运行时', 'Runtime'], overlay: ['启动配置', 'Launch overlay'],
  project: ['项目', 'Project'], global: ['全局', 'Global'], default: ['默认', 'Default'],
};

const groupNames: Record<string, string> = {
  'Token optimization': 'Token 优化',
  Advisor: '顾问', Agent: '代理', Approvals: '审批', 'Auto-Learn': '自动学习', 'Available Tools': '可用工具',
  Collab: '协作', 'Commands & Skills': '命令与技能', Compaction: '上下文压缩', Composer: '输入框', Computer: '计算机操作',
  Developer: '开发者', 'Discovery & MCP': '发现与 MCP', Display: '显示', Editing: '编辑', 'Eval & Runtimes': '执行环境',
  Execution: '执行', Experimental: '实验功能', Extensions: '扩展', General: '常规', 'Grep & Browser': '检索与浏览器',
  Images: '图片', Input: '输入', Isolation: '隔离', 'Magic Keywords': '快捷关键词', Modes: '模式', Notifications: '通知',
  'Output Limits': '输出限制', Power: '电源', Prewalk: '预先执行', Privacy: '隐私', Prompt: '提示词', Protocol: '协议',
  'Read Summaries': '读取摘要', Reading: '读取', 'Retry & Fallback': '重试与回退', 'Rules (TTSR)': '规则（TTSR）',
  Sampling: '采样', Services: '服务', Skills: '技能', Speech: '语音', 'Startup & Updates': '启动与更新',
  'Status Line': '状态栏', Stream: '流式输出', Subagents: '子代理', Theme: '主题', Thinking: '思考',
  Timeouts: '超时', 'Tiny Model': '小型模型', Todos: '待办', Vision: '视觉',
};

export default function OmpSettings({ sessionId, language, initialQuery = '' }: { sessionId: string; language: Language; initialQuery?: string }) {
  const zh = language === 'zh';
  const [settings, setSettings] = useState<Json[]>([]);
  const [category, setCategory] = useState('model');
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const revision = useRef(0);
  const settingsSession = useRef('');
  const activeSession = useRef(sessionId);
  activeSession.current = sessionId;
  const load = async () => {
    const current = ++revision.current;
    const target = sessionId;
    setLoading(true); setError(''); setSettings([]);
    try {
      const result = await rpc(sessionId, 'desktop_settings', { operation: 'list' });
      if (current === revision.current && target === activeSession.current) { settingsSession.current = target; setSettings(result.settings); }
    } catch (error) { if (current === revision.current && target === activeSession.current) setError(String(error)); }
    finally { if (current === revision.current && target === activeSession.current) setLoading(false); }
  };
  useEffect(() => { void load(); return () => { revision.current++; }; }, [sessionId]);
  const values = Object.fromEntries(settings.map(setting => [setting.path, setting.value ?? setting.defaultValue]));
  const visible = settingsSession.current === sessionId ? settings.filter(setting => settingManagedInDesktop(setting) && (query.trim() ? settingMatches(setting, query, language) : settingCategory(setting) === category && settingApplicable(setting, values))) : [];
  const groups = [...new Set(visible.map(setting => setting.ui?.group ?? ''))];
  return <div className="omp-settings">
    <div className="settings-section-heading"><h2>{zh ? 'OMP 配置' : 'OMP settings'}</h2><button className="icon-button" title={zh ? '刷新' : 'Refresh'} disabled={loading} onClick={() => void load()}><RefreshCw size={15} /></button></div>
    <p className="settings-hint">{zh ? '更改保存到当前 OMP 配置的全局层。每项显示实际生效的来源；项目、启动参数或环境变量可覆盖全局值。' : 'Changes are saved globally in the active OMP profile. Each setting shows its effective source; project, launch and environment values can override global values.'}</p>
    <input className="settings-search" type="search" aria-label={zh ? '搜索 OMP 配置' : 'Search OMP settings'} placeholder={zh ? '搜索设置名称或配置键' : 'Search names or setting keys'} value={query} onChange={event => setQuery(event.target.value)} />
    <nav className="settings-tabs" aria-label={zh ? '配置分类' : 'Setting categories'}>{Object.entries(categories).filter(([id]) => settings.some(setting => settingCategory(setting) === id)).map(([id, names]) => <button key={id} aria-pressed={category === id && !query.trim()} onClick={() => { setCategory(id); setQuery(''); }}>{names[zh ? 0 : 1]}</button>)}</nav>
    {error && <p role="alert" className="settings-error">{error}</p>}
    {loading ? <p role="status">{zh ? '正在读取配置…' : 'Loading settings…'}</p> : !visible.length ? <p className="settings-hint">{zh ? '没有匹配的设置。' : 'No matching settings.'}</p> : groups.map(group => <section key={group} className="settings-field-group">{group && <h3>{zh ? groupNames[group] ?? group : group}</h3>}{visible.filter(setting => (setting.ui?.group ?? '') === group).map(setting => <SettingField key={`${sessionId}:${setting.path}`} setting={setting} language={language} save={async (value, reset) => {
      const current = revision.current;
      if (sessionId !== activeSession.current) throw new DOMException('Cancelled', 'AbortError');
      const result = await rpc(sessionId, 'desktop_settings', { operation: reset ? 'unset' : 'set', key: setting.path, ...(reset ? {} : { value }) });
      if (current !== revision.current || sessionId !== activeSession.current) throw new DOMException('Cancelled', 'AbortError');
      setSettings(result.settings);
    }} />)}</section>)}
  </div>;
}

export function SettingField({ setting, language, save }: { setting: Json; language: Language; save: (value: unknown, reset?: boolean) => Promise<void> }) {
  const zh = language === 'zh';
  const id = useId();
  const initial = setting.value ?? setting.defaultValue;
  const stored = settingText(initial ?? (setting.type === 'array' ? [] : ['record', 'object'].includes(setting.type) ? {} : ''));
  const [value, setValue] = useState(stored);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [raw, setRaw] = useState(false);
  const [recordInvalid, setRecordInvalid] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const { label, description, options } = settingView(setting, language);
  const optionValues = settingOptionValues(setting);
  useEffect(() => { setValue(stored); setError(''); setRecordInvalid(false); }, [stored]);
  const change = (next: string) => { setValue(next); setSaved(false); setError(''); };
  const commit = async (reset = false) => {
    if (!reset && recordInvalid) return;
    setError(''); setSaved(false);
    let parsed: unknown;
    try { parsed = reset ? undefined : parseSettingInput(setting, value); }
    catch { setError(zh ? setting.type === 'number' ? '请输入有效数字。' : '请检查数组或对象的格式。' : setting.type === 'number' ? 'Enter a valid number.' : 'Check the array or object format.'); return; }
    setBusy(true);
    try { await save(parsed, reset); if (reset) { setValue(stored); setRecordInvalid(false); setEditorRevision(previous => previous + 1); } setSaved(true); }
    catch (error) { setError(String(error)); }
    finally { setBusy(false); }
  };
  const structured = ['array', 'object', 'record'].includes(setting.type);
  let parsed: unknown;
  try { parsed = structured ? JSON.parse(value || (setting.type === 'array' ? '[]' : '{}')) : undefined; } catch { parsed = undefined; }
  const list = Array.isArray(parsed) && parsed.every(item => typeof item === 'string');
  const members = Array.isArray(parsed) && options.length > 0 && parsed.every(item => ['string', 'number', 'boolean'].includes(typeof item));
  const record = parsed && !Array.isArray(parsed) && typeof parsed === 'object' && Object.values(parsed).every(item => ['string', 'number', 'boolean'].includes(typeof item));
  const form = list || members || record;
  const editable = structured ? raw || setting.ui?.editor === 'json' || !form ? 'json' : list || members ? 'list' : 'record' : 'scalar';
  return <div className="setting-editor" aria-busy={busy}>
    <div className="setting-field-heading"><label htmlFor={id}><strong>{label}</strong></label><span className="setting-source">{sources[setting.provenance]?.[zh ? 0 : 1] ?? setting.provenance}{setting.credential && setting.configured ? zh ? ' · 已配置' : ' · Configured' : ''}</span></div>
    {description && <p className="settings-hint setting-description" id={`${id}-description`}>{description}</p>}
    <fieldset disabled={busy} className="setting-field-control">
      {editable === 'list' && options.length ? <div className="setting-members">{options.map((option, index) => <label key={index}><input type="checkbox" checked={(parsed as unknown[]).some(item => Object.is(item, optionValues[index]))} onChange={event => change(JSON.stringify(event.target.checked ? [...parsed as unknown[], optionValues[index]] : (parsed as unknown[]).filter(item => !Object.is(item, optionValues[index]))))} />{option.label}</label>)}</div>
        : editable === 'list' ? <textarea id={id} aria-label={label} rows={3} value={(parsed as string[]).join('\n')} placeholder={zh ? '每行一项' : 'One item per line'} onChange={event => change(JSON.stringify(parseSettingLines(event.target.value)))} />
        : editable === 'record' ? <RecordFields key={`${setting.path}:${editorRevision}`} value={parsed as Json} numeric={setting.path === 'providers.maxInFlightRequests'} language={language} onInvalid={setRecordInvalid} onChange={next => change(JSON.stringify(next))} />
        : editable === 'json' ? <textarea id={id} aria-label={label} className="setting-json" rows={5} spellCheck={false} value={value} onChange={event => change(event.target.value)} />
        : setting.type === 'boolean' ? <label className="setting-switch"><input id={id} className="capture-switch" type="checkbox" role="switch" checked={value === 'true'} onChange={event => change(String(event.target.checked))} /><span>{value === 'true' ? zh ? '已开启' : 'On' : zh ? '已关闭' : 'Off'}</span></label>
        : options.length ? <Select label={label} value={value} onChange={change} options={options} />
        : /prompt|instructions|notice/i.test(setting.path) && !setting.credential ? <textarea id={id} aria-label={label} rows={3} value={value} onChange={event => change(event.target.value)} />
        : <input id={id} aria-describedby={description ? `${id}-description` : undefined} type={setting.credential ? 'password' : setting.type === 'number' ? 'number' : 'text'} step="any" value={value} autoComplete={setting.credential ? 'off' : undefined} placeholder={setting.credential && setting.configured ? zh ? '已配置，输入新值替换' : 'Configured; enter a replacement' : undefined} onChange={event => change(event.target.value)} />}
      <div className="setting-field-actions"><button className="quiet-button" disabled={setting.credential && !value || recordInvalid} onClick={() => void commit()}>{busy ? zh ? '保存中…' : 'Saving…' : zh ? '保存' : 'Save'}</button><button className="quiet-button" onClick={() => void commit(true)}>{zh ? '恢复继承' : 'Reset'}</button>{structured && setting.ui?.editor !== 'json' && (form || raw) && <button className="quiet-button" aria-pressed={raw} disabled={recordInvalid || raw && !form} onClick={() => { setRecordInvalid(false); setRaw(!raw); }}>{raw ? zh ? '表单' : 'Form' : 'JSON'}</button>}{saved && <span role="status" className="settings-hint">{zh ? '已保存' : 'Saved'}</span>}</div>
    </fieldset>
    <details className="setting-key"><summary>{zh ? '配置键' : 'Setting key'}</summary><code>{setting.path}</code></details>
    {error && <p className="settings-error" role="alert">{error}</p>}
  </div>;
}

function RecordFields({ value, numeric, language, onChange, onInvalid }: { value: Json; numeric: boolean; language: Language; onChange: (value: Json) => void; onInvalid: (invalid: boolean) => void }) {
  const zh = language === 'zh';
  const snapshot = JSON.stringify(value);
  const nextId = useRef(0);
  const makeRows = () => Object.entries(value).map(([key, item]) => ({ id: nextId.current++, key, text: String(item), type: typeof item }));
  const [rows, setRows] = useState<(SettingRecordRow & { id: number })[]>(makeRows);
  const [error, setError] = useState('');
  const emitted = useRef(snapshot);
  useEffect(() => { if (snapshot !== emitted.current) { setRows(makeRows()); setError(''); onInvalid(false); } emitted.current = snapshot; }, [snapshot]);
  const update = (next: (SettingRecordRow & { id: number })[]) => {
    setRows(next);
    try {
      const result = parseSettingRecord(next, numeric);
      emitted.current = JSON.stringify(result);
      setError(''); onInvalid(false); onChange(result);
    } catch (error) { setError((error as Error).message === 'key' ? zh ? '请填写不重复的名称。' : 'Enter unique names.' : zh ? '请检查值的类型。' : 'Check the value type.'); onInvalid(true); }
  };
  return <div className="setting-record">{rows.map((row, index) => <Fragment key={row.id}><input aria-label={zh ? `名称 ${index + 1}` : `Name ${index + 1}`} value={row.key} placeholder={zh ? '名称' : 'Name'} onChange={event => update(rows.map(item => item.id === row.id ? { ...item, key: event.target.value } : item))} />{row.type === 'boolean' ? <Select label={zh ? `值 ${index + 1}` : `Value ${index + 1}`} value={row.text} onChange={text => update(rows.map(item => item.id === row.id ? { ...item, text } : item))} options={[{ value: 'true', label: zh ? '开启' : 'On' }, { value: 'false', label: zh ? '关闭' : 'Off' }]} /> : <input type={numeric || row.type === 'number' ? 'number' : 'text'} step="any" aria-label={zh ? `值 ${index + 1}` : `Value ${index + 1}`} value={row.text} placeholder={zh ? '值' : 'Value'} onChange={event => update(rows.map(item => item.id === row.id ? { ...item, text: event.target.value } : item))} />}<button className="icon-button" title={zh ? '移除' : 'Remove'} onClick={() => update(rows.filter(item => item.id !== row.id))}><X size={14} /></button></Fragment>)}<button className="quiet-button setting-record-add" onClick={() => setRows([...rows, { id: nextId.current++, key: '', text: '', type: numeric ? 'number' : 'string' }])}><Plus size={14} />{zh ? '添加一项' : 'Add entry'}</button>{error && <p className="settings-error" role="alert">{error}</p>}</div>;
}
