import { messageText } from './session-state';
import { isToolMessage } from './transcript-items';
import type { Json, Message } from './types';

export interface ChangeTurn { id: string; title: string; ordinal: number | null; messages: Message[] }

export function collectTurnChanges(messages: Message[]): ChangeTurn[] {
  const groups: { turn: ChangeTurn; source: Message[] }[] = [];
  let current: typeof groups[number] | undefined;
  let ordinal = 0;
  for (const message of messages) {
    if (message.role === 'user') {
      current = { turn: { id: message.entryId ?? message.id, title: messageText(message).replace(/\s+/g, ' ').trim(), ordinal: ++ordinal, messages: [] }, source: [] };
      groups.push(current);
    } else {
      if (!current) {
        current = { turn: { id: `earlier:${message.id}`, title: '', ordinal: null, messages: [] }, source: [] };
        groups.push(current);
      }
      current.source.push(message);
    }
  }
  for (const { turn, source } of groups) {
    const calls = new Map<string, Json>();
    for (const message of source) if (message.role === 'assistant' && Array.isArray(message.content)) {
      for (const block of message.content) if (block?.type === 'toolCall' && block.id) calls.set(block.id, block);
    }
    const results = new Map<string, Message>();
    for (const message of source) {
      if (!isToolMessage(message)) continue;
      const key = message.toolCallId ?? message.id;
      const previous = results.get(key);
      const call = message.toolCallId ? calls.get(message.toolCallId) : undefined;
      const toolName = message.toolName ?? call?.name ?? previous?.toolName;
      if (!['edit', 'write', 'ast_edit'].includes(toolName ?? '')) continue;
      const value: Message = { ...previous, ...message, toolName, args: message.args ?? call?.arguments ?? previous?.args };
      if (toolName === 'write') {
        const details = value.result?.details ?? value.partialResult?.details ?? value.details ?? {};
        const path = details.resolvedPath ?? value.args?.path ?? value.args?.file_path;
        if (typeof path !== 'string' || !path || /^[a-z][a-z\d+.-]*:\/\//i.test(path) || details.xdev || details.proc || details.cfg || details.message) continue;
      }
      results.set(key, value);
    }
    turn.messages = [...results.values()];
  }
  return groups.map(group => group.turn).filter(turn => turn.ordinal !== null || turn.messages.length > 0);
}
