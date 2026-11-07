import type { ContentBlock, Message } from './types';

export type ReferenceSource = { sessionId?: string; sessionPath?: string; sessionTitle?: string };
export type ConversationReference = {
  id: string;
  source: ReferenceSource & {
    messageId: string; role: string; turn?: number;
    kind: 'text' | 'tool-call' | 'tool-result'; toolName?: string; toolCallId?: string;
  };
  content: string;
};
export type SelectionContext = {
  references: ConversationReference[];
  source: { kind: 'selection'; messageId: string; start: number; end: number; endMessageId?: string };
};

const start = '[omp-desktop-references]\n';
const end = '\n[/omp-desktop-references]\n\n';
const key = (reference: Omit<ConversationReference, 'id'>) => JSON.stringify([
  reference.source.sessionId, reference.source.sessionPath, reference.source.messageId,
  reference.source.role, reference.source.kind, reference.source.toolCallId, reference.content,
]);

function identify(value: Omit<ConversationReference, 'id'>): ConversationReference {
  // 相同来源和选段的标识稳定；去重仍比较完整内容，避免摘要影响引用。
  let a = 2166136261; let b = 5381;
  for (const char of key(value)) { const code = char.codePointAt(0)!; a = Math.imul(a ^ code, 16777619); b = Math.imul(b, 33) ^ code; }
  return { ...value, id: `reference-${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}` };
}

export function createMessageReference(source: ReferenceSource, message: Message, selection?: string, turn?: number): ConversationReference {
  const tool = message.role === 'tool' || message.role === 'toolResult';
  const content = selection ?? (tool ? JSON.stringify({ content: message.content, result: message.result, partialResult: message.partialResult, details: message.details }, null, 2) : typeof message.content === 'string' ? message.content : message.content.filter(block => block?.type === 'text').map(block => block.text ?? '').join('\n'));
  return identify({ source: { ...source, messageId: message.id, role: message.role, turn, kind: tool ? 'tool-result' : 'text', ...(tool ? { toolName: message.toolName, toolCallId: message.toolCallId } : {}) }, content });
}

export function createToolCallReference(source: ReferenceSource, message: Message, block?: ContentBlock, turn?: number, selection?: string): ConversationReference {
  return identify({ source: { ...source, messageId: message.id, role: message.role, turn, kind: 'tool-call', toolName: block?.name ?? message.toolName, toolCallId: block?.id ?? message.toolCallId }, content: selection ?? JSON.stringify(block?.arguments ?? message.args ?? {}, null, 2) });
}

export function appendReferences(existing: ConversationReference[], additions: ConversationReference[]): ConversationReference[] {
  const seen = new Set(existing.map(key));
  return [...existing, ...additions.filter(reference => { const signature = key(reference); if (seen.has(signature)) return false; seen.add(signature); return true; })];
}

export function encodeReferencedPrompt(body: string, references: ConversationReference[]): string {
  if (!references.length) return body;
  return `${start}${JSON.stringify(references).replace(/</g, '\\u003c')}${end}${body}`;
}

function isReference(value: unknown): value is ConversationReference {
  if (!value || typeof value !== 'object') return false;
  const reference = value as ConversationReference; const source = reference.source;
  return typeof reference.id === 'string' && typeof reference.content === 'string' && !!source && typeof source.messageId === 'string' && typeof source.role === 'string' && ['text', 'tool-call', 'tool-result'].includes(source.kind);
}

export function parseReferencedPrompt(raw: string): { body: string; references: ConversationReference[] } {
  if (!raw.startsWith(start)) return { body: raw, references: [] };
  const index = raw.indexOf(end, start.length);
  if (index < 0) return { body: raw, references: [] };
  try {
    const references: unknown = JSON.parse(raw.slice(start.length, index));
    if (Array.isArray(references) && references.every(isReference)) return { body: raw.slice(index + end.length), references };
  } catch { /* 未完成或被编辑的引用保留原文，仍可继续编辑和发送。 */ }
  return { body: raw, references: [] };
}

export function referenceLabel(reference: ConversationReference): string {
  const source = reference.source;
  const role = source.kind === 'tool-call' ? '工具调用' : source.kind === 'tool-result' ? '工具结果' : source.role === 'user' ? '用户' : source.role === 'assistant' ? '助手' : source.role;
  return [source.sessionTitle || source.sessionId || '当前会话', source.turn ? `第 ${source.turn} 轮` : '', role, source.toolName].filter(Boolean).join(' · ');
}

export function referencePreview(reference: ConversationReference): string {
  let content = reference.content;
  if (reference.source.kind !== 'text') {
    try {
      const value = JSON.parse(content);
      if (typeof value.content === 'string') content = value.content;
      else if (Array.isArray(value.content)) content = value.content.filter((block: ContentBlock) => block?.type === 'text').map((block: ContentBlock) => block.text ?? '').join('\n');
      else if (typeof value.command === 'string') content = value.command;
      else if (typeof value.path === 'string') content = value.path;
    } catch { /* 工具选段也可以是纯文本。 */ }
  }
  return content.slice(0, 360).replace(/\s+/g, ' ').slice(0, 180);
}
