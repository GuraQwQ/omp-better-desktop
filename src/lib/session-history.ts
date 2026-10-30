import { sessionPathKey } from './session-identity';
import { enrichToolMessages, normalizeHistoryMessages } from './session-state';
import type { Json, SessionView } from './types';

export function prependHistoryPage(current: SessionView, source: SessionView, page: { messages: Json[]; nextCursor?: string }): SessionView {
  if (current.id !== source.id || !current.path || !source.path || sessionPathKey(current.path) !== sessionPathKey(source.path) || current.nextCursor !== source.nextCursor) return current;
  const messages = new Map([...normalizeHistoryMessages(page.messages, `history-${source.nextCursor}`), ...current.messages].map(message => [message.id, message]));
  return { ...current, messages: enrichToolMessages([...messages.values()]), nextCursor: page.nextCursor };
}
