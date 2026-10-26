import { useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { rpc } from '../lib/bridge';
import { messageImages } from '../lib/message-actions';
import type { RemoveQueuedMessageResult } from '../generated/rpc-wire';
import type { Copy } from '../lib/i18n';
import type { SessionView } from '../lib/types';

export default function QueuedMessages({ session, t, disabled, refresh, restore, onError, begin, end }: {
  session: SessionView; t: Copy; disabled: boolean; refresh: () => Promise<void>;
  restore: (text: string, images: ReturnType<typeof messageImages>) => void; onError: (error: unknown) => void;
  begin: () => boolean; end: () => void;
}) {
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const act = async (queue: 'steering' | 'followUp', message: string, takeBack: boolean) => {
    if (lock.current || disabled || !begin()) return;
    lock.current = true; setPending(true);
    try {
      if (takeBack) {
        const result = await rpc<RemoveQueuedMessageResult>(session.id, 'remove_queued_message', { queue, message });
        if (result.removed) {
          restore(message, messageImages({ id: 'queued', role: 'user', content: result.images ?? [] }));
          if (result.imagesDropped) onError(new Error(t.queueImagesDropped));
        }
      } else await rpc(session.id, 'promote_queued_message', { message });
      await refresh();
    } catch (error) { onError(error); } finally { lock.current = false; setPending(false); end(); }
  };
  const queues = session.state.queuedMessages;
  const rows = new Map<string, { queue: 'steering' | 'followUp'; message: string; delivered: boolean; count: number }>();
  // 原生按文本取回首个匹配项；同文归组，让回执决定实际归还的附件。
  for (const queue of ['steering', 'followUp'] as const) (queues?.[queue] ?? []).forEach((message: string, index: number) => {
    const delivered = queue === 'steering' && index < (queues?.liveSteered ?? 0);
    const key = JSON.stringify([queue, message, delivered]);
    const row = rows.get(key);
    if (row) row.count++; else rows.set(key, { queue, message, delivered, count: 1 });
  });
  if (!rows.size) return null;
  return <div className="queued-messages">{[...rows].map(([key, { queue, message, delivered, count }]) => {
    const label = count > 1 ? t.restoreOneQueued : t.restoreQueued;
    return <div key={key}><span title={message}>{queue === 'steering' ? t.steer : t.followUp}: {message}{count > 1 && <small> ×{count}</small>}</span>
      {queue === 'followUp' && <button className="quiet-button" disabled={disabled || pending} onClick={() => void act(queue, message, false)}>{t.steer}</button>}
      <button className="icon-button" title={delivered ? t.queueDelivered : label} aria-label={label} disabled={delivered || disabled || pending} onClick={() => void act(queue, message, true)}><Pencil size={13} /></button>
    </div>;
  })}</div>;
}
