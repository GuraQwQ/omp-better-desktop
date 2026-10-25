import { memo, useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronRight, Copy, Pencil, RotateCcw } from 'lucide-react';
import ToolResult from './ToolResult';
import { retryMessageIndex } from '../lib/message-actions';
import { enrichToolMessages, messageText } from '../lib/session-state';
import type { Copy as CopyText } from '../lib/i18n';
import type { Message } from '../lib/types';

const Markdown = memo(function Markdown({ text }: { text: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: props => <a {...props} target="_blank" rel="noreferrer" /> }}>{text}</ReactMarkdown>;
});

const MessageView = memo(function MessageView({ message, t, disabled, edit, retry }: { message: Message; t: CopyText; disabled: boolean; edit?: (message: Message) => void; retry?: () => void }) {
  const text = messageText(message);
  if (message.role === 'toolResult' || message.role === 'tool') return <ToolResult message={message} t={t} />;
  return <article className={`message message-${message.role}`}>
    <div className="message-label">{message.role === 'user' ? t.you : 'OMP'}<div className="message-actions"><button className="icon-button copy-message" title={t.copy} aria-label={t.copy} onClick={() => navigator.clipboard.writeText(text)}><Copy size={13} /></button>{edit && message.entryId && <button className="icon-button" title={t.editMessage} aria-label={t.editMessage} disabled={disabled} onClick={() => edit(message)}><Pencil size={13} /></button>}{retry && <button className="quiet-button" title={t.retryTurn} disabled={disabled} onClick={retry}><RotateCcw size={13} />{t.retryTurn}</button>}</div></div>
    <div className="message-body">{typeof message.content === 'string' ? <Markdown text={message.content} /> : message.content?.filter(Boolean).map((block, i) => {
      if (block.type === 'thinking') return <details className="thinking" key={i}><summary>{t.thinking}</summary><Markdown text={block.thinking ?? block.text ?? ''} /></details>;
      if (block.type === 'toolCall') return <details className="tool-call" key={block.id ?? i}><summary><ChevronRight size={13} />{block.name}</summary><pre>{JSON.stringify(block.arguments, null, 2)}</pre></details>;
      if (block.type === 'image') return block.data ? <img className="message-image" key={i} src={`data:${block.mimeType};base64,${block.data}`} alt={t.addImage} /> : null;
      return block.text ? <Markdown key={i} text={block.text} /> : null;
    })}</div>
    {message.errorMessage && <p className="message-error" role="status">{message.errorMessage}</p>}
  </article>;
});

export default function Transcript({ messages: source, t, busy, loadEarlier, onEdit, onRetry, actionsDisabled = false }: { messages: Message[]; t: CopyText; busy: boolean; loadEarlier?: () => void; onEdit?: (message: Message) => void; onRetry?: () => void; actionsDisabled?: boolean }) {
  const messages = useMemo(() => enrichToolMessages(source), [source]);
  const retryIndex = retryMessageIndex(messages);
  const scrollRef = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const virtualizer = useVirtualizer({ count: messages.length, getScrollElement: () => scrollRef.current, estimateSize: () => 140, overscan: 5, getItemKey: i => messages[i].id });
  const last = messages.at(-1);
  useEffect(() => {
    if (follow.current && messages.length) virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
  }, [messages.length, last, virtualizer]);
  return <div className="transcript" ref={scrollRef} onScroll={() => { const el = scrollRef.current; if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }}>
    <div className="transcript-content">
      {loadEarlier && <button className="quiet-button history-more" onClick={loadEarlier}>{t.loadEarlier}</button>}
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map(item => <div key={item.key} data-index={item.index} ref={virtualizer.measureElement} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${item.start}px)` }}><MessageView message={messages[item.index]} t={t} disabled={busy || actionsDisabled} edit={messages[item.index].role === 'user' ? onEdit : undefined} retry={item.index === retryIndex ? onRetry : undefined} /></div>)}
      </div>
      {busy && <div className="working-indicator"><span className="working-dot" />{t.running}</div>}
    </div>
  </div>;
}
