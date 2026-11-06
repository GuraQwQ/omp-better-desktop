import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronRight, Copy } from 'lucide-react';
import { localizeError } from '../lib/i18n';
import type { Language } from '../lib/types';
import './context-details.css';
import Collapse from './Collapse';

export function Fold({ title, meta, children, onOpen }: { title: string; meta?: string; children: ReactNode; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  return <details className="context-fold" onToggle={event => { if (event.target !== event.currentTarget) return; const value = event.currentTarget.open; setOpen(value); if (value) onOpen?.(); }}>
    <summary><ChevronRight size={14} aria-hidden="true" /><span>{title}</span>{meta && <small>{meta}</small>}</summary>
    <Collapse open={open}><div className="context-fold-body">{children}</div></Collapse>
  </details>;
}

export function Original({ value, language, plain = false }: { value: unknown; language: Language; plain?: boolean }) {
  const [copiedAt, setCopiedAt] = useState(0);
  const copied = copiedAt > 0;
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopiedAt(0), 2500); return () => clearTimeout(timer); }, [copiedAt]);
  const [error, setError] = useState('');
  const source = useMemo(() => plain && typeof value === 'string' ? value : JSON.stringify(value, null, 2), [value, plain]);
  const text = language === 'zh' ? { copy: '复制原文', copied: '已复制' } : { copy: 'Copy original', copied: 'Copied' };
  return <div className="context-original"><div className="context-original-actions"><button className="quiet-button copy-feedback" data-copied={copied} onClick={async () => {
    try { await navigator.clipboard.writeText(source); setCopiedAt(Date.now()); setError(''); } catch (error) { setError(localizeError(String(error), language)); }
  }}><span className="copy-feedback-icons"><Copy size={13} className="copy-idle" /><Check size={13} className="copy-done" /></span>{copied ? text.copied : text.copy}</button></div>{error && <p role="alert">{error}</p>}<pre tabIndex={0}>{source}</pre></div>;
}
