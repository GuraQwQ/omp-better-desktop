import assert from 'node:assert/strict';
import { applyEvents, normalizeHistoryMessages } from '../src/lib/session-state';
import { projectTranscript } from '../src/lib/transcript-items';
import type { Message, SessionView } from '../src/lib/types';
import { createToolCallReference } from '../src/lib/references';

const messages: Message[] = [
  { id: 'user', role: 'user', content: '<system>用户粘贴的原文</system>' },
  { id: 'reminder', role: 'custom', display: false, content: '<system-reminder>内部提醒</system-reminder>' },
  { id: 'hook', role: 'hookMessage', display: false, content: '内部扩展消息' },
  { id: 'notice', role: 'custom', display: true, content: '可见通知' },
  { id: 'assistant', role: 'assistant', content: '<system>模型原文</system>' },
  { id: 'dot', role: 'assistant', content: '.' },
];
const session: SessionView = { id: 'session', cwd: '/project', title: '显示语义', messages: [], pending: [], state: {}, status: 'ready' };
const live = applyEvents(session, messages.flatMap(message => ['message_start', 'message_update', 'message_end'].map(type => ({ type, messageId: message.id, message }))));
const history = normalizeHistoryMessages(messages.map(message => ({ id: message.id, message })), 'history');
for (const source of [live.messages, history]) {
  const before = JSON.stringify(source);
  const projected = projectTranscript(source);
  assert.deepEqual(projected.map(item => item.id), ['message:user', 'message:notice', 'message:assistant', 'message:dot']);
  assert.equal(JSON.stringify(source), before);
  assert.equal(source.length, 6);
}
console.log('消息实时与历史展示遵守上游标记，并保留用户、助手及原始上下文');

const update = (assistantMessageEvent: object) => ({ type: 'message_update', messageId: 'stream', message: { role: 'assistant' }, assistantMessageEvent });
const transient = applyEvents(session, [
  { type: 'message_start', messageId: 'stream', message: { role: 'assistant', content: [{ type: 'text', text: '.' }] } },
  update({ type: 'text_start', contentIndex: 0, block: { type: 'text', text: '' } }),
]);
assert.deepEqual(transient.messages[0].content, [{ type: 'text', text: '' }]);
const started = applyEvents(session, [
  { type: 'message_start', messageId: 'stream', message: { role: 'assistant', content: [] } },
  update({ type: 'start', message: { role: 'assistant', content: [], model: 'test' } }),
  update({ type: 'text_start', contentIndex: 0, block: { type: 'text', text: '' } }),
  update({ type: 'text_delta', contentIndex: 0, delta: '暂存' }),
  update({ type: 'text_start', contentIndex: 0, block: { type: 'text', text: '' } }),
  update({ type: 'text_delta', contentIndex: 0, delta: '正文' }),
  update({ type: 'text_end', contentIndex: 0, content: '正文', block: { type: 'text', textSignature: 'signature' } }),
  update({ type: 'thinking_start', contentIndex: 1, block: { type: 'thinking' } }),
  update({ type: 'thinking_delta', contentIndex: 1, delta: '思考' }),
  update({ type: 'thinking_end', contentIndex: 1, content: '思考', block: { thinkingSignature: 'signature' } }),
  update({ type: 'toolcall_start', contentIndex: 2, block: { type: 'toolCall', id: 'call', name: 'read', arguments: {} } }),
  update({ type: 'toolcall_delta', contentIndex: 2, delta: '{"path":' }),
]);
const blocks = started.messages[0].content;
assert(Array.isArray(blocks));
assert.equal(started.messages.length, 1);
assert.equal(blocks[0].text, '正文');
assert.equal(blocks[1].thinking, '思考');
assert.equal(createToolCallReference({}, started.messages[0], blocks[2]).content, '{"path":');
const completed = applyEvents(started, [
  update({ type: 'toolcall_delta', contentIndex: 2, delta: '"中文.ts"}' }),
  update({ type: 'toolcall_end', contentIndex: 2, toolCall: { type: 'toolCall', id: 'call', name: 'read', arguments: { path: '中文.ts' } } }),
  update({ type: 'image_end', contentIndex: 3, content: { type: 'image', mimeType: 'image/png', data: 'test-image' } }),
]);
assert.equal(blocks[2].argumentsText, '{"path":');
assert(Array.isArray(completed.messages[0].content));
assert.equal(completed.messages[0].content[2].argumentsText, undefined);
assert.deepEqual(completed.messages[0].content[2], { type: 'toolCall', id: 'call', name: 'read', arguments: { path: '中文.ts' } });
assert.equal(completed.messages[0].content[3].data, 'test-image');
const final = { ...completed.messages[0], stopReason: 'toolUse', usage: { totalTokens: 123 } };
const done = applyEvents(completed, [update({ type: 'done', message: final })]);
assert.deepEqual(done.messages, [final]);
const ended = applyEvents(done, [{ type: 'message_end', messageId: 'stream', message: final }]);
assert.deepEqual(ended.messages, [final]);
const snapshotUpdate = applyEvents(session, [{ type: 'message_update', messageId: 'stream', message: final, assistantMessageEvent: { type: 'toolcall_delta', contentIndex: 2, delta: '"中文.ts"}', partial: final } }]);
assert.deepEqual(snapshotUpdate.messages, [final]);
const failed = applyEvents(started, [update({ type: 'error', error: { ...final, stopReason: 'error', errorMessage: '连接中断' } })]);
assert.equal(failed.messages[0].errorMessage, '连接中断');
console.log('官方增量事件保留工具参数流、签名、图片与最终消息，重复开始不会累加旧内容');
