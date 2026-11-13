import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { request } from '../lib/bridge';
import type { Json } from '../lib/types';
import { copy, localizeError, statusText } from '../lib/i18n';
import { taskCardSummary } from '../lib/task-card';
import './desktop-tools.css';

export default function TaskCard({ id }: { id: string }) {
  const [card, setCard] = useState<Json | null>(null);
  const [error, setError] = useState('');
  const language = card?.language === 'en' ? 'en' : 'zh';
  const t = copy(language);
  useEffect(() => {
    let disposed = false, revision = 0;
    let stop: (() => void) | undefined;
    const read = () => {
      if (document.hidden) return;
      const current = ++revision;
      void request<Json>('card.get', { id }).then(value => { if (!disposed && current === revision && !document.hidden) { setCard(value); setError(''); } }).catch(error => { if (!disposed && current === revision) setError(String(error)); });
    };
    void listen<Json>('desktop-card-change', ({ payload }) => { if (!disposed && !document.hidden) { revision++; setCard(payload); setError(''); } }).then(unlisten => { if (disposed) unlisten(); else { stop = unlisten; read(); } }).catch(error => { if (!disposed) { setError(String(error)); read(); } });
    document.addEventListener('visibilitychange', read);
    window.addEventListener('focus', read);
    return () => { disposed = true; revision++; stop?.(); document.removeEventListener('visibilitychange', read); window.removeEventListener('focus', read); };
  }, [id]);
  const status = card?.status === 'ready' ? t.ready : card?.status === 'background' ? t.running : statusText(card?.status ?? 'connecting', t);
  return <main className="task-card"><small>OMP · {status}</small><h1>{card?.title ?? (language === 'zh' ? '等待会话信息' : 'Waiting for chat')}</h1><p>{taskCardSummary(card?.summary ?? '') || card?.cwd}</p>{card && card.pending > 0 && <strong>{card.pending} {language === 'zh' ? '个问题待处理' : 'questions need attention'}</strong>}{error && <p role="alert">{localizeError(error, language)}</p>}<button className="primary-button" disabled={!card?.sessionId} onClick={() => void request('card.focus', { id, sessionId: card?.sessionId }).catch(error => setError(String(error)))}>{language === 'zh' ? '返回会话' : 'Return to chat'}</button></main>;
}
