import { useEffect, useState } from 'react';
import { request } from '../lib/bridge';
import { localizeError } from '../lib/i18n';
import type { Language } from '../lib/types';
import RequestCaptures from '../components/RequestCaptures';
import './advanced-settings.css';

interface CaptureStatus { enabled: boolean; supported: boolean; directory: string; count: number; bytes: number; maxBytes: number }
export default function AdvancedSettings({ language }: { language: Language }) {
  const text = language === 'zh' ? {
    title: '进阶', capture: '捕获实际请求', description: '保存 OMP 发给模型的输入，便于检查系统提示词、扩展注入和工具参数。开关在下一次请求时生效。',
    local: '记录仅保存在本机，包含消息正文与附件。认证头会脱敏；正文中自行填写的敏感内容会原样保留。',
    unsupported: '当前运行时尚未支持请求捕获，请安装包含此功能的运行时包。',
    location: '记录目录', usage: '已保存', count: '条', limit: '容量上限', clear: '清空请求记录', records: '请求记录', loading: '正在读取…', retry: '重试',
  } : {
    title: 'Advanced', capture: 'Capture actual requests', description: 'Save the input OMP sends to models to inspect system prompts, extension injections and tool parameters. Changes apply to the next request.',
    local: 'Records stay on this computer and include message bodies and attachments. Authentication headers are redacted; sensitive text you put in the body is preserved.',
    unsupported: 'This runtime does not support request capture. Install a runtime package that includes this feature.',
    location: 'Record folder', usage: 'Saved', count: 'records', limit: 'Storage limit', clear: 'Clear captured requests', records: 'Captured requests', loading: 'Reading…', retry: 'Retry',
  };
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError('');
    void request<CaptureStatus>('requests.status').then(value => { if (!cancelled) setStatus(value); }).catch(error => { if (!cancelled) setError(String(error)); });
    return () => { cancelled = true; };
  }, [revision]);
  const act = async (type: string, fields = {}) => {
    setWorking(true); setError('');
    try { setStatus(await request<CaptureStatus>(type, fields)); setRevision(value => value + 1); } catch (error) { setError(String(error)); } finally { setWorking(false); }
  };
  const mb = (bytes: number) => new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en-US', { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024);
  return <div className="advanced-settings"><h2>{text.title}</h2>
    {error && <div role="alert"><p>{localizeError(error, language)}</p><button className="quiet-button" disabled={working} onClick={() => setRevision(value => value + 1)}>{text.retry}</button></div>}
    {!status && !error ? <p role="status">{text.loading}</p> : status && <>
      <div className="setting-row"><div><strong id="request-capture-label">{text.capture}</strong><small>{text.description}</small></div><input className="capture-switch" type="checkbox" role="switch" aria-labelledby="request-capture-label" checked={status.enabled} disabled={working || !status.supported} onChange={event => void act('requests.configure', { enabled: event.target.checked })} /></div>
      <p className="advanced-note">{text.local}</p>{!status.supported && <p className="advanced-note">{text.unsupported}</p>}
      <div className="settings-note"><strong>{text.location}</strong><code>{status.directory}</code><p>{text.usage} {status.count} {text.count} · {mb(status.bytes)} MiB / {text.limit} {mb(status.maxBytes)} MiB</p></div>
      <div className="settings-actions"><button className="quiet-button" disabled={working} onClick={() => void act('requests.clear')}>{text.clear}</button></div>
      <h3>{text.records}</h3><RequestCaptures language={language} revision={revision} onRefresh={() => setRevision(value => value + 1)} />
    </>}
  </div>;
}
