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
  if (!queues?.steering?.length && !queues?.followUp?.length) return null;
  return <div className="queued-messages">{(['steering', 'followUp'] as const).flatMap(queue => (queues?.[queue] ?? []).map((message: string, index: number) => {
    const delivered = queue === 'steering' && index < (queues?.liveSteered ?? 0);
    return <div key={`${queue}:${index}:${message}`}><span title={message}>{queue === 'steering' ? t.steer : t.followUp}: {message}</span>
      {queue === 'followUp' && <button className="quiet-button" disabled={disabled || pending} onClick={() => void act(queue, message, false)}>{t.steer}</button>}
      <button className="icon-button" title={delivered ? t.queueDelivered : t.restoreQueued} aria-label={t.restoreQueued} disabled={delivered || disabled || pending} onClick={() => void act(queue, message, true)}><Pencil size={13} /></button>
    </div>;
  }))}</div>;
}
