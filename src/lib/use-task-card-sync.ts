import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { native, request } from './bridge';
import { taskCardSnapshot } from './task-card';
import type { Language, SessionView } from './types';

export function useTaskCardSync(sessions: Record<string, SessionView>, enabled: boolean, language: Language, onError: (error: unknown) => void) {
  const [opened, setOpened] = useState<string[]>([]);
  const latest = useRef({ sessions, language, onError, opened }); latest.current = { sessions, language, onError, opened };
  const sent = useRef(new Map<string, string>());
  const inflight = useRef(new Map<string, object>());
  const generation = useRef(0);
  const retry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const failures = useRef(0);
  const [confirmed, setConfirmed] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!native || !enabled) { setOpened([]); return; }
    generation.current++;
    let disposed = false;
    const cleanup: (() => void)[] = [];
    const attach = async () => {
      const open = await listen<string>('desktop-card-opened', ({ payload }) => {
        if (!disposed) { sent.current.delete(payload); setOpened(values => [...new Set([...values, payload])]); }
      });
      if (disposed) { open(); return; } cleanup.push(open);
      const close = await listen<string>('desktop-card-closed', ({ payload }) => {
        if (!disposed) { sent.current.delete(payload); setOpened(values => values.filter(id => id !== payload)); }
      });
      if (disposed) { close(); return; } cleanup.push(close);
      const ids = await request<string[]>('card.list');
      if (!disposed) setOpened(values => [...new Set([...values, ...ids])]);
    };
    void attach().catch(error => { if (!disposed) latest.current.onError(error); });
    return () => { disposed = true; generation.current++; cleanup.forEach(stop => stop()); sent.current.clear(); inflight.current.clear(); if (timer.current) clearTimeout(timer.current); timer.current = undefined; if (retry.current) clearTimeout(retry.current); retry.current = undefined; };
  }, [enabled]);
  useEffect(() => {
    if (!native || !enabled || !opened.length || timer.current) return;
    // 固定窗口节流不会被持续流式更新推迟，未改变的卡片也无需再次传输。
    timer.current = setTimeout(() => {
      timer.current = undefined;
      const current = latest.current;
      for (const id of current.opened) {
        const session = current.sessions[id];
        if (!session || inflight.current.has(id)) continue;
        const value = taskCardSnapshot(session, current.language), signature = JSON.stringify(value);
        if (sent.current.get(id) === signature) continue;
        sent.current.set(id, signature);
        const token = {}, version = generation.current;
        inflight.current.set(id, token);
        void request<{ open: boolean }>('card.sync', { id, value }).then(result => {
          if (generation.current !== version) return;
          if (!result.open) { sent.current.delete(id); setOpened(values => values.filter(value => value !== id)); }
          failures.current = 0;
          setConfirmed(value => value + 1);
        }).catch(error => { if (generation.current === version) { if (sent.current.get(id) === signature) sent.current.delete(id); current.onError(error); if (!retry.current && failures.current < 3) { retry.current = setTimeout(() => { retry.current = undefined; if (generation.current === version) setConfirmed(value => value + 1); }, 500 * 2 ** failures.current++); } } }).finally(() => { if (inflight.current.get(id) === token) inflight.current.delete(id); });
      }
    }, 500);
  }, [sessions, enabled, language, opened, confirmed]);
}
