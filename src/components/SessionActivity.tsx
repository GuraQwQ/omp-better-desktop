import { rpc } from '../lib/bridge';
import type { Copy } from '../lib/i18n';
import type { Json, SessionView } from '../lib/types';

export default function SessionActivity({ session, t, refresh, onError }: { session: SessionView; t: Copy; refresh: () => Promise<void>; onError: (error: unknown) => void }) {
  const action = async (type: string, fields: Json = {}) => {
    try { await rpc(session.id, type, fields); await refresh(); } catch (error) { onError(error); }
  };
  const goal = session.state.goal?.goal;
  const live = session.state.live;
  const records: Json[] = session.state.btwRecords ?? [];
  return <div className="queued-messages">
    {goal && <details><summary>{t.goal}: {goal.objective}</summary><p>{goal.status}</p><button className="quiet-button" onClick={() => action('goal', { op: goal.status === 'active' ? 'pause' : 'resume' })}>{goal.status === 'active' ? t.pause : t.resume}</button><button className="quiet-button" onClick={() => action('goal', { op: 'drop' })}>{t.remove}</button></details>}
    {live?.active && <div><span>{t.live}: {live.phase}</span><button className="quiet-button" onClick={() => action('live_mute')}>{t.mute}</button><button className="quiet-button" onClick={() => action('live_stop')}>{t.stop}</button>{live.transcript && <p>{live.transcript}</p>}</div>}
    {live?.error && <p role="alert">{live.error}</p>}
    {records.length > 0 && <details><summary>{t.sideQuestions} ({records.length})</summary>{records.map(record => <details key={record.id}><summary>{record.question}</summary>{[record, ...(record.followUps ?? [])].map((turn, i) => <div key={i}><strong>{turn.question}</strong><pre>{turn.answer || (turn.status === 'running' ? t.loading : t.done)}</pre>{turn.error && <p role="alert">{turn.error}</p>}</div>)}{(record.followUps?.at(-1) ?? record).status === 'running' && <button className="quiet-button" onClick={() => action('btw_cancel', { recordId: record.id })}>{t.stop}</button>}</details>)}</details>}
  </div>;
}
