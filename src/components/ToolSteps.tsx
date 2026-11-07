import { useState } from 'react';
import { Check, ChevronRight, LoaderCircle, Square } from 'lucide-react';
import ToolResult from './ToolResult';
import { ToolGenerationRate } from './GenerationRate';
import type { Copy } from '../lib/i18n';
import type { Message } from '../lib/types';
import Collapse from './Collapse';
import type { SideQuestionThreadSummary } from '../lib/side-questions';

export default function ToolSteps({ messages, t, active, onReference, canReferenceCall, sideQuestionThreads, onSideQuestionThread }: { messages: Message[]; t: Copy; active: boolean; onReference?: (message: Message, kind: 'tool-call' | 'tool-result') => void; canReferenceCall?: (message: Message) => boolean; sideQuestionThreads?: Map<string, SideQuestionThreadSummary[]>; onSideQuestionThread?: (id: string) => void }) {
  const [open, setOpen] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const renderTool = (message: Message) => {
    const key = message.toolCallId ?? message.id;
    return <ToolResult key={key} message={message} t={t} active={active} onReference={onReference ? kind => onReference(message, kind) : undefined} canReferenceCall={canReferenceCall?.(message)} sideQuestionThreads={sideQuestionThreads?.get(message.id)} onSideQuestionThread={onSideQuestionThread} expanded={expanded.has(key)} onExpandedChange={next => setExpanded(previous => { const value = new Set(previous); if (next) value.add(key); else value.delete(key); return value; })} />;
  };
  if (messages.length === 1) return renderTool(messages[0]);
  const counts = new Map<string, number>();
  for (const message of messages) {
    const name = message.toolName === 'read' ? t.toolRead : message.toolName === 'edit' ? t.toolEdit : message.toolName === 'write' ? t.toolWrite : message.toolName === 'bash' ? t.toolRun : t.toolOther;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const pending = messages.some(message => message.running);
  const status = pending ? active ? t.running : t.stopped : t.done;
  const groupOpen = open ?? expanded.size > 0;
  return <details className="tool-steps" open={groupOpen} onToggle={event => { if (event.target === event.currentTarget) setOpen(event.currentTarget.open); }}>
    <summary><ChevronRight size={12} aria-hidden="true" /><span>{t.toolSteps.replace('{count}', String(messages.length))}</span><span className="tool-step-counts">{[...counts].map(([name, count]) => <span key={name}>{name} {count}</span>)}</span>{pending && active && <ToolGenerationRate callId={messages.find(message => message.running)?.toolCallId} />}<span className="tool-steps-status" role="img" aria-label={status} title={status}>{pending ? active ? <LoaderCircle className="spin" size={13} /> : <Square size={12} /> : <Check size={13} />}</span></summary>
    <Collapse open={groupOpen}><div className="tool-steps-body">{messages.map(renderTool)}</div></Collapse>
  </details>;
}
