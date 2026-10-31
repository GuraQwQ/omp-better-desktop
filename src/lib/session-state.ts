import type { Json, Message, SessionView } from './types';
import { todoPhasesFromMessage } from './session-todos';

export function isSessionRunning(session?: SessionView): boolean {
  return !!session && !session.historyOnly && (!!session.state.isStreaming || ['running', 'background'].includes(session.status) || session.state.isSettled === false);
}

export function normalizeMessage(value: Json, fallback: string): Message {
  const message = value.message ?? value;
  return { ...message, id: value.messageId ?? message.id ?? fallback, role: message.role ?? 'assistant', content: message.content ?? message.text ?? '' };
}

export function enrichToolMessages(messages: Message[]): Message[] {
  const calls = new Map<string, { name?: string; arguments?: unknown }>();
  for (const message of messages) if (Array.isArray(message.content)) {
    for (const block of message.content) if (block?.type === 'toolCall' && block.id) calls.set(block.id, block);
  }
  return messages.map(message => {
    const call = message.toolCallId ? calls.get(message.toolCallId) : undefined;
    return call && (message.args === undefined || !message.toolName) ? { ...message, args: message.args ?? call.arguments, toolName: message.toolName ?? call.name } : message;
  });
}
export const normalizeHistoryMessages = (messages: Json[], prefix: string): Message[] => enrichToolMessages(messages.map((message, index) => normalizeMessage({ ...message, entryId: message.id }, `${prefix}-${index}`)));

function toolMetadataChanged(event: Json): boolean {
  return event.type.startsWith('tool_execution_') || ['message_start', 'message_update', 'message_end'].includes(event.type) && (
    ['tool', 'toolResult'].includes(event.message?.role) || event.assistantMessageEvent?.type?.startsWith('toolcall_') ||
    Array.isArray(event.message?.content) && event.message.content.some((block: Json) => block?.type === 'toolCall')
  );
}

export function applyEvents(session: SessionView, events: Json[]): SessionView {
  let updated = session;
  let toolsChanged = false;
  for (const event of events) {
    updated = reduceEvent(updated, event);
    toolsChanged ||= toolMetadataChanged(event);
  }
  return toolsChanged && updated.messages !== session.messages ? { ...updated, messages: enrichToolMessages(updated.messages) } : updated;
}

export const applyEvent = (session: SessionView, event: Json): SessionView => applyEvents(session, [event]);
export function returnFromTerminal(session: SessionView, runtimeReleased: boolean): SessionView {
  return runtimeReleased ? { ...session, historyOnly: true } : session;
}

function reduceEvent(session: SessionView, event: Json): SessionView {
  if (event.type === 'desktop_status') {
    if (event.status === 'released' || event.status === 'disconnected') return { ...session, path: event.path === null && !session.messages.length ? undefined : event.path ?? session.path, historyOnly: true, status: 'ready', state: { ...session.state, isStreaming: false, isSettled: true, activity: undefined } };
    return { ...session, status: event.status };
  }
  if (event.type === 'agent_start') return { ...session, status: 'running', state: { ...session.state, isStreaming: true, isSettled: false, desktopRunAnchor: session.messages.at(-1)?.id ?? null } };
  if (event.type === 'agent_end') return { ...session, status: event.awaitingAsyncWork ? 'background' : 'ready', state: { ...session.state, isStreaming: false, isSettled: false } };
  if (event.type === 'session_settled') return { ...session, status: 'ready', state: { ...session.state, isStreaming: false, isSettled: true, activity: undefined } };
  if (event.type === 'prompt_result') return { ...session, status: event.sessionSettled ? 'ready' : session.status, state: { ...session.state, ...(event.sessionSettled ? { isStreaming: false, isSettled: true, activity: undefined } : {}) } };
  if (event.type === 'auto_compaction_start') return { ...session, state: { ...session.state, activity: { kind: 'compaction', since: Date.now() } } };
  if (event.type === 'auto_retry_start') return { ...session, state: { ...session.state, activity: { kind: 'retry', since: Date.now(), attempt: event.attempt, maxAttempts: event.maxAttempts } } };
  if (event.type === 'auto_compaction_end' || event.type === 'auto_retry_end') return { ...session, state: { ...session.state, activity: undefined } };
  if (event.type === 'queue_update') return { ...session, state: { ...session.state, queuedMessages: { steering: event.steering ?? [], followUp: event.followUp ?? [], ...(event.liveSteered !== undefined ? { liveSteered: event.liveSteered } : {}) } } };
  if (event.type === 'available_commands_update') return { ...session, state: { ...session.state, availableCommands: event.commands ?? [] } };
  if (event.type === 'todo_auto_clear') return { ...session, state: { ...session.state, todoPhases: [] } };
  if (event.type === 'session_info_update') return { ...session, title: event.title ?? event.sessionName ?? event.name ?? session.title, path: event.sessionFile ?? session.path };
  if (event.type === 'btw_record') return { ...session, state: { ...session.state, btwRecords: [event.record, ...(session.state.btwRecords ?? []).filter((record: Json) => record.id !== event.record.id)] } };
  if (event.type === 'btw_delta') return { ...session, state: { ...session.state, btwRecords: (session.state.btwRecords ?? []).map((record: Json) => {
    if (record.id !== event.recordId) return record;
    if (!record.followUps?.length) return { ...record, answer: record.answer + event.delta };
    const followUps = record.followUps.slice();
    const last = followUps.length - 1;
    followUps[last] = { ...followUps[last], answer: followUps[last].answer + event.delta };
    return { ...record, followUps };
  }) } };
  if (event.type === 'live_phase') return { ...session, state: { ...session.state, live: { ...session.state.live, phase: event.phase, active: true } } };
  if (event.type === 'live_transcript') return { ...session, state: { ...session.state, live: { ...session.state.live, transcript: event.text } } };
  if (event.type === 'live_end') return { ...session, state: { ...session.state, live: { ...session.state.live, active: false, error: event.error } } };
  if (event.type === 'extension_ui_request') {
    if (event.method === 'set_editor_text') return { ...session, draft: event.text ?? '' };
    if (event.method === 'cancel') return { ...session, pending: session.pending.filter(p => p.id !== event.targetId) };
    if (['select', 'confirm', 'input', 'editor', 'ask', 'open_url'].includes(event.method)) {
      return { ...session, pending: [...session.pending.filter(p => p.id !== event.id), event] };
    }
    return session;
  }
  if (['message_start', 'message_update', 'message_end'].includes(event.type)) {
    const id = event.messageId ?? event.message?.id;
    const index = session.messages.findIndex(m => m.id === id);
    const previous = session.messages[index];
    let message = normalizeMessage(event, id ?? `event-${session.messages.length}`);
    const delta = event.assistantMessageEvent;
    if (event.type === 'message_update' && delta && !event.message?.content) {
      const content = Array.isArray(previous?.content) ? previous.content.map(block => ({ ...block })) : [];
      const blockIndex = delta.contentIndex ?? 0;
      if (delta.type === 'text_delta' || delta.type === 'thinking_delta') {
        const key = delta.type === 'text_delta' ? 'text' : 'thinking';
        content[blockIndex] = { ...(content[blockIndex] ?? { type: key }), [key]: (content[blockIndex]?.[key] ?? '') + delta.delta };
      } else if (delta.type === 'toolcall_end') {
        content[blockIndex] = { type: 'toolCall', ...delta.toolCall };
      } else if (delta.type === 'toolcall_start' || delta.type === 'toolcall_delta') {
        const block = delta.partial?.content?.[blockIndex];
        if (block?.type === 'toolCall') content[blockIndex] = { ...block };
      } else if (delta.type === 'text_end' || delta.type === 'thinking_end') {
        const key = delta.type === 'text_end' ? 'text' : 'thinking';
        content[blockIndex] = { type: key, [key]: delta.content ?? content[blockIndex]?.[key] ?? '' };
      }
      message = { ...(previous ?? message), content };
    }
    const provisional = message.toolCallId ? session.messages.find(item => item.id === `tool-${message.toolCallId}`) : undefined;
    if (message.role === 'toolResult' || message.role === 'tool') message = { ...provisional, ...message, args: message.args ?? provisional?.args, details: message.details ?? provisional?.details, result: message.result ?? { ...provisional?.result, content: message.content, details: message.details ?? provisional?.details }, running: event.type !== 'message_end' };
    const messages = session.messages.slice();
    if (index >= 0) messages[index] = message;
    else messages.push(message);
    const phases = todoPhasesFromMessage(message);
    return { ...session, ...(phases ? { state: { ...session.state, todoPhases: phases } } : {}), messages: message.toolCallId && !message.id.startsWith('tool-') ? messages.filter(item => item.id !== `tool-${message.toolCallId}`) : messages };
  }
  if (event.type === 'command_output') return { ...session, messages: [...session.messages, { id: `command-${event.id ?? session.messages.length}`, role: 'assistant', content: event.text ?? event.output ?? '' }] };
  if (event.type === 'tool_execution_start' || event.type === 'tool_execution_update' || event.type === 'tool_execution_end') {
    const id = `tool-${event.toolCallId}`;
    const index = session.messages.findIndex(m => m.id === id);
    const previous = session.messages[index];
    const result = event.result ?? event.partialResult;
    const message: Message = { ...previous, id, role: 'toolResult', toolName: event.toolName ?? previous?.toolName, toolCallId: event.toolCallId, args: event.args ?? previous?.args, result: event.result ?? previous?.result, partialResult: event.partialResult ?? previous?.partialResult, details: result?.details ?? previous?.details, content: result?.content ?? previous?.content ?? '', isError: event.isError ?? previous?.isError, running: event.type !== 'tool_execution_end' };
    const messages = session.messages.slice();
    if (index >= 0) messages[index] = { ...messages[index], ...message };
    else messages.push(message);
    const phases = todoPhasesFromMessage(message);
    return { ...session, ...(phases ? { state: { ...session.state, todoPhases: phases } } : {}), messages };
  }
  return session;
}

export function messageText(message: Message): string {
  if (typeof message.content === 'string') return message.content;
  return (message.content ?? []).filter(Boolean).map(block => block.text ?? block.thinking ?? '').join('\n');
}
