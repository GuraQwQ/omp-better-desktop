import assert from 'node:assert/strict';
import { readTodoPhases, sessionTodoPhases, summarizeTodos, todoHistory } from '../src/lib/session-todos';
import { applyEvent } from '../src/lib/session-state';
import type { Message, SessionView } from '../src/lib/types';

const phases = [{ name: '实现', tasks: [{ content: '完成', status: 'completed' }, { content: '正在处理\n保留原文', status: 'in_progress' }] }];
const parsed = readTodoPhases(phases)!;
assert.deepEqual(summarizeTodos(parsed), { total: 2, completed: 1, current: parsed[0].tasks[1], allClosed: false });
assert.equal(readTodoPhases([{ tasks: [{ content: '不虚构状态', status: 'unknown' }] }]), undefined);
const message: Message = { id: 'todo', role: 'toolResult', toolName: 'todo', content: '', details: { op: 'init', phases } };
const session: SessionView = { id: 'A', cwd: 'D:/fixture', status: 'ready', state: {}, messages: [message], pending: [] };
assert.deepEqual(sessionTodoPhases(session), parsed);
assert.deepEqual(sessionTodoPhases({ ...session, state: { todoPhases: [] } }), []);
const updated = applyEvent(session, { type: 'tool_execution_end', toolCallId: 'todo-live', toolName: 'todo', result: { details: { op: 'init', phases } } });
assert.deepEqual(updated.state.todoPhases, parsed);
assert.deepEqual(applyEvent(updated, { type: 'tool_execution_end', toolCallId: 'failed', toolName: 'todo', isError: true, result: { details: { phases: [] } } }).state.todoPhases, parsed);
assert.deepEqual(applyEvent(updated, { type: 'todo_auto_clear' }).state.todoPhases, []);
assert.deepEqual(todoHistory([message, { ...message, id: 'failed', isError: true }]).map(entry => [entry.id, entry.completed, entry.total]), [['todo', 1, 2]]);
console.log('任务状态还原、失败保留和历史检查通过');
