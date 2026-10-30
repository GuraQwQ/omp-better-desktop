import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { request } from '../lib/bridge';
import { localizeError } from '../lib/i18n';
import type { Json, Language, SessionView } from '../lib/types';
import { Fold, Original } from './ContextDetails';
import './request-captures.css';

interface CaptureRecord { id: string; createdAt: number; method: string; url: string; bytes: number }
const words = (language: Language) => language === 'zh' ? {
  refresh: '刷新请求记录', empty: '暂无捕获记录。开启捕获后，下次模型请求才会产生记录。', loading: '正在读取请求…',
  hint: '记录为 OMP 实际发出的请求，包含发送前的提示词注入与工具定义；不会显示网关或模型服务端随后追加的内容。',
} : {
  refresh: 'Refresh captured requests', empty: 'No captured requests. Records appear on the next model request after capture is enabled.', loading: 'Reading requests…',
  hint: 'Records contain requests actually sent by OMP, including prompt injections and tool definitions added before dispatch. Later changes by a gateway or model server are not visible.',
};

function CaptureBody({ id, language }: { id: string; language: Language }) {
  const [value, setValue] = useState<Json | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    void request<Json>('requests.read', { id }).then(value => { if (!cancelled) setValue(value); }).catch(error => { if (!cancelled) setError(String(error)); });
    return () => { cancelled = true; };
  }, [id]);
  return error ? <p role="alert">{localizeError(error, language)}</p> : value ? <>{value.bodyUnavailable && <p role="status">{language === 'zh' ? '此记录无法取得请求正文：' : 'Request body unavailable: '}{value.bodyUnavailable}</p>}<Original value={value} language={language} /></> : <p role="status">{words(language).loading}</p>;
}

export default function RequestCaptures({ language, session, revision = 0, onRefresh }: { language: Language; session?: Pick<SessionView, 'id' | 'path'>; revision?: number; onRefresh?: () => void }) {
  const text = words(language);
  const [refresh, setRefresh] = useState(0);
  const [records, setRecords] = useState<CaptureRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(''); setRecords([]);
    void request<CaptureRecord[]>('requests.list', session ? { sessionId: session.id, path: session.path } : {})
      .then(records => { if (!cancelled) setRecords(records); }).catch(error => { if (!cancelled) setError(String(error)); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session?.id, session?.path, revision, refresh]);
  return <div className="request-captures"><p className="context-section-hint">{text.hint}</p><div className="request-capture-toolbar"><button className="quiet-button" disabled={loading} onClick={() => onRefresh ? onRefresh() : setRefresh(value => value + 1)}><RefreshCw size={13} />{text.refresh}</button></div>
    {error ? <p role="alert">{localizeError(error, language)}</p> : loading ? <p role="status">{text.loading}</p> : records.length ? records.map(record => <Fold key={`${record.id}:${refresh}:${revision}`} title={`${record.method} ${record.url}`} meta={new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(record.createdAt))}><CaptureBody id={record.id} language={language} /></Fold>) : <p>{text.empty}</p>}
  </div>;
}
