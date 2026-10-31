import { useId, useState } from 'react';
import { Check, ChevronDown, Circle, CircleAlert, CircleDot, Minus } from 'lucide-react';
import type { TodoStatus } from '../generated/rpc-wire';
import { sessionKey } from '../lib/session-identity';
import { sessionTodoPhases, summarizeTodos } from '../lib/session-todos';
import type { Language, SessionView } from '../lib/types';
import './session-todos.css';

const statusIcons = { pending: Circle, in_progress: CircleDot, completed: Check, abandoned: Minus, blocked: CircleAlert };
const statusLabels: Record<TodoStatus, [string, string]> = {
  pending: ['待处理', 'Pending'], in_progress: ['进行中', 'In progress'], completed: ['已完成', 'Completed'], abandoned: ['已放弃', 'Abandoned'], blocked: ['受阻', 'Blocked'],
};

export default function SessionTodos({ session, language }: { session?: SessionView; language: Language }) {
  const phases = sessionTodoPhases(session);
  const summary = summarizeTodos(phases);
  return session ? <TodoList key={sessionKey(session)} phases={phases} summary={summary} language={language} /> : null;
}

function TodoList({ phases, summary, language }: { phases: ReturnType<typeof sessionTodoPhases>; summary: ReturnType<typeof summarizeTodos>; language: Language }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const zh = language === 'zh';
  const { total, completed, current, allClosed } = summary;
  if (!total || allClosed) return null;
  const title = current?.content ?? (zh ? '任务清单' : 'Tasks');
  const progress = zh ? `${completed} / ${total} 已完成` : `${completed} / ${total} completed`;
  return <section className="session-todos" aria-label={zh ? '任务清单' : 'Tasks'}>
    <button type="button" className="session-todos-summary" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)} title={title}>
      <span className="session-todos-heading">Todo</span><span className="session-todos-count" aria-label={progress}>{completed}/{total}</span><ChevronDown size={12} className={expanded ? 'is-expanded' : ''} aria-hidden="true" />
    </button>
    <div id={id} className="session-todos-list" hidden={!expanded}>
      {phases.map((phase, phaseIndex) => <section className="session-todo-phase" key={phaseIndex}>
        {phases.length > 1 && phase.name && <h3>{phase.name}</h3>}
        <ul>{phase.tasks.map((task, index) => {
          const Icon = statusIcons[task.status];
          const status = statusLabels[task.status][zh ? 0 : 1];
          return <li className={`session-todo-task is-${task.status}`} key={index}>
            <span className="session-todo-status" role="img" aria-label={status} title={status}><Icon size={12} aria-hidden="true" /></span><div><span className="session-todo-content">{task.content}</span>{task.status === 'blocked' && task.blocker && <small>{task.blocker}</small>}{task.details && <small>{task.details}</small>}{task.notes?.map((note, noteIndex) => <small key={noteIndex}>{note}</small>)}</div>
          </li>;
        })}</ul>
      </section>)}
    </div>
  </section>;
}
