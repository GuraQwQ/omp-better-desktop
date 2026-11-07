import { useEffect, useRef } from 'react';
import { native, onDesktopEvent, request, rpc } from './bridge';
import type { Json, SessionView } from './types';
let recovery: Promise<unknown> | undefined;
export function useDesktopSchedules({ enabled, onSession, onError }: { enabled: boolean; onSession: (session: SessionView) => void; onError: (error: unknown) => void }) {
  const latest = useRef({ enabled, onSession, onError }); latest.current = { enabled, onSession, onError };
  const running = useRef(new Map<string, string>());
  const finishes = useRef(new Map<string, { id: string; status: string; error?: string }>());
  useEffect(() => {
    if (!native) return;
    let disposed = false; let polling = false; let stop: (() => void) | undefined;
    const flushFinishes = async () => { for (const [runId, value] of finishes.current) { await request('schedule.finish', { runId, status: value.status, error: value.error }); finishes.current.delete(runId); running.current.delete(value.id); } };
    const settle = (id: string, status: string, error?: string) => { const runId = running.current.get(id); if (!runId) return; finishes.current.set(runId, { id, status, error }); void flushFinishes().catch(latest.current.onError); };
    const poll = async () => {
      if (disposed || polling || !latest.current.enabled) return; polling = true;
      try {
        await (recovery ??= request('schedule.recover').catch(error => { recovery = undefined; throw error; }));
        await flushFinishes();
        if (disposed) return;
        const claims = await request<Json[]>('schedule.claim');
        for (const claim of claims) {
          if (disposed) { await request('schedule.finish', { runId: claim.runId, status: 'interrupted' }); continue; }
          let id: string | undefined;
          try {
            const opened = await request<Json>('session.open', { cwd: claim.job.cwd }); id = opened.id;
            running.current.set(opened.id, claim.runId);
            latest.current.onSession({ id: opened.id, cwd: claim.job.cwd, path: opened.path, title: claim.job.name, messages: [], state: opened.state ?? {}, status: 'ready', pending: [] });
            await request('schedule.started', { runId: claim.runId, sessionId: opened.id, path: opened.path });
            await rpc(opened.id, 'set_session_name', { name: claim.job.name });
            await rpc(opened.id, 'prompt', { message: claim.job.prompt });
          } catch (error) { if (id) running.current.delete(id); await request('schedule.finish', { runId: claim.runId, status: 'error', error: String(error) }); latest.current.onError(error); }
        }
      } catch (error) { latest.current.onError(error); } finally { polling = false; }
    };
    void onDesktopEvent(({ sessionId, event }) => { if (event.type === 'session_settled') settle(sessionId, 'completed'); if (event.type === 'session_closed') settle(sessionId, 'interrupted'); }).then(unlisten => { if (disposed) unlisten(); else { stop = unlisten; void poll(); } });
    const timer = setInterval(() => void poll(), 30_000);
    return () => { disposed = true; clearInterval(timer); stop?.(); };
  }, []);
}
