import type { Message } from './types';

type SerialSample = { current: Promise<number | null> | null };

export function sampleNativeRate(read: () => Promise<number | null>, publish: (rate: number | null) => void, running: boolean, serial: SerialSample): () => void {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const sample = async () => {
    if (serial.current) await serial.current.catch(() => {});
    if (cancelled) return;
    const pending = Promise.resolve().then(read);
    serial.current = pending;
    try {
      const value = await pending;
      if (!cancelled) publish(typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null);
    } catch {
      if (!cancelled) publish(null);
    } finally {
      if (serial.current === pending) serial.current = null;
      // 失败仍继续串行采样；切换会话和终态补读复用同一在途请求边界。
      if (!cancelled && running) timer = setTimeout(sample, 500);
    }
  };
  void sample();
  return () => { cancelled = true; clearTimeout(timer); };
}

export function activeToolCallIds(messages: Message[]): Set<string> {
  const ids = new Set<string>();
  let start = messages.length;
  while (start > 0 && messages[start - 1].role !== 'user') start--;
  for (let index = start; index < messages.length; index++) {
    const message = messages[index];
    if (message.role === 'assistant' && (message.errorMessage || ['aborted', 'error'].includes(message.stopReason))) ids.clear();
    else if (message.role === 'assistant' && Array.isArray(message.content)) {
      for (const block of message.content) if (block?.type === 'toolCall' && block.id) ids.add(block.id);
    } else if (message.toolCallId) {
      if (message.running) ids.add(message.toolCallId);
      else ids.delete(message.toolCallId);
    }
  }
  return ids;
}
