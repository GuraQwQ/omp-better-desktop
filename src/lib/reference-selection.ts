import { appendReferences, createMessageReference, createToolCallReference, type ConversationReference, type ReferenceSource, type SelectionContext } from './references';
import type { Message } from './types';

export function readReferenceSelection(range: Range, root: HTMLElement, messages: Message[], source: ReferenceSource, turns?: Map<string, number>): SelectionContext | undefined {
  const refs: ConversationReference[] = [];
  const offsets: { messageId: string; start: number; end: number }[] = [];
  const byId = new Map(messages.map(message => [message.id, message]));
  for (const element of root.querySelectorAll<HTMLElement>('[data-reference-kind]')) {
    if (element.closest('[inert], [aria-hidden="true"]') || !range.intersectsNode(element)) continue;
    const container = element.closest<HTMLElement>('[data-reference-message-id]');
    const message = byId.get(container?.dataset.referenceMessageId ?? '');
    if (!container || !message) continue;
    const part = document.createRange(); part.selectNodeContents(element);
    if (range.compareBoundaryPoints(Range.START_TO_START, part) > 0) part.setStart(range.startContainer, range.startOffset);
    if (range.compareBoundaryPoints(Range.END_TO_END, part) < 0) part.setEnd(range.endContainer, range.endOffset);
    const content = part.toString(); if (!content.trim()) continue;
    const before = document.createRange(); before.selectNodeContents(container); before.setEnd(part.startContainer, part.startOffset);
    const after = document.createRange(); after.selectNodeContents(container); after.setEnd(part.endContainer, part.endOffset);
    offsets.push({ messageId: message.id, start: before.toString().length, end: after.toString().length });
    if (element.dataset.referenceKind === 'tool-call') {
      const block = Array.isArray(message.content) ? message.content.find(block => block.type === 'toolCall' && block.id === element.dataset.referenceCallId) : undefined;
      refs.push(createToolCallReference(source, message, block, turns?.get(message.id), content));
    } else refs.push(createMessageReference(source, message, content, turns?.get(message.id)));
  }
  if (!offsets.length) return;
  const first = offsets[0]; const last = offsets.at(-1)!;
  return { references: appendReferences([], refs), source: { kind: 'selection', messageId: first.messageId, start: first.start, end: last.end, ...(first.messageId !== last.messageId ? { endMessageId: last.messageId } : {}) } };
}
