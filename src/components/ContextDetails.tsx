import { useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronRight, Copy } from 'lucide-react';
import { localizeError } from '../lib/i18n';
import type { Language } from '../lib/types';
import './context-details.css';

export function Fold({ title, meta, children, onOpen }: { title: string; meta?: string; children: ReactNode; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  return <details className="context-fold" onToggle={event => { if (event.target !== event.currentTarget) return; const value = event.currentTarget.open; setOpen(value); if (value) onOpen?.(); }}>
    <summary><ChevronRight size={14} aria-hidden="true" /><span>{title}</span>{meta && <small>{meta}</small>}</summary>
    {open && <div className="context-fold-body">{children}</div>}
  </details>;
}

export function Original({ value, language, plain = false }: { value: unknown; language: Language; plain?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const source = useMemo(() => plain && typeof value === 'string' ? value : JSON.stringify(value, null, 2), [value, plain]);
  const text = language === 'zh' ? { copy: '复制原文', copied: '已复制' } : { copy: 'Copy original', copied: 'Copied' };
  return <div className="context-original"><div className="context-original-actions"><button className="quiet-button" onClick={async () => {
    try { await navigator.clipboard.writeText(source); setCopied(true); setError(''); } catch (error) { setError(localizeError(String(error), language)); }
  }}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? text.copied : text.copy}</button></div>{error && <p role="alert">{error}</p>}<pre tabIndex={0}>{source}</pre></div>;
}
