import type { Json, Message } from './types';

export type ThinkflowStatus = 'queued' | 'running' | 'success' | 'error' | 'skipped' | 'cancelled' | 'unknown';
type Receipt = Json & { id: string; tool: string; status: ThinkflowStatus };
const states = new Set(['queued', 'running', 'success', 'error', 'skipped', 'cancelled', 'unknown']);

export function thinkflowReceipt(value: unknown): Receipt | undefined {
  if (!value || typeof value !== 'object') return;
  const receipt = value as Receipt;
  return receipt.schemaVersion === 1 && typeof receipt.id === 'string' && typeof receipt.tool === 'string' && states.has(receipt.status) ? receipt : undefined;
}

export function thinkflowStatusText(status: ThinkflowStatus, zh: boolean): string {
  return ({ queued: ['排队中', 'Queued'], running: ['执行中', 'Running'], success: ['已完成', 'Completed'], error: ['执行失败', 'Failed'], skipped: ['已跳过', 'Skipped'], cancelled: ['已取消', 'Cancelled'], unknown: ['结果待核对', 'Check outcome'] } as const)[status][zh ? 0 : 1];
}

// 只投影已落回执的命令范围，保留供应商原文、思考签名与示例。
export function projectThinkflowMessages(messages: Message[]): Message[] {
  const receipts = new Map<string, Receipt>();
  for (const message of messages) {
    const details = message.result?.details ?? message.partialResult?.details ?? message.details;
    const receipt = thinkflowReceipt(details?.thinkflow);
    if (receipt) receipts.set(receipt.id, receipt);
    if (message.customType === 'thinkflow-observation' && Array.isArray(details?.thinkflow?.receipts)) for (const value of details.thinkflow.receipts) {
      const receipt = thinkflowReceipt(value);
      if (receipt) receipts.set(receipt.id, receipt);
    }
  }
  if (!receipts.size) return messages;
  const calls = new Set(messages.filter(message => message.toolCallId).map(message => message.toolCallId));
  const toolMessage = (receipt: Receipt, original?: Message): Message => {
    const callId = `thinkflow/${receipt.id}`, output = receipt.result ?? {};
    return { ...original, id: original?.id ?? `tool-${callId}`, role: 'toolResult', toolCallId: callId, toolName: receipt.tool, args: receipt.args, timestamp: receipt.completedAt ?? receipt.startedAt,
      content: output.content ?? (receipt.error ? [{ type: 'text', text: receipt.error }] : original?.content ?? []), result: { ...output, details: { ...output.details, thinkflow: receipt } }, isError: receipt.status === 'error', running: receipt.status === 'queued' || receipt.status === 'running' };
  };
  const sources = new Map<number, Json[]>();
  for (const receipt of receipts.values()) {
    const source = receipt.source;
    if (source && typeof source.assistantTimestamp === 'number') sources.set(source.assistantTimestamp, [...(sources.get(source.assistantTimestamp) ?? []), source]);
  }
  const result: Message[] = [];
  for (const message of messages) {
    let projected = message;
    if (message.toolCallId?.startsWith('thinkflow/')) {
      const receipt = receipts.get(message.toolCallId.slice('thinkflow/'.length));
      if (receipt) projected = toolMessage(receipt, message);
    }
    const ranges = message.role === 'assistant' && typeof message.timestamp === 'number' ? sources.get(message.timestamp) : undefined;
    if (ranges?.length) {
      const strip = (text: string, contentIndex: number) => {
        const spans = ranges.filter(range => range.contentIndex === contentIndex && Number.isInteger(range.start) && Number.isInteger(range.end) && range.start >= 0 && range.end > range.start && typeof range.text === 'string' && text.slice(range.start, range.end) === range.text).sort((a, b) => b.start - a.start);
        let end = text.length;
        for (const span of spans) if (span.end <= end) { text = text.slice(0, span.start) + text.slice(span.end); end = span.start; }
        return text;
      };
      const content = typeof message.content === 'string' ? strip(message.content, 0) : message.content.map((block, index) => block.type === 'text' ? { ...block, text: strip(block.text ?? '', index) } : block).filter(block => block.type !== 'text' || block.text?.trim());
      projected = { ...message, content };
      if (!(typeof content === 'string' ? content.trim() : content.length) && !message.errorMessage && !['error', 'aborted'].includes(message.stopReason)) continue;
    }
    if (message.customType === 'thinkflow-observation') {
      for (const value of message.details?.thinkflow?.receipts ?? []) {
        const candidate = thinkflowReceipt(value), receipt = candidate && receipts.get(candidate.id), callId = receipt && `thinkflow/${receipt.id}`;
        if (!receipt || !callId || calls.has(callId)) continue;
        calls.add(callId);
        result.push(toolMessage(receipt));
      }
      continue;
    }
    result.push(projected);
  }
  return result;
}
