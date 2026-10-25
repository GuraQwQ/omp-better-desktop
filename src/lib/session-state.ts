import type { Json, Message, SessionView } from './types';

export function normalizeMessage(value: Json, fallback: string): Message {
  const message = value.message ?? value;
  return { ...message, id: value.messageId ?? message.id ?? fallback, role: message.role ?? 'assistant', content: message.content ?? message.text ?? '' };
}

export function returnFromTerminal(session: SessionView, runtimeReleased: boolean): SessionView {
  return runtimeReleased ? { ...session, historyOnly: true } : session;
}

export function applyEvent(session: SessionView, event: Json): SessionView {
  if (event.type === 'desktop_status') return { ...session, status: event.status };
  if (event.type === 'agent_start') return { ...session, status: 'running', state: { ...session.state, isStreaming: true, isSettled: false } };
  if (event.type === 'agent_end') return { ...session, status: event.awaitingAsyncWork ? 'background' : 'ready', state: { ...session.state, isStreaming: false, isSettled: false } };
  if (event.type === 'session_settled') return { ...session, status: 'ready', state: { ...session.state, isStreaming: false, isSettled: true } };
  if (event.type === 'prompt_result') return { ...session, status: event.sessionSettled ? 'ready' : session.status, state: { ...session.state, ...(event.sessionSettled ? { isStreaming: false, isSettled: true } : {}) } };
  if (event.type === 'queue_update') return { ...session, state: { ...session.state, queuedMessages: { steering: event.steering ?? [], followUp: event.followUp ?? [] } } };
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
      } else if (delta.type === 'text_end' || delta.type === 'thinking_end') {
        const key = delta.type === 'text_end' ? 'text' : 'thinking';
        content[blockIndex] = { type: key, [key]: delta.content ?? content[blockIndex]?.[key] ?? '' };
      }
      message = { ...(previous ?? message), content };
    }
    const messages = session.messages.slice();
    if (index >= 0) messages[index] = message;
    else messages.push(message);
    return { ...session, messages: message.toolCallId && !message.id.startsWith('tool-') ? messages.filter(item => item.id !== `tool-${message.toolCallId}`) : messages };
  }
  if (event.type === 'command_output') return { ...session, messages: [...session.messages, { id: `command-${event.id ?? session.messages.length}`, role: 'assistant', content: event.text ?? event.output ?? '' }] };
  if (event.type === 'tool_execution_start' || event.type === 'tool_execution_update' || event.type === 'tool_execution_end') {
    const id = `tool-${event.toolCallId}`;
    const index = session.messages.findIndex(m => m.id === id);
    const message: Message = { id, role: 'toolResult', toolName: event.toolName, toolCallId: event.toolCallId, content: event.result?.content ?? event.partialResult?.content ?? '', isError: event.isError, running: event.type !== 'tool_execution_end' };
    const messages = session.messages.slice();
    if (index >= 0) messages[index] = { ...messages[index], ...message };
    else messages.push(message);
    return { ...session, messages };
  }
  return session;
}

export function messageText(message: Message): string {
  if (typeof message.content === 'string') return message.content;
  return (message.content ?? []).filter(Boolean).map(block => block.text ?? block.thinking ?? '').join('\n');
}
