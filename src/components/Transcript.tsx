import { lazy, memo, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ChevronRight, Pencil, RotateCcw } from 'lucide-react';
import { toolLabel } from './ToolResult';
import ToolSteps from './ToolSteps';
import CopyButton from './CopyButton';
import { ToolGenerationRate } from './GenerationRate';
import { retryMessageIndex } from '../lib/message-actions';
import { messageText } from '../lib/session-state';
import { isStoppedMessage, projectTranscript, type TranscriptItem } from '../lib/transcript-items';
import type { Copy as CopyText } from '../lib/i18n';
import type { ContentBlock, Message } from '../lib/types';

type Activity = { kind: 'compaction' | 'retry'; since: number; attempt?: number; maxAttempts?: number };
type Row = TranscriptItem | { kind: 'working'; id: string };
const SHOW_ELAPSED_MS = 5_000;
const SLOW_HINT_MS = 30_000;
const elapsedText = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
// 切换会话会卸载列表；记下读到的行和行内偏移，回来时还原。只存在内存里，重启后回到底部。
// ponytail: 每个会话一条且不设上限，会话多到成千上万时再换成 LRU。
const positions = new Map<string, { id: string; offset: number } | null>();

// react-markdown 与 remark-gfm 体积大：首屏之后再预取，加载前用纯文本占位。
const loadMarkdown = () => import('./MarkdownBody');
const MarkdownBody = lazy(loadMarkdown);
setTimeout(() => void loadMarkdown(), 300);

const Markdown = memo(function Markdown({ text, t }: { text: string; t: CopyText }) {
  return <Suspense fallback={<p className="preserve-lines">{text}</p>}><MarkdownBody text={text} t={t} /></Suspense>;
});

// 长等待（压缩、重试、长回合）要看得出仍在进行：动态标签，5 秒后显示用时，30 秒后解释原因。
function Working({ t, activity }: { t: CopyText; activity?: Activity }) {
  const [start] = useState(() => activity?.since ?? Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const ms = Math.max(0, now - start);
  const label = activity?.kind === 'compaction' ? t.compacting : activity?.kind === 'retry' ? `${t.retrying} ${activity.attempt ?? 1}/${activity.maxAttempts ?? 1}` : t.running;
  return <div className="working-indicator"><span className="working-dot" /><span className="shimmer-text" role="status">{label}</span>{ms >= SHOW_ELAPSED_MS && <span className="working-elapsed">{elapsedText(ms)}</span>}{ms >= SLOW_HINT_MS && <span className="working-hint">{t.stillWorking}</span>}</div>;
}

function CollapsedBlock({ block, t, active, stopped, live }: { block: ContentBlock; t: CopyText; active: boolean; stopped: boolean; live: boolean }) {
  const [open, setOpen] = useState(false);
  const thinking = block.type === 'thinking';
  return <details className={thinking ? 'thinking' : 'tool-call'} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><ChevronRight size={12} aria-hidden="true" /><span className={live ? 'shimmer-text' : undefined}>{thinking ? t.thinking : toolLabel(block.name, t)}</span>{!thinking && active && !stopped && <ToolGenerationRate callId={block.id} />}{!thinking && <span className="tool-call-state">{stopped ? t.stopped : active ? t.running : t.statusLabels.pending}</span>}</summary>
    {open && (thinking ? <div className="thinking-body"><Markdown text={block.thinking ?? block.text ?? ''} t={t} /></div> : <pre>{JSON.stringify(block.arguments, null, 2)}</pre>)}
  </details>;
}

const MessageView = memo(function MessageView({ message, t, disabled, active, live, turn, edit, retry }: { message: Message; t: CopyText; disabled: boolean; active: boolean; live: boolean; turn?: number; edit?: (message: Message) => void; retry?: () => void }) {
  const text = messageText(message);
  const stopped = isStoppedMessage(message);
  const activityOnly = message.role === 'assistant' && !stopped && !message.errorMessage && Array.isArray(message.content) && message.content.length > 0 && message.content.every(block => block?.type === 'thinking' || block?.type === 'toolCall');
  return <article className={`message message-${message.role}${activityOnly ? ' message-activity' : ''}`}>
    {message.role === 'user' && <div className="message-label">{t.you}</div>}
    <div className="message-body">{typeof message.content === 'string' ? <Markdown text={message.content} t={t} /> : message.content?.filter(Boolean).map((block, i, blocks) => {
      if (block.type === 'thinking' || block.type === 'toolCall') return <CollapsedBlock block={block} t={t} active={active} stopped={stopped} live={live && block.type === 'thinking' && i === blocks.length - 1} key={block.id ?? i} />;
      if (block.type === 'image') return block.data ? <img className="message-image" key={i} src={`data:${block.mimeType};base64,${block.data}`} alt={t.addImage} /> : null;
      return block.text ? <Markdown key={i} text={block.text} t={t} /> : null;
    })}</div>
    {(message.errorMessage || stopped) && <p className="message-error" role="status">{message.errorMessage || (message.stopReason === 'aborted' ? t.stopped : t.error)}</p>}
    {!activityOnly && (text.trim() || (edit && message.entryId) || retry) && <div className="message-actions">{turn ? <span className="turn-label">{t.turnNumber.replace('{n}', String(turn))}</span> : null}{text.trim() && <CopyButton className="copy-message" label={t.copy} doneLabel={t.copied} source={() => text} />}{edit && message.entryId && <button className="icon-button" title={t.editMessage} aria-label={t.editMessage} disabled={disabled} onClick={() => edit(message)}><Pencil size={13} /></button>}{retry && <button className="quiet-button" title={t.retryTurn} disabled={disabled} onClick={retry}><RotateCcw size={13} />{t.retryTurn}</button>}</div>}
  </article>;
});

export default function Transcript({ restoreKey, pinNonce = 0, showTurns = true, messages: source, t, busy, activity, loadEarlier, loadingEarlier = false, onEdit, onRetry, actionsDisabled = false }: { restoreKey: string; pinNonce?: number; showTurns?: boolean; messages: Message[]; t: CopyText; busy: boolean; activity?: Activity; loadEarlier?: () => void; loadingEarlier?: boolean; onEdit?: (message: Message) => void; onRetry?: () => void; actionsDisabled?: boolean }) {
  const items = useMemo(() => projectTranscript(source), [source]);
  const working = busy || !!activity;
  // 等待指示作为虚拟列表的最后一行，贴底时它出现和消失都由列表统一跟随。
  const rows = useMemo<Row[]>(() => working ? [...items, { kind: 'working', id: 'working' }] : items, [items, working]);
  const retryId = source[retryMessageIndex(source)]?.id;
  const liveId = busy ? source.at(-1)?.id : undefined;
  // 轮次号：每条用户消息开启新的一轮，其后的回复属于同一轮；更早的历史还没加载时序号不可靠，所以那时不显示。
  const turns = useMemo(() => { const map = new Map<string, number>(); let count = 0; for (const message of source) { if (message.role === 'user') count++; if (count && (message.role === 'user' || message.role === 'assistant')) map.set(message.id, count); } return map; }, [source]);
  const scrollRef = useRef<HTMLDivElement>(null);  const [atEnd, setAtEnd] = useState(true);
  // anchorTo/followOnAppend 由虚拟列表接管：贴底时跟随流式增长；向上翻页、展开内容、图片晚加载都保持当前阅读位置。
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: i => rows[i].kind === 'tools' ? 52 : rows[i].kind === 'working' ? 44 : 140, overscan: 5, getItemKey: i => rows[i].id, anchorTo: 'end', followOnAppend: true, scrollEndThreshold: 80 });
  useLayoutEffect(() => {
    const saved = positions.get(restoreKey);
    const index = saved ? rows.findIndex(row => row.id === saved.id) : -1;
    const target = index >= 0 ? virtualizer.getOffsetForIndex(index, 'start') : undefined;
    let stop = () => {}; if (saved && target) { const el = scrollRef.current!; virtualizer.scrollToIndex(index, { align: 'start' }); let frame = 0; let count = 0; const ctl = new AbortController(); stop = () => { cancelAnimationFrame(frame); ctl.abort(); }; for (const type of ['wheel', 'pointerdown', 'keydown', 'touchstart']) el.addEventListener(type, stop, { signal: ctl.signal, passive: true }); /* ponytail: 未测量的行按估算高度排版，挂载后会漂移；逐帧把目标行校正回保存的偏移，最多 40 帧，用户一动手就停。 */ const aim = () => { const row = el.querySelector<HTMLElement>(`[data-index="${index}"]`); if (row) { const delta = row.getBoundingClientRect().top - el.getBoundingClientRect().top + saved.offset; if (Math.abs(delta) > 1) el.scrollTop += delta; } else virtualizer.scrollToIndex(index, { align: 'start' }); if (++count < 40) frame = requestAnimationFrame(aim); }; frame = requestAnimationFrame(aim); }
    else virtualizer.scrollToEnd();
    return stop;
  }, []);
  // 发送消息时即使正在往上读，也回到最新位置看回复。
  const lastPin = useRef(pinNonce);
  const pinUntil = useRef(0);
  useEffect(() => { if (lastPin.current === pinNonce) return; lastPin.current = pinNonce; pinUntil.current = Date.now() + 4000; virtualizer.scrollToEnd(); }, [pinNonce, virtualizer]);
  // 发送后 4 秒内，新行（用户消息、等待行）先后出现都跟到底；只靠“贴底才跟随”会漏掉。
  // ponytail: 窗口内用户立刻上滚也会被拉回；需要时改成监听 wheel 提前结束。
  useLayoutEffect(() => { if (Date.now() < pinUntil.current) virtualizer.scrollToEnd(); }, [rows.length, virtualizer]);
  return <div className="transcript-frame">
    <div className="transcript" ref={scrollRef} onScroll={event => {
      const el = event.currentTarget;
      const end = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      setAtEnd(end);
      if (end) { positions.set(restoreKey, null); return; }
      const top = el.getBoundingClientRect().top;
      for (const node of el.querySelectorAll<HTMLElement>('[data-index]')) {
        const row = rows[Number(node.dataset.index)];
        const box = node.getBoundingClientRect();
        if (row && box.bottom > top + 4) { positions.set(restoreKey, { id: row.id, offset: top - box.top }); return; }
      }
    }}>
      <div className="transcript-content">
        {loadEarlier && <button className="quiet-button history-more" disabled={loadingEarlier} onClick={loadEarlier}>{loadingEarlier ? t.loading : t.loadEarlier}</button>}
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map(item => {
            const row = rows[item.index];
            return <div key={item.key} data-index={item.index} ref={virtualizer.measureElement} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${item.start}px)` }}>{row.kind === 'tools' ? <ToolSteps messages={row.messages} t={t} active={busy} /> : row.kind === 'working' ? <Working key={activity?.kind ?? 'run'} t={t} activity={activity} /> : <MessageView message={row.message} t={t} disabled={busy || actionsDisabled} active={busy} live={row.message.id === liveId} turn={showTurns && !loadEarlier ? turns.get(row.message.id) : undefined} edit={row.message.role === 'user' ? onEdit : undefined} retry={row.message.id === retryId ? onRetry : undefined} />}</div>;
          })}
        </div>
      </div>
    </div>
    {!atEnd && <button className="jump-latest" title={t.jumpLatest} aria-label={t.jumpLatest} onClick={() => virtualizer.scrollToEnd()}><ArrowDown size={16} /></button>}
  </div>;
}
