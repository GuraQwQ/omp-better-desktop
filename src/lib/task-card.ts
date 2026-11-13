import { messageText } from './session-state';
import type { Language, SessionView } from './types';

export function taskCardSummary(text: string): string {
  return text.replace(/```[\s\S]*?(?:```|$)/g, '').trim().slice(0, 500);
}

export function taskCardSnapshot(session: SessionView, language: Language) {
  let summary = '';
  for (let index = session.messages.length - 1; index >= 0; index--) {
    if (session.messages[index].role === 'assistant') { summary = taskCardSummary(messageText(session.messages[index])); break; }
  }
  return { sessionId: session.id, title: session.title, cwd: session.cwd, status: session.status, pending: session.pending.length, language, summary };
}
