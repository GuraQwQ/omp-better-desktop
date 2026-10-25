import type { Json, Message } from './types';

export function editableEntry(tree: { entries: Json[]; leafId: string | null }, entryId: string) {
  const entries = new Map(tree.entries.map(entry => [entry.id, entry]));
  const seen = new Set<string>();
  let current = tree.leafId;
  while (current && !seen.has(current)) {
    seen.add(current);
    const entry = entries.get(current);
    if (!entry) break;
    if (current === entryId) return entry.type === 'message' && entry.message?.role === 'user' ? entry : undefined;
    current = entry.parentId;
  }
}

export function messageImages(message: Message) {
  return typeof message.content === 'string' ? [] : message.content.filter(block => block.type === 'image' && block.data && block.mimeType).map((block, index) => ({
    type: 'image' as const, data: block.data!, mimeType: block.mimeType!, name: `image-${index + 1}`,
  }));
}

export function retryableMessage(message?: Message) {
  return message?.role === 'assistant' && (message.stopReason === 'error' || message.stopReason === 'aborted');
}

export function retryMessageIndex(messages: Message[]) {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role === 'toolResult' && message.details?.__synthetic === true || message.role === 'custom' && message.customType === 'eval-state-context') continue;
    return retryableMessage(message) ? index : -1;
  }
  return -1;
}
