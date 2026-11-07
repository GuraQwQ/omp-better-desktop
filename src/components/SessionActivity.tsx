import { rpc } from '../lib/bridge';
import type { Copy } from '../lib/i18n';
import { statusText } from '../lib/i18n';
import type { Json, SessionView } from '../lib/types';
import type { SideQuestionThreadSummary } from '../lib/side-questions';
import SideQuestionMarkers from './SideQuestionMarkers';

export default function SessionActivity({ session, t, threads, onSideQuestion, refresh, onError }: { session: SessionView; t: Copy; threads: SideQuestionThreadSummary[]; onSideQuestion: (id: string) => void; refresh: () => Promise<void>; onError: (error: unknown) => void }) {
  const action = async (type: string, fields: Json = {}) => {
    try { await rpc(session.id, type, fields); await refresh(); } catch (error) { onError(error); }
  };
  const goal = !session.historyOnly && session.state.goal?.goal;
  const live = !session.historyOnly ? session.state.live : undefined;
  return <div className="queued-messages">
    {goal && <details><summary>{t.goal}: {goal.objective}</summary><p>{statusText(goal.status, t)}</p><button className="quiet-button" onClick={() => action('goal', { op: goal.status === 'active' ? 'pause' : 'resume' })}>{goal.status === 'active' ? t.pause : t.resume}</button><button className="quiet-button" onClick={() => action('goal', { op: 'drop' })}>{t.remove}</button></details>}
    {live?.active && <div><span>{t.live}: {statusText(live.phase, t)}</span><button className="quiet-button" onClick={() => action('live_mute')}>{t.mute}</button><button className="quiet-button" onClick={() => action('live_stop')}>{t.stop}</button>{live.transcript && <p>{live.transcript}</p>}</div>}
    {live?.error && <p role="alert">{live.error}</p>}
    <SideQuestionMarkers threads={threads.filter(thread => thread.source.kind !== 'selection')} onOpen={onSideQuestion} />
  </div>;
}
