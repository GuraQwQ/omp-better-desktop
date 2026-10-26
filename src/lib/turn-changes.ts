import { messageText } from './session-state';
import { isToolMessage } from './transcript-items';
import type { Json, Message } from './types';

export interface ChangeTurn { id: string; title: string; ordinal: number | null; messages: Message[] }
type SourceGroup = { turn: ChangeTurn; source: { message: Message; index: number }[]; results: Map<CallOwner | string, Message> };
type CallOwner = { index: number; group: SourceGroup; call: Json };

export function collectTurnChanges(messages: Message[]): ChangeTurn[] {
  const groups: SourceGroup[] = [];
  const calls = new Map<string, CallOwner[]>();
  let current: SourceGroup | undefined;
  let ordinal = 0;
  for (const [index, message] of messages.entries()) {
    if (message.role === 'user') {
      current = { turn: { id: message.entryId ?? message.id, title: messageText(message).replace(/\s+/g, ' ').trim(), ordinal: ++ordinal, messages: [] }, source: [], results: new Map() };
      groups.push(current);
    } else {
      if (!current) {
        current = { turn: { id: `earlier:${message.id}`, title: '', ordinal: null, messages: [] }, source: [], results: new Map() };
        groups.push(current);
      }
      current.source.push({ message, index });
      if (message.role === 'assistant' && Array.isArray(message.content)) {
        for (const block of message.content) if (block?.type === 'toolCall' && block.id) {
          if (!calls.has(block.id)) calls.set(block.id, []);
          calls.get(block.id)!.push({ index, group: current, call: block });
        }
      }
    }
  }
  for (const fallback of groups) {
    for (const { message, index } of fallback.source) {
      if (!isToolMessage(message)) continue;
      const candidates = message.toolCallId ? calls.get(message.toolCallId) ?? [] : [];
      let low = 0, high = candidates.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (candidates[middle].index <= index) low = middle + 1;
        else high = middle;
      }
      // steer 可插在调用和结果之间，归属跟随实际调用而非最近用户消息。
      const owner = candidates[low - 1] ?? (candidates[0]?.group === fallback ? candidates[0] : undefined);
      const group = owner?.group ?? fallback;
      const key = owner ?? message.toolCallId ?? message.id;
      const previous = group.results.get(key);
      const call = owner?.call;
      const toolName = message.toolName ?? call?.name ?? previous?.toolName;
      if (!['edit', 'write', 'ast_edit'].includes(toolName ?? '')) continue;
      const value: Message = { ...previous, ...message, toolName, args: message.args ?? call?.arguments ?? previous?.args };
      if (toolName === 'write') {
        const details = value.result?.details ?? value.partialResult?.details ?? value.details ?? {};
        const path = details.resolvedPath ?? value.args?.path ?? value.args?.file_path;
        if (typeof path !== 'string' || !path || /^[a-z][a-z\d+.-]*:\/\//i.test(path) || details.xdev || details.proc || details.cfg || details.message) continue;
      }
      group.results.set(key, value);
    }
  }
  for (const group of groups) group.turn.messages = [...group.results.values()];
  return groups.map(group => group.turn).filter(turn => turn.ordinal !== null || turn.messages.length > 0);
}
