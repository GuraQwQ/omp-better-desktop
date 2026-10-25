import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import './select.css';

type Option = { value: string; label: string; disabled?: boolean };

export default function Select({ value, options, onChange, label, disabled = false }: {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const activeOption = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<CSSProperties>({});
  const enabled = options.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0);

  const show = (index = options.findIndex(option => option.value === value)) => {
    if (disabled || !enabled.length || !trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const below = innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const upwards = below < Math.min(260, options.length * 35 + 10) && above > below;
    const width = Math.min(Math.max(rect.width, 144), innerWidth - 16);
    setPosition({ left: Math.max(8, Math.min(rect.left, innerWidth - width - 8)), width,
      maxHeight: Math.min(260, upwards ? above : below),
      ...(upwards ? { bottom: innerHeight - rect.top + 5 } : { top: rect.bottom + 5 }) });
    setActive(enabled.includes(index) ? index : enabled[0]);
    setOpen(true);
  };
  const choose = (index: number) => {
    if (!options[index] || options[index].disabled) return;
    onChange(options[index].value);
    setOpen(false);
    trigger.current?.focus();
  };
  const keydown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Tab') { setOpen(false); return; }
    if (event.key === 'Escape') { if (open) event.stopPropagation(); setOpen(false); return; }
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!open) { show(event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled.at(-1) : undefined); return; }
      if (event.key === 'Enter' || event.key === ' ') { choose(active); return; }
      const index = enabled.indexOf(active);
      setActive(event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled.at(-1)! : enabled[(index + (event.key === 'ArrowUp' ? -1 : 1) + enabled.length) % enabled.length]);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const ordered = [...enabled.filter(index => index > active), ...enabled.filter(index => index <= active)];
      const match = ordered.find(index => options[index].label.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));
      if (match !== undefined) { event.preventDefault(); if (open) setActive(match); else show(match); }
    }
  };
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false);
    };
    const close = () => setOpen(false);
    const scroll = (event: Event) => { if (!menu.current?.contains(event.target as Node)) close(); };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', close);
    document.addEventListener('scroll', scroll, true);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', close); document.removeEventListener('scroll', scroll, true); };
  }, [open]);
  useEffect(() => { if (open) activeOption.current?.scrollIntoView({ block: 'nearest' }); }, [active, open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  return <div className="select-control">
    <button ref={trigger} id={`${id}-trigger`} type="button" role="combobox" className="select-button" aria-label={label}
      aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? id : undefined}
      aria-activedescendant={open ? `${id}-${active}` : undefined} disabled={disabled || !enabled.length}
      onClick={() => open ? setOpen(false) : show()} onKeyDown={keydown}>
      <span>{options.find(option => option.value === value)?.label ?? value}</span><ChevronDown size={13} />
    </button>
    {open && createPortal(<div ref={menu} id={id} role="listbox" aria-label={label} className="select-menu ui-menu" style={position}>
      {options.map((option, index) => <div key={option.value} id={`${id}-${index}`} role="option"
        ref={active === index ? activeOption : undefined} aria-selected={option.value === value} aria-disabled={option.disabled || undefined}
        className={`select-option ${active === index ? 'is-active' : ''}`} onPointerDown={event => event.preventDefault()}
        onPointerMove={() => { if (!option.disabled) setActive(index); }} onClick={() => choose(index)}>
        <span>{option.label}</span>{option.value === value && <Check size={14} />}
      </div>)}
    </div>, document.body)}
  </div>;
}
