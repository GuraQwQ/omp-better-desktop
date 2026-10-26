import type { Message } from './types';

type SerialSample = { current: Promise<number | null> | null };

export function sampleNativeRate(read: () => Promise<number | null>, publish: (rate: number | null) => void, running: boolean, serial: SerialSample): () => void {
  let cancelled = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const sample = async () => {
    if (serial.current) await serial.current.catch(() => {});
    if (cancelled) return;
    const pending = Promise.resolve().then(read);
    serial.current = pending;
    try {
      const value = await pending;
      failures = 0;
      if (!cancelled) publish(typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null);
    } catch {
      failures = Math.min(failures + 1, 4);
      if (!cancelled) publish(null);
    } finally {
      if (serial.current === pending) serial.current = null;
      // 连续失败逐步退避；成功后恢复正常采样，切换会话仍保持串行。
      if (!cancelled && running) timer = setTimeout(sample, 500 * 2 ** Math.max(0, failures - 1));
    }
  };
  void sample();
  return () => { cancelled = true; clearTimeout(timer); };
}

export function activeToolCallIds(messages: Message[], anchor?: string | null): Set<string> {
  const ids = new Set<string>();
  const anchorIndex = typeof anchor === 'string' ? messages.findIndex(message => message.id === anchor) : -1;
  let start = anchor === null ? 0 : anchorIndex + 1;
  if (anchor !== null && anchorIndex < 0) {
    start = messages.length;
    while (start > 0 && messages[start - 1].role !== 'user') start--;
  }
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
