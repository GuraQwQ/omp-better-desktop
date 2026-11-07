import { useEffect, useRef, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { request } from '../../lib/bridge';
import type { Json, SessionSummary } from '../../lib/types';

export default function Schedules({ cwd, onOpen, onError }: { cwd: string; onOpen: (summary: SessionSummary, messageId?: string) => void; onError: (error: unknown) => void }) {
  const [data, setData] = useState<Json>({ jobs: [], runs: [] });
  const [editing, setEditing] = useState<Json | null>(null);
  const [working, setWorking] = useState(false);
  const generation = useRef(0);
  const listRevision = useRef(0);
  const operation = useRef(false);
  const errorHandler = useRef(onError); errorHandler.current = onError;
  const reload = async () => {
    const scope = generation.current;
    const revision = ++listRevision.current;
    const value = await request<Json>('schedule.list');
    if (scope === generation.current && revision === listRevision.current) setData(value);
  };
  useEffect(() => {
    const scope = ++generation.current;
    setData({ jobs: [], runs: [] }); setEditing(null); setWorking(false); operation.current = false;
    const poll = () => { if (!operation.current) void reload().catch(error => { if (scope === generation.current) errorHandler.current(error); }); };
    poll(); const timer = setInterval(poll, 5000);
    return () => { generation.current++; listRevision.current++; clearInterval(timer); };
  }, [cwd]);
  const perform = async (type: string, fields: Json): Promise<boolean> => {
    if (operation.current) return false;
    const scope = generation.current;
    operation.current = true; listRevision.current++; setWorking(true);
    try {
      // 表单中的零间隔表示一次性任务，持久化协议用 null 表达。
      const payload = type === 'schedule.save' ? { ...fields, job: { ...fields.job, intervalMinutes: fields.job.intervalMinutes === 0 ? null : fields.job.intervalMinutes } } : fields;
      await request(type, payload);
      if (scope !== generation.current) return false;
      try { await reload(); } catch (error) { if (scope === generation.current) errorHandler.current(error); }
      return scope === generation.current;
    } catch (error) { if (scope === generation.current) errorHandler.current(error); return false; }
    finally { if (scope === generation.current) { operation.current = false; setWorking(false); } }
  };
  return <>
    <p>应用运行期间执行，到期后创建独立会话。关闭期间错过的重复计划，重开后补一次；中断运行保留记录，可手动重试。</p>
    <div className="desktop-tool-actions"><button className="quiet-button" disabled={working} onClick={() => setEditing({ name: '', cwd, prompt: '', nextAt: Date.now() + 60_000, intervalMinutes: 0, enabled: true })}><Plus size={14} />新建计划</button><button className="quiet-button" disabled={working} onClick={() => { const scope = generation.current; void reload().catch(error => { if (scope === generation.current) errorHandler.current(error); }); }}><RefreshCw size={14} />刷新</button></div>
    {editing && <form className="desktop-form" onSubmit={event => { event.preventDefault(); void perform('schedule.save', { job: editing }).then(saved => { if (saved) setEditing(null); }); }}>
      <label className="desktop-field">名称<input required disabled={working} value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} /></label>
      <label className="desktop-field">项目目录<input required disabled={working} value={editing.cwd} onChange={event => setEditing({ ...editing, cwd: event.target.value })} /></label>
      <label className="desktop-field">任务<textarea required rows={4} disabled={working} value={editing.prompt} onChange={event => setEditing({ ...editing, prompt: event.target.value })} /></label>
      <label className="desktop-field">执行时间<input required disabled={working} type="datetime-local" value={new Date(editing.nextAt - new Date(editing.nextAt).getTimezoneOffset() * 60_000).toISOString().slice(0, 16)} onChange={event => { const nextAt = new Date(event.target.value).getTime(); if (Number.isFinite(nextAt)) setEditing({ ...editing, nextAt }); }} /></label>
      <label className="desktop-field">重复间隔（分钟，0 为一次）<input min={0} step={1} disabled={working} type="number" value={editing.intervalMinutes ?? 0} onChange={event => setEditing({ ...editing, intervalMinutes: Number(event.target.value) })} /></label>
      <div className="desktop-tool-actions"><button className="primary-button" disabled={working}>保存</button><button type="button" className="quiet-button" disabled={working} onClick={() => setEditing(null)}>取消</button></div>
    </form>}
    {data.jobs.map((job: Json) => <article className="desktop-record" key={job.id}><h3>{job.name}</h3><code>{job.cwd}</code><p>{job.prompt}</p><small>{new Date(job.nextAt).toLocaleString()}{job.intervalMinutes ? ` · 每 ${job.intervalMinutes} 分钟` : ''}</small><div className="desktop-tool-actions"><label><input type="checkbox" checked={job.enabled} disabled={working} onChange={event => void perform('schedule.save', { job: { ...job, enabled: event.target.checked } })} />启用</label><button className="quiet-button" disabled={working} onClick={() => setEditing(job)}>编辑</button><button className="quiet-button" disabled={working} onClick={() => void perform('schedule.remove', { id: job.id })}>删除计划</button></div></article>)}
    <h3>运行记录</h3>
    {data.runs.map((run: Json) => <article className="desktop-record" key={run.runId}><strong>{run.job?.name ?? '定时任务'}</strong><small>{run.status} · {new Date(run.startedAt ?? run.claimedAt).toLocaleString()}</small>{run.error && <p>{run.error}</p>}<div className="desktop-tool-actions">{run.path && run.job?.cwd && <button className="quiet-button" onClick={() => onOpen({ id: run.sessionId || run.runId, path: run.path, cwd: run.job.cwd, title: run.job.name })}>打开会话</button>}{['error', 'interrupted'].includes(run.status) && <button className="quiet-button" disabled={working} onClick={() => void perform('schedule.retry', { runId: run.runId })}>重试</button>}</div></article>)}
  </>;
}
