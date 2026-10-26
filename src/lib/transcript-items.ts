import type { Message } from './types';

export type TranscriptItem =
  | { kind: 'message'; id: string; message: Message }
  | { kind: 'tools'; id: string; messages: Message[] };

export const isToolMessage = (message: Message): boolean => message.role === 'toolResult' || message.role === 'tool';
export const isStoppedMessage = (message: Message): boolean => message.role === 'assistant' && ['aborted', 'error'].includes(message.stopReason);

export function toolFailed(message: Message): boolean {
  const details = message.result?.details ?? message.partialResult?.details ?? message.details;
  return !!message.isError || !!details?.timedOut || typeof details?.exitCode === 'number' && Number.isFinite(details.exitCode) && details.exitCode !== 0 ||
    Array.isArray(details?.perFileResults) && details.perFileResults.some((file: { isError?: boolean }) => file?.isError);
}

export function projectTranscript(messages: Message[]): TranscriptItem[] {
  const scopes: number[] = [];
  const scopeKeys: string[] = [];
  const results = new Map<number, Set<string>>();
  let scope = 0;
  let scopeKey = 'history';
  for (const message of messages) {
    if (message.role === 'user' || isStoppedMessage(message) || message.errorMessage) scope++;
    if (message.role === 'user' || isStoppedMessage(message) || message.errorMessage) scopeKey = message.id;
    scopes.push(scope);
    scopeKeys.push(scopeKey);
    if (isToolMessage(message) && message.toolCallId) {
      if (!results.has(scope)) results.set(scope, new Set());
      results.get(scope)!.add(message.toolCallId);
    }
    if (isStoppedMessage(message) || message.errorMessage) scope++;
  }

  const items: TranscriptItem[] = [];
  let previousScope = -1;
  messages.forEach((source, index) => {
    let message = source;
    if (message.role === 'assistant' && Array.isArray(message.content)) {
      // 结果按真实调用ID显示，未收到结果的调用仍留在原消息中。
      const content = message.content.filter(block => !block || block.type !== 'toolCall' || !block.id || !results.get(scopes[index])?.has(block.id));
      if (content.length !== message.content.length) {
        if (!content.length && !message.errorMessage && !isStoppedMessage(message)) return;
        message = { ...message, content };
      }
    }
    const previous = items.at(-1);
    if (isToolMessage(message)) {
      // 分小组保留虚拟列表的边界，避免一次展开创建整轮的工具节点。
      if (previous?.kind === 'tools' && previous.messages.length < 20 && previousScope === scopes[index] && !toolFailed(message) && !toolFailed(previous.messages.at(-1)!)) previous.messages.push(message);
      else items.push({ kind: 'tools', id: `tools:${scopeKeys[index]}:${message.toolCallId ?? message.id}`, messages: [message] });
    } else {
      items.push({ kind: 'message', id: `message:${message.id}`, message });
    }
    previousScope = scopes[index];
  });
  return items;
}
