import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronRight, Copy, Pencil, RotateCcw } from 'lucide-react';
import { toolLabel } from './ToolResult';
import ToolSteps from './ToolSteps';
import { ToolGenerationRate } from './GenerationRate';
import { retryMessageIndex } from '../lib/message-actions';
import { enrichToolMessages, messageText } from '../lib/session-state';
import { isStoppedMessage, projectTranscript } from '../lib/transcript-items';
import type { Copy as CopyText } from '../lib/i18n';
import type { ContentBlock, Message } from '../lib/types';

const Markdown = memo(function Markdown({ text }: { text: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: props => <a {...props} target="_blank" rel="noreferrer" /> }}>{text}</ReactMarkdown>;
});

function CollapsedBlock({ block, t, active, stopped }: { block: ContentBlock; t: CopyText; active: boolean; stopped: boolean }) {
  const [open, setOpen] = useState(false);
  const thinking = block.type === 'thinking';
  return <details className={thinking ? 'thinking' : 'tool-call'} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><ChevronRight size={12} aria-hidden="true" /><span>{thinking ? t.thinking : toolLabel(block.name, t)}</span>{!thinking && active && !stopped && <ToolGenerationRate callId={block.id} />}{!thinking && <span className="tool-call-state">{stopped ? t.stopped : active ? t.running : t.statusLabels.pending}</span>}</summary>
    {open && (thinking ? <div className="thinking-body"><Markdown text={block.thinking ?? block.text ?? ''} /></div> : <pre>{JSON.stringify(block.arguments, null, 2)}</pre>)}
  </details>;
}

const MessageView = memo(function MessageView({ message, t, disabled, active, edit, retry }: { message: Message; t: CopyText; disabled: boolean; active: boolean; edit?: (message: Message) => void; retry?: () => void }) {
  const text = messageText(message);
  const stopped = isStoppedMessage(message);
  const activityOnly = message.role === 'assistant' && !stopped && !message.errorMessage && Array.isArray(message.content) && message.content.length > 0 && message.content.every(block => block?.type === 'thinking' || block?.type === 'toolCall');
  return <article className={`message message-${message.role}${activityOnly ? ' message-activity' : ''}`}>
    {message.role === 'user' && <div className="message-label">{t.you}</div>}
    <div className="message-body">{typeof message.content === 'string' ? <Markdown text={message.content} /> : message.content?.filter(Boolean).map((block, i) => {
      if (block.type === 'thinking' || block.type === 'toolCall') return <CollapsedBlock block={block} t={t} active={active} stopped={stopped} key={block.id ?? i} />;
      if (block.type === 'image') return block.data ? <img className="message-image" key={i} src={`data:${block.mimeType};base64,${block.data}`} alt={t.addImage} /> : null;
      return block.text ? <Markdown key={i} text={block.text} /> : null;
    })}</div>
    {(message.errorMessage || stopped) && <p className="message-error" role="status">{message.errorMessage || (message.stopReason === 'aborted' ? t.stopped : t.error)}</p>}
    {!activityOnly && (text.trim() || (edit && message.entryId) || retry) && <div className="message-actions">{text.trim() && <button className="icon-button copy-message" title={t.copy} aria-label={t.copy} onClick={() => navigator.clipboard.writeText(text)}><Copy size={13} /></button>}{edit && message.entryId && <button className="icon-button" title={t.editMessage} aria-label={t.editMessage} disabled={disabled} onClick={() => edit(message)}><Pencil size={13} /></button>}{retry && <button className="quiet-button" title={t.retryTurn} disabled={disabled} onClick={retry}><RotateCcw size={13} />{t.retryTurn}</button>}</div>}
  </article>;
});

export default function Transcript({ messages: source, t, busy, loadEarlier, onEdit, onRetry, actionsDisabled = false }: { messages: Message[]; t: CopyText; busy: boolean; loadEarlier?: () => void; onEdit?: (message: Message) => void; onRetry?: () => void; actionsDisabled?: boolean }) {
  const items = useMemo(() => projectTranscript(enrichToolMessages(source)), [source]);
  const retryId = source[retryMessageIndex(source)]?.id;
  const scrollRef = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const virtualizer = useVirtualizer({ count: items.length, getScrollElement: () => scrollRef.current, estimateSize: i => items[i].kind === 'tools' ? 52 : 140, overscan: 5, getItemKey: i => items[i].id });
  const last = source.at(-1);
  useEffect(() => {
    if (follow.current && items.length) virtualizer.scrollToIndex(items.length - 1, { align: 'end' });
  }, [items.length, last, virtualizer]);
  return <div className="transcript" ref={scrollRef} onScroll={() => { const el = scrollRef.current; if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }}>
    <div className="transcript-content">
      {loadEarlier && <button className="quiet-button history-more" onClick={loadEarlier}>{t.loadEarlier}</button>}
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map(item => {
          const row = items[item.index];
          return <div key={item.key} data-index={item.index} ref={virtualizer.measureElement} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${item.start}px)` }}>{row.kind === 'tools' ? <ToolSteps messages={row.messages} t={t} active={busy} /> : <MessageView message={row.message} t={t} disabled={busy || actionsDisabled} active={busy} edit={row.message.role === 'user' ? onEdit : undefined} retry={row.message.id === retryId ? onRetry : undefined} />}</div>;
        })}
      </div>
      {busy && <div className="working-indicator"><span className="working-dot" />{t.running}</div>}
    </div>
  </div>;
}
