import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Quote } from 'lucide-react';
import type { Copy } from '../lib/i18n';
import MotionPresence from './MotionPresence';
import './select.css';
import './tool-reference-menu.css';

export default function ToolReferenceMenu({ t, onReference, canReferenceCall = true, canReferenceResult = true }: {
  t: Copy;
  onReference: (kind: 'tool-call' | 'tool-result') => void;
  canReferenceCall?: boolean;
  canReferenceResult?: boolean;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>();
  const options = ([['tool-call', t.toolReferenceCall, canReferenceCall], ['tool-result', t.toolReferenceResult, canReferenceResult]] as const).filter(([, , enabled]) => enabled);
  const close = (restore = false) => { setPosition(undefined); if (restore) trigger.current?.focus({ preventScroll: true }); };
  const show = () => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect || !options.length) return;
    const width = Math.min(180, innerWidth - 16);
    const height = options.length * 36 + 12;
    const upwards = rect.bottom + height + 8 > innerHeight && rect.top > height;
    setPosition({ left: Math.max(8, Math.min(rect.left, innerWidth - width - 8)), width, ...(upwards ? { bottom: innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }), transformOrigin: upwards ? 'bottom left' : 'top left' });
  };
  useEffect(() => {
    if (!position) return;
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setPosition(undefined); };
    const close = () => setPosition(undefined);
    const scroll = (event: Event) => { if (!menu.current?.contains(event.target as Node)) close(); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', close);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', close); };
  }, [position]);
  const keydown = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
    else if (event.key === 'Tab') { close(true); }
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const items = [...menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? []];
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
      items[next]?.focus();
    }
  };
  return <span className="tool-reference-actions">
    <button ref={trigger} type="button" aria-label={t.toolReference} title={t.toolReference} aria-haspopup="menu" aria-expanded={!!position} aria-controls={position ? id : undefined}
      onClick={event => { event.preventDefault(); event.stopPropagation(); if (position) close(); else show(); }}
      onKeyDown={event => { event.stopPropagation(); if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(); } }}><Quote size={12} aria-hidden="true" /><ChevronDown size={10} aria-hidden="true" /></button>
    {createPortal(<MotionPresence open={!!position}><div id={id} ref={menu} role="menu" aria-label={t.toolReference} className="tool-reference-menu ui-menu" style={position} onKeyDown={keydown}>
      {options.map(([kind, label]) => <button key={kind} type="button" role="menuitem" onClick={event => { event.preventDefault(); event.stopPropagation(); close(true); onReference(kind); }}>{label}</button>)}
    </div></MotionPresence>, document.body)}
  </span>;
}
