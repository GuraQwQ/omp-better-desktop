import { lazy, memo, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { createPortal } from 'react-dom';
import { ArrowDown, ChevronRight, Pencil, RotateCcw, X } from 'lucide-react';
import { toolLabel } from './ToolResult';
import ToolSteps from './ToolSteps';
import CopyButton from './CopyButton';
import Collapse from './Collapse';
import { ToolGenerationRate } from './GenerationRate';
import { retryMessageIndex } from '../lib/message-actions';
import { messageText } from '../lib/session-state';
import { isSessionNotice, isStoppedMessage, projectTranscript, type TranscriptItem } from '../lib/transcript-items';
import type { Copy as CopyText } from '../lib/i18n';
import type { ContentBlock, Message } from '../lib/types';
import { displayUserPrompt } from '../lib/genui-prompt';
import { collectGenUIRepairs, type GenUIRepairs } from '../lib/genui';
import type { GenUIConfiguration } from '../lib/genui-config';
import { selectionMenuPosition } from '../lib/selection-menu';
import './desktop-tools.css';
import { createMessageReference, createToolCallReference, parseReferencedPrompt, type ConversationReference, type ReferenceSource, type SelectionContext } from '../lib/references';
import { readReferenceSelection } from '../lib/reference-selection';
import type { SideQuestionThreadSummary } from '../lib/side-questions';
import { ReferenceCards } from './ComposerReferences';
import SideQuestionMarkers from './SideQuestionMarkers';
import ZoomableImage from './ZoomableImage';
import ToolReferenceMenu from './ToolReferenceMenu';
import QuestionResponse from './QuestionResponse';
import { readQuestionResponse } from '../lib/question-response';

const RichMessage = lazy(() => import('./RichMessage'));
type GenUIContext = { configuration: GenUIConfiguration; sessionId?: string; sessionKey?: string; cwd: string; language: 'zh' | 'en'; onSend: (text: string) => Promise<void> };

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

const Markdown = memo(function Markdown({ text, t, live = false }: { text: string; t: CopyText; live?: boolean }) {
  return <Suspense fallback={<p className="preserve-lines">{text}</p>}><MarkdownBody text={text} t={t} live={live} /></Suspense>;
});

// 长等待（压缩、重试、长回合）要看得出仍在进行：动态标签，5 秒后显示用时，30 秒后解释原因。
function Working({ t, activity, runStartedAt }: { t: CopyText; activity?: Activity; runStartedAt?: number }) {
  const since = activity?.since ?? runStartedAt;
  const start = typeof since === 'number' && Number.isFinite(since) ? since : undefined;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (start === undefined) return; setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [start]);
  const ms = start === undefined ? 0 : Math.max(0, now - start);
  const label = activity?.kind === 'compaction' ? t.compacting : activity?.kind === 'retry' ? `${t.retrying} ${activity.attempt ?? 1}/${activity.maxAttempts ?? 1}` : t.running;
  return <div className="working-indicator"><span className="working-dot" /><span className="shimmer-text" role="status">{label}</span>{ms >= SHOW_ELAPSED_MS && <span className="working-elapsed">{elapsedText(ms)}</span>}{ms >= SLOW_HINT_MS && <span className="working-hint">{t.stillWorking}</span>}</div>;
}

function CollapsedBlock({ block, t, active, stopped, live, onReference }: { block: ContentBlock; t: CopyText; active: boolean; stopped: boolean; live: boolean; onReference?: () => void }) {
  const [open, setOpen] = useState(false);
  const thinking = block.type === 'thinking';
  return <details className={thinking ? 'thinking' : 'tool-call'} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><ChevronRight size={12} aria-hidden="true" /><span className={live ? 'shimmer-text' : undefined}>{thinking ? t.thinking : toolLabel(block.name, t)}</span>{!thinking && active && !stopped && <ToolGenerationRate callId={block.id} />}{!thinking && <span className="tool-call-state">{stopped ? t.stopped : active ? t.running : t.statusLabels.pending}</span>}{!thinking && onReference && <ToolReferenceMenu t={t} onReference={() => onReference()} canReferenceResult={false} />}</summary>
    <Collapse open={open}>{thinking ? <div className="thinking-body" data-reference-kind="text"><Markdown text={block.thinking ?? block.text ?? ''} t={t} live={live} /></div> : <pre data-reference-kind="tool-call" data-reference-call-id={block.id}>{block.argumentsText ?? JSON.stringify(block.arguments, null, 2)}</pre>}</Collapse>
  </details>;
}

const MessageView = memo(function MessageView({ message, t, disabled, active, live, turn, edit, retry, genui, repairs, onReference, sideQuestionThreads, onSideQuestionThread }: { message: Message; t: CopyText; disabled: boolean; active: boolean; live: boolean; turn?: number; edit?: (message: Message) => void; retry?: () => void; genui?: GenUIContext; repairs?: GenUIRepairs; onReference?: (message: Message, block?: ContentBlock) => void; sideQuestionThreads?: SideQuestionThreadSummary[]; onSideQuestionThread?: (id: string) => void }) {
  const text = message.role === 'user' ? displayUserPrompt(messageText(message)) : messageText(message);
  const stopped = isStoppedMessage(message);
  const notice = isSessionNotice(message);
  const response = readQuestionResponse(message);
  const activityOnly = message.role === 'assistant' && !stopped && !message.errorMessage && Array.isArray(message.content) && message.content.length > 0 && message.content.every(block => block?.type === 'thinking' || block?.type === 'toolCall');
  const rich = genui?.configuration.enabled && message.role === 'assistant';
  const renderText = (value: string, key?: number) => {
    const prompt = message.role === 'user' ? parseReferencedPrompt(displayUserPrompt(value)) : { body: value, references: [] };
    return <div key={key} className="message-reference-text"><ReferenceCards references={prompt.references} /><div data-reference-kind="text">{rich ? <Suspense fallback={<Markdown text={value} t={t} live={live} />}><RichMessage text={value} id={key === undefined ? message.id : `${message.id}-${key}`} {...genui!} isStreaming={live} repairs={repairs} /></Suspense> : <Markdown text={prompt.body} t={t} live={live && message.role === 'assistant'} />}</div></div>;
  };
  return <article data-message-id={message.id} className={`message message-${message.role}${notice ? ' message-notice' : ''}${activityOnly ? ' message-activity' : ''}${live ? ' is-streaming' : ''}`}>
    {message.role === 'user' && <div className="message-label">{t.you}</div>}
    {notice && <div className="message-label">{t.sessionNotice}</div>}
    <div className="message-body" data-reference-message-id={message.id}>{response ? <QuestionResponse record={response} t={t} /> : typeof message.content === 'string' ? renderText(message.content) : message.content?.filter(Boolean).map((block, i, blocks) => {
      if (block.type === 'thinking' || block.type === 'toolCall') return <CollapsedBlock block={block} t={t} active={active} stopped={stopped} live={live && block.type === 'thinking' && i === blocks.length - 1} onReference={onReference ? () => onReference(message, block) : undefined} key={block.id ?? i} />;
      if (block.type === 'image') return block.data ? <ZoomableImage className="message-image" key={i} src={`data:${block.mimeType};base64,${block.data}`} alt={t.addImage} /> : null;
      return block.text ? renderText(block.text, i) : null;
    })}</div>
    {(message.errorMessage || stopped) && <p className="message-error" role="status">{message.errorMessage || (message.stopReason === 'aborted' ? t.stopped : t.error)}</p>}
    {((!activityOnly && (text.trim() || (edit && message.entryId) || retry)) || !!sideQuestionThreads?.length) && <div className="message-actions">{turn ? <span className="turn-label">{t.turnNumber.replace('{n}', String(turn))}</span> : null}{text.trim() && <CopyButton className="copy-message" label={t.copy} doneLabel={t.copied} source={() => text} />}{text.trim() && onReference && <button type="button" className="quiet-button" title={t.quoteMessage} onClick={() => onReference(message)}>{t.quote}</button>}{edit && message.entryId && <button className="icon-button" title={t.editMessage} aria-label={t.editMessage} disabled={disabled} onClick={() => edit(message)}><Pencil size={13} /></button>}{retry && <button className="quiet-button" title={t.retryTurn} disabled={disabled} onClick={retry}><RotateCcw size={13} />{t.retryTurn}</button>}<SideQuestionMarkers threads={sideQuestionThreads} onOpen={onSideQuestionThread} /></div>}
  </article>;
});

export default function Transcript({ restoreKey, pinNonce = 0, showTurns = true, messages: source, t, busy, activity, runStartedAt, loadEarlier, loadLater, loadingEarlier = false, onEdit, onRetry, actionsDisabled = false, genui, targetMessageId, onSelection, referenceSource = {}, onReference, sideQuestionThreads, onSideQuestionThread }: { restoreKey: string; pinNonce?: number; showTurns?: boolean; messages: Message[]; t: CopyText; busy: boolean; activity?: Activity; runStartedAt?: number; loadEarlier?: () => void; loadLater?: () => void; loadingEarlier?: boolean; onEdit?: (message: Message) => void; onRetry?: () => void; actionsDisabled?: boolean; genui?: GenUIContext; targetMessageId?: string; onSelection?: (text: string, action: 'quote' | 'note' | 'btw', context?: SelectionContext) => void; referenceSource?: ReferenceSource; onReference?: (references: ConversationReference[]) => void; sideQuestionThreads?: SideQuestionThreadSummary[]; onSideQuestionThread?: (id: string) => void }) {
  const [selection, setSelection] = useState<{ text: string; x: number; y: number; context: SelectionContext } | null>(null);
  const selectionToolbar = useRef<HTMLDivElement>(null);
  const [selectionPosition, setSelectionPosition] = useState({ left: 0, top: 0 });
  const repairs = useMemo(() => genui?.configuration.enabled ? collectGenUIRepairs(source.filter(message => message.role === 'assistant').map(messageText)) : {}, [source, genui?.configuration.enabled]);
  const items = useMemo(() => projectTranscript(source), [source]);
  const working = busy || !!activity;
  // 等待指示作为虚拟列表的最后一行，贴底时它出现和消失都由列表统一跟随。
  const rows = useMemo<Row[]>(() => working ? [...items, { kind: 'working', id: 'working' }] : items, [items, working]);
  const retryId = source[retryMessageIndex(source)]?.id;
  const liveId = busy ? source.at(-1)?.id : undefined;
  // 轮次号：每条用户消息开启新的一轮，其后的回复属于同一轮；更早的历史还没加载时序号不可靠，所以那时不显示。
  const turns = useMemo(() => { const map = new Map<string, number>(); let count = 0; for (const message of source) { if (message.role === 'user') count++; if (count) map.set(message.id, count); } return map; }, [source]);
  const questionMap = useMemo(() => {
    const map = new Map<string, SideQuestionThreadSummary[]>();
    for (const thread of sideQuestionThreads ?? []) {
      if (thread.source.kind !== 'selection') continue;
      const scope = thread.source;
      const start = source.findIndex(message => message.id === scope.messageId);
      const end = source.findIndex(message => message.id === (scope.endMessageId ?? scope.messageId));
      const ids = start >= 0 && end >= start ? source.slice(start, end + 1).map(message => message.id) : [scope.messageId, scope.endMessageId].filter((id): id is string => !!id);
      for (const id of ids) map.set(id, [...(map.get(id) ?? []), thread]);
    }
    return map;
  }, [source, sideQuestionThreads]);
  const referenceMessage = (message: Message, block?: ContentBlock) => {
    const original = source.find(value => value.id === message.id) ?? message;
    onReference?.([block ? createToolCallReference(referenceSource, original, block, loadEarlier ? undefined : turns.get(message.id)) : createMessageReference(referenceSource, original, undefined, loadEarlier ? undefined : turns.get(message.id))]);
  };
  const toolCalls = useMemo(() => {
    const known = new Map<string, { message: Message; block: ContentBlock }>();
    const results = new Map<string, { message: Message; block: ContentBlock }>();
    for (const message of source) {
      if (message.role === 'user') known.clear();
      if (Array.isArray(message.content)) for (const block of message.content) if (block?.type === 'toolCall' && block.id) known.set(block.id, { message, block });
      const owner = message.toolCallId ? known.get(message.toolCallId) : undefined;
      if (owner) results.set(message.id, owner);
    }
    return results;
  }, [source]);
  const referenceTool = (message: Message, kind: 'tool-call' | 'tool-result') => {
    if (kind === 'tool-result') { referenceMessage(message); return; }
    const owner = toolCalls.get(message.id);
    if (owner) { referenceMessage(owner.message, owner.block); return; }
    onReference?.([createToolCallReference(referenceSource, message, undefined, loadEarlier ? undefined : turns.get(message.id))]);
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  const [showJump, setShowJump] = useState(false);
  const followingRef = useRef(true);
  const interruptedTop = useRef(0);
  const resumeIntent = useRef(false);
  // 暂停时用负阈值关闭追加和增高贴底，同时保留虚拟列表的历史插入锚定。
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: i => rows[i].kind === 'tools' ? 52 : rows[i].kind === 'working' ? 44 : 140, overscan: 5, getItemKey: i => rows[i].id, anchorTo: 'end', followOnAppend: following, scrollEndThreshold: following ? 40 : -1 });
  const readSelection = (event: React.PointerEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>) => {
    if ('key' in event && event.key === 'Escape') { setSelection(null); return; }
    const value = window.getSelection(); const root = scrollRef.current;
    if (!value?.rangeCount || !root || !root.contains(value.anchorNode) || !root.contains(value.focusNode) || !value.toString().trim()) { setSelection(null); return; }
    const range = value.getRangeAt(0); const context = readReferenceSelection(range, root, source, referenceSource, loadEarlier ? undefined : turns);
    if (!context) { setSelection(null); return; }
    const rect = Array.from(range.getClientRects()).at(-1) ?? range.getBoundingClientRect();
    setSelection({ text: context.references.map(reference => reference.content).join('\n\n').trim(), context, x: 'clientX' in event ? event.clientX : rect.right, y: 'clientY' in event ? event.clientY : rect.bottom });
  };
  useLayoutEffect(() => { if (selection && selectionToolbar.current) setSelectionPosition(selectionMenuPosition(selection, selectionToolbar.current.getBoundingClientRect(), { width: innerWidth, height: innerHeight })); }, [selection]);
  useEffect(() => {
    if (!selection) return;
    const dismiss = () => setSelection(null);
    const outside = (event: PointerEvent) => { if (!selectionToolbar.current?.contains(event.target as Node)) dismiss(); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape); window.addEventListener('resize', dismiss);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); window.removeEventListener('resize', dismiss); };
  }, [selection]);
  useLayoutEffect(() => { if (!targetMessageId) return; const index = rows.findIndex(row => row.kind === 'message' && row.message.id === targetMessageId); if (index < 0) return; stopFollowing(); virtualizer.scrollToIndex(index, { align: 'center' }); const timer = setTimeout(() => virtualizer.scrollToIndex(index, { align: 'center' }), 100); return () => clearTimeout(timer); }, [targetMessageId, rows.length]);
  const stopFollowing = () => {
    interruptedTop.current = scrollRef.current?.scrollTop ?? 0;
    resumeIntent.current = false;
    followingRef.current = false; setFollowing(false);
    virtualizer.cancelScroll();
    virtualizer.setOptions({ ...virtualizer.options, followOnAppend: false, scrollEndThreshold: -1 });
  };
  const jumpLatest = () => {
    followingRef.current = true; setFollowing(true); setShowJump(false);
    virtualizer.setOptions({ ...virtualizer.options, followOnAppend: true, scrollEndThreshold: 40 });
    positions.set(restoreKey, null);
    virtualizer.scrollToEnd();
  };
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const update = () => setShowJump(element.scrollHeight - element.scrollTop - element.clientHeight > 120);
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    update();
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const saved = positions.get(restoreKey);
    const index = saved ? rows.findIndex(row => row.id === saved.id) : -1;
    const target = index >= 0 ? virtualizer.getOffsetForIndex(index, 'start') : undefined;
    let stop = () => {}; if (saved && target) { stopFollowing(); const el = scrollRef.current!; virtualizer.scrollToIndex(index, { align: 'start' }); let frame = 0; let count = 0; const ctl = new AbortController(); stop = () => { cancelAnimationFrame(frame); ctl.abort(); }; for (const type of ['wheel', 'pointerdown', 'keydown', 'touchstart']) el.addEventListener(type, stop, { signal: ctl.signal, passive: true }); /* shortcut: 未测量的历史行最多校正40帧；虚拟列表支持按锚点初始化后可移除此校正。 */ const aim = () => { const row = el.querySelector<HTMLElement>(`[data-index="${index}"]`); if (row) { const delta = row.getBoundingClientRect().top - el.getBoundingClientRect().top + saved.offset; if (Math.abs(delta) > 1) el.scrollTop += delta; } else virtualizer.scrollToIndex(index, { align: 'start' }); if (++count < 40) frame = requestAnimationFrame(aim); }; frame = requestAnimationFrame(aim); }
    else virtualizer.scrollToEnd();
    return stop;
  }, []);
  // 发送消息时即使正在往上读，也回到最新位置看回复。
  const lastPin = useRef(pinNonce);
  useLayoutEffect(() => { if (lastPin.current === pinNonce) return; lastPin.current = pinNonce; jumpLatest(); }, [pinNonce, virtualizer]);
  return <div className="transcript-frame">
    <div className="transcript" ref={scrollRef} tabIndex={0} onPointerUp={readSelection} onKeyUp={readSelection}
      onWheel={event => { stopFollowing(); resumeIntent.current = event.deltaY > 0; }}
      onTouchStart={() => { stopFollowing(); resumeIntent.current = true; }}
      onPointerDown={event => { const element = event.currentTarget; const box = element.getBoundingClientRect(); if (event.target === element && (event.clientX <= box.left + element.clientLeft || event.clientX >= box.left + element.clientLeft + element.clientWidth)) { stopFollowing(); resumeIntent.current = true; } }}
      onKeyDown={event => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key) && !(event.target as HTMLElement).closest('input, textarea, select, button, summary, [contenteditable="true"]')) { stopFollowing(); resumeIntent.current = ['ArrowDown', 'PageDown', 'End'].includes(event.key) || (event.key === ' ' && !event.shiftKey); } }}
      onScroll={event => {
      if (selection) setSelection(null);
      const el = event.currentTarget;
      const distance = Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight);
      setShowJump(distance > 120);
      if (followingRef.current && distance > 40) { followingRef.current = false; setFollowing(false); }
      if (!followingRef.current && resumeIntent.current && distance <= 1 && el.scrollTop > interruptedTop.current + 1) { followingRef.current = true; resumeIntent.current = false; setFollowing(true); }
      if (distance <= 40 && followingRef.current) { positions.set(restoreKey, null); return; }
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
            const next = rows[item.index + 1];
            const followedByActivity = next?.kind === 'tools' || next?.kind === 'message' && next.message.role === 'assistant' && Array.isArray(next.message.content) && ['thinking', 'toolCall'].includes(next.message.content[0]?.type);
            const rowClass = [row.kind === 'message' && row.message.id === targetMessageId ? 'message-search-target' : '', row.kind === 'message' && row.message.role === 'assistant' && followedByActivity ? 'transcript-before-activity' : ''].filter(Boolean).join(' ');
            return <div key={item.key} data-index={item.index} className={rowClass || undefined} ref={virtualizer.measureElement} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${item.start}px)` }}>{row.kind === 'tools' ? <ToolSteps messages={row.messages} t={t} active={busy} onReference={onReference ? referenceTool : undefined} canReferenceCall={message => toolCalls.has(message.id) || message.args !== undefined} sideQuestionThreads={questionMap} onSideQuestionThread={onSideQuestionThread} /> : row.kind === 'working' ? <Working key={activity?.kind ?? 'run'} t={t} activity={activity} runStartedAt={runStartedAt} /> : <MessageView message={row.message} t={t} disabled={busy || actionsDisabled} active={busy} live={row.message.id === liveId} turn={showTurns && !loadEarlier ? turns.get(row.message.id) : undefined} edit={row.message.role === 'user' ? onEdit : undefined} retry={row.message.id === retryId ? onRetry : undefined} genui={genui} repairs={repairs} onReference={onReference ? referenceMessage : undefined} sideQuestionThreads={questionMap.get(row.message.id)} onSideQuestionThread={onSideQuestionThread} />}</div>;
          })}
        </div>
        {loadLater && <button className="quiet-button history-more" disabled={loadingEarlier} onClick={loadLater}>{loadingEarlier ? t.loading : t.loadLater}</button>}
      </div>
    </div>
    {selection && (onSelection || onReference) && createPortal(<div ref={selectionToolbar} className="selection-actions" style={{ position: 'fixed', bottom: 'auto', ...selectionPosition, maxWidth: 'calc(100vw - 16px)', flexWrap: 'wrap', zIndex: 60 }} role="toolbar" aria-label={t.selectionActions} onPointerDown={event => event.preventDefault()}>{(['quote', 'note', 'btw'] as const).filter(action => action === 'quote' || !!onSelection).map(action => <button key={action} onClick={() => { if (onSelection) onSelection(selection.text, action, selection.context); else if (action === 'quote') onReference?.(selection.context.references); setSelection(null); window.getSelection()?.removeAllRanges(); }}>{action === 'quote' ? t.quote : action === 'note' ? t.annotate : t.sideQuestion}</button>)}<button aria-label={t.closeSelectionActions} onClick={() => setSelection(null)}><X size={13} /></button></div>, document.body)}
    {showJump && <button className="jump-latest" title={t.jumpLatest} aria-label={t.jumpLatest} onClick={jumpLatest}><ArrowDown size={16} /></button>}
  </div>;
}
