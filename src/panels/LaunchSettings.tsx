import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FolderOpen } from 'lucide-react';
import { pickPath, request } from '../lib/bridge';
import type { Json, Language } from '../lib/types';
import './managed-resources.css';

const empty = { systemPrompt: '', appendSystemPrompt: '', addDirs: [] as string[], tools: [] as string[], profile: '', config: [] as string[], sessionDir: '', noRules: false, noLsp: false, noTools: false, planYolo: false };
export default function LaunchSettings({ cwd, language, reconnect }: { cwd: string; language: Language; reconnect?: () => Promise<void> }) {
  const zh = language === 'zh';
  const [value, setValue] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const revision = useRef(0);
  useEffect(() => {
    const current = ++revision.current;
    setLoading(true); setNotice(''); setError('');
    request<Json>('launch.get', { cwd }).then(profile => { if (current === revision.current) setValue({ ...empty, ...profile }); }).catch(error => { if (current === revision.current) setError(String(error)); }).finally(() => { if (current === revision.current) setLoading(false); });
    return () => { revision.current++; };
  }, [cwd]);
  const change = (key: keyof typeof empty, next: unknown) => { setValue(old => ({ ...old, [key]: next })); setNotice(''); };
  const choose = async (key: 'addDirs' | 'config' | 'sessionDir') => {
    try {
      const path = await pickPath(key !== 'config');
      if (path) change(key, key === 'sessionDir' ? path : [...value[key].filter(v => v.trim()), path]);
    } catch (error) { setError(String(error)); }
  };
  const save = async (restart: boolean) => {
    const current = revision.current;
    setBusy(true); setError(''); setNotice('');
    try {
      const profile = Object.fromEntries(Object.entries(value).map(([key, value]) => [key, Array.isArray(value) ? value.map(v => v.trim()).filter(Boolean) : value]));
      await request('launch.set', { cwd, profile });
      if (current !== revision.current) return;
      if (restart) await reconnect?.();
      if (current === revision.current) setNotice(restart ? zh ? '已保存并重新连接。' : 'Saved and reconnected.' : zh ? '已保存，下次连接时生效。' : 'Saved. Applies on the next connection.');
    } catch (error) { if (current === revision.current) setError(String(error)); }
    finally { if (current === revision.current) setBusy(false); }
  };
  return <section className="managed-resources">
    <h2>{zh ? '项目启动配置' : 'Project launch settings'}</h2>
    <p className="settings-hint">{zh ? '仅用于当前项目，应用到新连接的会话和内嵌终端。未填写的选项沿用 OMP 默认值。' : 'Applies to new session connections and the embedded terminal for this project. Empty options use OMP defaults.'}</p><code className="managed-path">{cwd}</code>
    {error && <p className="settings-error" role="alert">{error}</p>}
    {loading ? <p role="status">{zh ? '正在读取…' : 'Loading…'}</p> : <form className="managed-form" onSubmit={event => { event.preventDefault(); void save(false); }}><fieldset disabled={busy}>
      <label className="managed-field"><span>{zh ? '追加系统提示词' : 'Append system prompt'}</span><textarea aria-label={zh ? '追加系统提示词' : 'Append system prompt'} rows={5} value={value.appendSystemPrompt} onChange={event => change('appendSystemPrompt', event.target.value)} /></label>
      <label className="managed-field"><span>{zh ? '附加工作目录，每行一个' : 'Additional directories, one per line'}</span><textarea aria-label={zh ? '附加工作目录' : 'Additional directories'} rows={3} value={value.addDirs.join('\n')} onChange={event => change('addDirs', event.target.value.split(/\r?\n/))} /><button className="quiet-button" type="button" onClick={() => void choose('addDirs')}><FolderOpen size={14} />{zh ? '选择目录' : 'Choose directory'}</button></label>
      <details className="managed-detail"><summary><ChevronDown size={14} />{zh ? '高级设置' : 'Advanced settings'}</summary>
        <label className="managed-field"><span>{zh ? '替换系统提示词' : 'Replace system prompt'}</span><textarea aria-label={zh ? '替换系统提示词' : 'Replace system prompt'} rows={5} value={value.systemPrompt} onChange={event => change('systemPrompt', event.target.value)} /></label>
        <label className="managed-field"><span>{zh ? '内置工具集合，每行一个工具名' : 'Built-in tools, one name per line'}</span><textarea aria-label={zh ? '内置工具集合' : 'Built-in tools'} rows={3} value={value.tools.join('\n')} onChange={event => change('tools', event.target.value.split(/\r?\n/))} /></label>
        <label className="managed-field"><span>{zh ? 'OMP 配置档案' : 'OMP profile'}</span><input aria-label={zh ? 'OMP 配置档案' : 'OMP profile'} value={value.profile} onChange={event => change('profile', event.target.value)} /></label>
        <label className="managed-field"><span>{zh ? '配置覆盖文件，按顺序加载' : 'Config overlay files, in load order'}</span><textarea aria-label={zh ? '配置覆盖文件' : 'Config overlay files'} rows={3} value={value.config.join('\n')} onChange={event => change('config', event.target.value.split(/\r?\n/))} /><button type="button" className="quiet-button" onClick={() => void choose('config')}><FolderOpen size={14} />{zh ? '选择文件' : 'Choose file'}</button></label>
        <label className="managed-field"><span>{zh ? '会话保存目录' : 'Session directory'}</span><input aria-label={zh ? '会话保存目录' : 'Session directory'} value={value.sessionDir} onChange={event => change('sessionDir', event.target.value)} /><button type="button" className="quiet-button" onClick={() => void choose('sessionDir')}><FolderOpen size={14} />{zh ? '选择目录' : 'Choose directory'}</button></label>
        {([['noRules', zh ? '跳过规则加载' : 'Skip rule loading'], ['noLsp', zh ? '关闭 LSP' : 'Disable LSP'], ['noTools', zh ? '关闭内置工具' : 'Disable built-in tools'], ['planYolo', zh ? '自动执行计划' : 'Run plans automatically']] as const).map(([key, label]) => <label key={key} className="managed-checkbox"><input type="checkbox" checked={value[key]} onChange={event => change(key, event.target.checked)} />{label}</label>)}
      </details>
      <div className="managed-actions"><button type="submit" className="secondary-button">{busy ? zh ? '保存中…' : 'Saving…' : zh ? '保存' : 'Save'}</button>{reconnect && <button className="quiet-button" type="button" onClick={() => void save(true)}>{zh ? '保存并重新连接' : 'Save and reconnect'}</button>}<button className="quiet-button" type="button" onClick={() => { setValue(empty); setNotice(''); }}>{zh ? '恢复默认' : 'Restore defaults'}</button></div>
    </fieldset></form>}
    {notice && <p role="status" className="settings-hint">{notice}</p>}
  </section>;
}
