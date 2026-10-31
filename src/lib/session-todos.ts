import type { TodoItem, TodoPhase, TodoStatus } from '../generated/rpc-wire';
import type { Message, SessionView } from './types';

const statuses = new Set<TodoStatus>(['pending', 'in_progress', 'completed', 'abandoned', 'blocked']);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export function readTodoPhases(value: unknown): TodoPhase[] | undefined {
  if (!Array.isArray(value) || !value.every(phase => record(phase) && typeof phase.name === 'string' && Array.isArray(phase.tasks) && phase.tasks.every(task => record(task) && typeof task.content === 'string' && statuses.has(task.status as TodoStatus)))) return;
  return value.map(phase => ({ name: phase.name, tasks: phase.tasks.filter((task: TodoItem) => task.content.trim()).map((task: TodoItem) => ({ ...task })) })).filter(phase => phase.tasks.length);
}

export function todoPhasesFromMessage(message: Message): TodoPhase[] | undefined {
  if (message.toolName !== 'todo' || !['toolResult', 'tool'].includes(message.role) || message.isError || message.running) return;
  const result = message.result ?? message.partialResult;
  if (result?.isError) return;
  const details = result?.details ?? message.details;
  if (!record(details) || details.op === 'view') return;
  return readTodoPhases(details.phases);
}

export function sessionTodoPhases(session?: SessionView): TodoPhase[] {
  if (!session) return [];
  const current = readTodoPhases(session.state.todoPhases);
  if (current) return current;
  for (let index = session.messages.length - 1; index >= 0; index--) {
    const phases = todoPhasesFromMessage(session.messages[index]);
    if (phases) return phases;
  }
  return [];
}

export function todoHistory(messages: Message[]) {
  return messages.flatMap(message => {
    const phases = todoPhasesFromMessage(message);
    if (!phases) return [];
    const details = message.result?.details ?? message.details;
    return [{ id: message.id, timestamp: message.timestamp, operation: details?.op, phases, ...summarizeTodos(phases) }];
  });
}

export function summarizeTodos(phases: TodoPhase[]) {
  const tasks = phases.flatMap(phase => phase.tasks);
  return {
    total: tasks.length,
    completed: tasks.filter(task => task.status === 'completed').length,
    current: tasks.find(task => task.status === 'in_progress') ?? tasks.find(task => task.status === 'pending') ?? tasks.find(task => task.status === 'blocked'),
    allClosed: tasks.length > 0 && tasks.every(task => task.status === 'completed' || task.status === 'abandoned'),
  };
}
