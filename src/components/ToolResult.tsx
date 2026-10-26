import { useState } from 'react';
import { Check, ChevronRight, FileDiff, FileText, LoaderCircle, Square, TerminalSquare, X } from 'lucide-react';
import { messageText } from '../lib/session-state';
import { toolFailed } from '../lib/transcript-items';
import type { Copy } from '../lib/i18n';
import type { Json, Message } from '../lib/types';
import './tool-result.css';

const record = (value: unknown): Json => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
const text = (value: unknown): string => typeof value === 'string' ? value : '';
export const toolLabel = (name: string | undefined, t: Copy): string => name === 'read' ? t.toolRead : name === 'edit' ? t.toolEdit : name === 'bash' ? t.toolRun : name ?? t.tool;

function Output({ value, t, diff = false, numberAt }: { value: string; t: Copy; diff?: boolean; numberAt?: (index: number) => number | null | undefined }) {
  const [pages, setPages] = useState(1);
  const lines = value.slice(0, pages * 12_000).split('\n').slice(0, pages * 80);
  const more = lines.join('\n').length < value.length;
  return <>
    <pre className="tool-preview"><code>{lines.map((line, index) => <span key={index} className={`tool-output-line ${diff ? line.startsWith('@@') ? 'hunk' : line.startsWith('+') && !line.startsWith('+++') ? 'added' : line.startsWith('-') && !line.startsWith('---') ? 'removed' : '' : ''}`}>{numberAt && <span className="tool-line-number" aria-hidden="true">{numberAt(index)}</span>}{line || ' '}</span>)}</code></pre>
    {(more || pages > 1) && <div className="tool-preview-actions">{more && <button type="button" className="quiet-button" onClick={() => setPages(count => count + 1)}>{t.toolShowMore}</button>}{pages > 1 && <button type="button" className="quiet-button" onClick={() => setPages(1)}>{t.toolShowLess}</button>}</div>}
  </>;
}

function RawOutput({ message, t }: { message: Message; t: Copy }) {
  const [open, setOpen] = useState(false);
  return <details className="tool-raw" onToggle={event => setOpen(event.currentTarget.open)}><summary><ChevronRight size={12} />{t.toolRawOutput}</summary>{open && <Output value={JSON.stringify({ args: message.args, result: message.result ?? { content: message.content, details: message.details }, partialResult: message.partialResult }, null, 2)} t={t} />}</details>;
}

function ToolBody({ message, t, active }: { message: Message; t: Copy; active: boolean }) {
  const args = record(message.args);
  const result = record(message.result ?? message.partialResult);
  const details = record(result.details ?? message.details);
  const kind = message.toolName;
  const output = messageText(message);
  const path = text(details.resolvedPath) || text(details.finalUrl) || text(details.url) || text(details.path) || text(args.path);
  const command = text(args.command);
  const files: Json[] = Array.isArray(details.perFileResults) ? details.perFileResults.map(record) : [];
  const failed = toolFailed(message);
  const exitCode = typeof details.exitCode === 'number' && Number.isFinite(details.exitCode) ? details.exitCode : !message.running && !failed && !details.async && !details.service && !details.timedOut ? 0 : null;
  const display = record(details.displayContent);
  const readText = !failed && typeof display.text === 'string' ? display.text : output;
  const numbers = Array.isArray(display.lineNumbers) ? display.lineNumbers : undefined;
  const numberAt = !failed && numbers ? (index: number) => typeof numbers[index] === 'number' ? numbers[index] : null : !failed && typeof display.startLine === 'number' && display.startLine > 0 ? (index: number) => display.startLine + index : undefined;
  const diffs = files.length ? files : [{ path, diff: text(details.diff), firstChangedLine: details.firstChangedLine }];
  const hasDiff = kind === 'edit' && diffs.some(file => text(file.diff));
  const images = Array.isArray(message.content) ? message.content.filter(block => block.type === 'image' && block.data && block.mimeType) : [];
  return <div className="tool-result-body">
      {kind === 'bash' && <div className="tool-command-row">{command && <code className="tool-command">$ {command.length > 12_000 ? `${command.slice(0, 12_000)}…` : command}</code>}{exitCode !== null && <span className={`tool-exit ${exitCode !== 0 ? 'is-error' : ''}`}>{t.toolExitCode}: {exitCode}</span>}</div>}
      {kind === 'read' && path && <div className="tool-file-heading"><code title={path}>{path}</code></div>}
      {hasDiff ? <>{failed && output && <Output value={output} t={t} />}{diffs.map((file, index) => <section className="tool-file-change" key={index}><div className="tool-file-heading"><code>{text(file.path) || path}</code>{typeof file.firstChangedLine === 'number' && <span>:{file.firstChangedLine}</span>}</div>{file.isError && (file.displayErrorText || file.errorText) && <Output value={text(file.displayErrorText) || text(file.errorText)} t={t} />}<Output value={text(file.diff)} t={t} diff /></section>)}</> : <Output value={(kind === 'read' ? readText : output) || (message.running ? active ? t.loading : t.stopped : t.emptyOutput)} t={t} numberAt={kind === 'read' && readText ? numberAt : undefined} />}
      {images.map((image, index) => <img className="message-image tool-result-image" key={index} src={`data:${image.mimeType};base64,${image.data}`} alt={path || t.output} />)}
      <RawOutput message={message} t={t} />
  </div>;
}

export default function ToolResult({ message, t, active = true, expanded, onExpandedChange }: { message: Message; t: Copy; active?: boolean; expanded?: boolean; onExpandedChange?: (open: boolean) => void }) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = expanded ?? ownOpen;
  const args = record(message.args);
  const result = record(message.result ?? message.partialResult);
  const details = record(result.details ?? message.details);
  const kind = message.toolName;
  const path = text(details.resolvedPath) || text(details.finalUrl) || text(details.url) || text(details.path) || text(args.path);
  const firstText = typeof message.content === 'string' ? message.content : message.content?.find(block => block?.type === 'text')?.text ?? '';
  const summary = (kind === 'bash' ? text(args.command) : path) || firstText.split('\n', 1)[0] || '';
  const failed = toolFailed(message);
  const running = !!message.running && active;
  const stopped = !!message.running && !active;
  const status = failed ? t.statusLabels.error : running ? t.running : stopped ? t.stopped : t.done;
  const Icon = kind === 'read' ? FileText : kind === 'edit' ? FileDiff : TerminalSquare;
  return <details className={`tool-result tool-structured ${failed ? 'is-error' : ''}`} open={open} onToggle={event => { if (event.target !== event.currentTarget) return; const next = event.currentTarget.open; setOwnOpen(next); onExpandedChange?.(next); }}>
    <summary><ChevronRight size={12} aria-hidden="true" /><Icon size={14} aria-hidden="true" /><strong>{toolLabel(kind, t)}</strong><span className="tool-summary" title={summary.slice(0, 240)}>{summary.slice(0, 140)}</span><span className="tool-result-status" role="img" aria-label={status} title={status}>{failed ? <X size={13} /> : running ? <LoaderCircle className="spin" size={13} /> : stopped ? <Square size={12} /> : <Check size={13} />}</span></summary>
    {open && <ToolBody message={message} t={t} active={active} />}
  </details>;
}
