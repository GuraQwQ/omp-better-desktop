import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import type { Language } from '../lib/types';
import './split-workspace.css';

export default function SplitWorkspace({ children, preview, closePreview, language }: { children: ReactNode; preview: ReactNode; closePreview: () => void; language: Language }) {
  const container = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ pointer: number; ratio: number | null; requested: number } | null>(null);
  const zh = language === 'zh';
  const bounds = () => {
    const width = container.current?.clientWidth ?? 0;
    const minimum = Math.min(280, Math.max(0, width - 8) * .36);
    return { width, min: width ? (minimum + 4) / width : .36, max: width ? 1 - (minimum + 4) / width : .64 };
  };
  const clamp = (value: number) => { const { min, max } = bounds(); return Math.max(min, Math.min(max, value)); };
  const finish = (cancel: boolean) => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    setDragging(false);
    if (handle.current?.hasPointerCapture(current.pointer)) handle.current.releasePointerCapture(current.pointer);
    if (cancel) setRatio(current.ratio);
    else if (current.requested > .82) { setRatio(current.ratio); closePreview(); }
  };
  useEffect(() => {
    if (!preview) { drag.current = null; setDragging(false); return; }
    const observer = new ResizeObserver(() => setRatio(value => clamp(value ?? 1 - 360 / bounds().width)));
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, [!!preview]);
  useEffect(() => {
    if (!dragging) return;
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(true); } };
    const blur = () => finish(true);
    window.addEventListener('keydown', keydown, true);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', keydown, true); window.removeEventListener('blur', blur); };
  }, [dragging]);
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || event.pointerId !== drag.current.pointer) return;
    const rect = container.current!.getBoundingClientRect();
    drag.current.requested = (event.clientX - rect.left) / rect.width;
    setRatio(clamp(drag.current.requested));
    if (drag.current.requested > .82) finish(false);
  };
  const current = ratio ?? (bounds().width ? clamp(1 - 360 / bounds().width) : .64);
  return <div ref={container} className={`split-workspace${preview ? ' has-preview' : ''}${dragging ? ' is-dragging' : ''}`} style={ratio === null ? undefined : { '--split-left': `${ratio * 100}%` } as CSSProperties}>
    {children}
    {preview && <><div ref={handle} className="workspace-divider" role="separator" aria-label={zh ? '调整聊天与预览宽度' : 'Resize chat and preview'} aria-orientation="vertical" aria-valuemin={Math.round(bounds().min * 100)} aria-valuemax={Math.round(bounds().max * 100)} aria-valuenow={Math.round(current * 100)} tabIndex={0}
      onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.focus(); drag.current = { pointer: event.pointerId, ratio, requested: current }; event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); }}
      onPointerMove={move} onPointerUp={() => finish(false)} onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish(true)}
      onDoubleClick={() => setRatio(clamp(.5))} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'].includes(event.key)) return;
        event.preventDefault();
        if (event.key === 'End') { closePreview(); return; }
        setRatio(clamp(event.key === 'Home' || event.key === 'Enter' ? .5 : current + (event.key === 'ArrowRight' ? .025 : -.025)));
      }} />
      <div className="workspace-preview">{preview}{dragging && <div className="preview-drag-shield" />}</div></>}
  </div>;
}
