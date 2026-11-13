import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { Check, ChevronDown, Circle, CircleDot, ListTodo, Minus } from 'lucide-react';
import type { TodoStatus } from '../generated/rpc-wire';
import { sessionKey } from '../lib/session-identity';
import { sessionTodoPhases, summarizeTodos } from '../lib/session-todos';
import type { Language, SessionView } from '../lib/types';
import './session-todos.css';
import Collapse from './Collapse';

const statusIcons = { pending: Circle, in_progress: CircleDot, completed: Check, abandoned: Minus };
const statusLabels: Record<TodoStatus, [string, string]> = {
  pending: ['待处理', 'Pending'], in_progress: ['进行中', 'In progress'], completed: ['已完成', 'Completed'], abandoned: ['已放弃', 'Abandoned'],
};

export default function SessionTodos({ session, language }: { session?: SessionView; language: Language }) {
  const phases = sessionTodoPhases(session);
  const summary = summarizeTodos(phases);
  return session ? <TodoList key={sessionKey(session)} phases={phases} summary={summary} language={language} /> : null;
}

function TodoList({ phases, summary, language }: { phases: ReturnType<typeof sessionTodoPhases>; summary: ReturnType<typeof summarizeTodos>; language: Language }) {
  const [expanded, setExpanded] = useState(false);
  const [position, setPosition] = useState({ x: 8, y: 16 });
  const [dragging, setDragging] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<{ pointer: number; clientX: number; clientY: number; origin: typeof position } | null>(null);
  const moved = useRef(false);
  const id = useId();
  const zh = language === 'zh';
  const { total, completed, current, allClosed } = summary;
  const clamp = (point: typeof position) => {
    const element = panel.current;
    const parent = element?.parentElement;
    if (!element || !parent) return point;
    return { x: Math.max(8, Math.min(point.x, parent.clientWidth - element.offsetWidth - 8)), y: Math.max(8, Math.min(point.y, parent.clientHeight - element.offsetHeight - 8)) };
  };
  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setPosition(point => { const next = clamp(point); return point.x === next.x && point.y === next.y ? point : next; }));
    observer.observe(element); observer.observe(element.parentElement!);
    return () => observer.disconnect();
  }, [!!total && !allClosed]);
  const finish = (cancel: boolean) => {
    const current = drag.current;
    if (!current) return;
    drag.current = null; setDragging(false);
    if (cancel) { setPosition(clamp(current.origin)); moved.current = true; }
    const button = panel.current?.querySelector('button');
    if (button?.hasPointerCapture(current.pointer)) button.releasePointerCapture(current.pointer);
  };
  useEffect(() => {
    if (!dragging) return;
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(true); } };
    const blur = () => finish(true);
    window.addEventListener('keydown', keydown, true); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', keydown, true); window.removeEventListener('blur', blur); };
  }, [dragging]);
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    const dx = event.clientX - current.clientX, dy = event.clientY - current.clientY;
    if (!moved.current && Math.hypot(dx, dy) < 4) return;
    moved.current = true;
    setPosition(clamp({ x: current.origin.x + dx, y: current.origin.y + dy }));
  };
  if (!total || allClosed) return null;
  const title = current?.content ?? (zh ? '任务清单' : 'Tasks');
  const progress = zh ? `${completed} / ${total} 已完成` : `${completed} / ${total} completed`;
  return <section ref={panel} style={{ left: position.x, top: position.y }} className={`session-todos${expanded ? ' is-expanded' : ' is-collapsed'}${dragging ? ' is-dragging' : ''}`} aria-label={zh ? '任务清单' : 'Tasks'}>
    <button type="button" className="session-todos-summary" aria-label={`${expanded ? zh ? '收起任务清单' : 'Collapse tasks' : zh ? '展开任务清单' : 'Expand tasks'} ${progress}`} aria-expanded={expanded} aria-controls={id} onClick={() => { if (moved.current) { moved.current = false; return; } setExpanded(value => !value); }} title={`${title}\n${progress}\n${zh ? '拖动移动，Alt + 方向键微调' : 'Drag to move, Alt + arrow keys to adjust'}`}
      onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); moved.current = false; drag.current = { pointer: event.pointerId, clientX: event.clientX, clientY: event.clientY, origin: position }; event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); }}
      onPointerMove={move} onPointerUp={() => finish(false)} onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish(true)}
      onKeyDown={event => { if (!event.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return; event.preventDefault(); setPosition(point => clamp({ x: point.x + (event.key === 'ArrowLeft' ? -16 : event.key === 'ArrowRight' ? 16 : 0), y: point.y + (event.key === 'ArrowUp' ? -16 : event.key === 'ArrowDown' ? 16 : 0) })); }}>
      <ListTodo size={16} aria-hidden="true" />{expanded && <><span className="session-todos-heading">{zh ? '任务清单' : 'Tasks'}</span><span className="session-todos-count" aria-label={progress}>{completed}/{total}</span><ChevronDown size={12} className="is-expanded" aria-hidden="true" /></>}
    </button>
    <Collapse open={expanded} id={id}><div className="session-todos-list">
      {phases.map((phase, phaseIndex) => <section className="session-todo-phase" key={phaseIndex}>
        {phases.length > 1 && phase.name && <h3>{phase.name}</h3>}
        <ul>{phase.tasks.map((task, index) => {
          const Icon = statusIcons[task.status];
          const status = statusLabels[task.status][zh ? 0 : 1];
          return <li className={`session-todo-task is-${task.status}`} key={index}>
            <span className="session-todo-status" role="img" aria-label={status} title={status}><Icon size={12} aria-hidden="true" /></span><div><span className="session-todo-content">{task.content}</span>{task.details && <small>{task.details}</small>}{task.notes?.map((note, noteIndex) => <small key={noteIndex}>{note}</small>)}</div>
          </li>;
        })}</ul>
      </section>)}
    </div></Collapse>
  </section>;
}
