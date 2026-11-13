import { useEffect, useLayoutEffect, useRef, useState, type ComponentPropsWithoutRef, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Maximize, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { Language } from '../lib/types';
import './image-preview.css';

const labels = {
  zh: { open: '放大图片', title: '图片预览', close: '关闭图片预览', zoomIn: '放大', zoomOut: '缩小', fit: '适应窗口', actual: '原始尺寸', loading: '正在载入图片…', failed: '图片未能载入。', retry: '重新载入', hint: '滚轮缩放 · 拖动查看 · Esc 关闭' },
  en: { open: 'Enlarge image', title: 'Image preview', close: 'Close image preview', zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit to window', actual: 'Actual size', loading: 'Loading image…', failed: 'The image could not be loaded.', retry: 'Reload', hint: 'Scroll to zoom · Drag to pan · Esc to close' },
};

export function ImagePreview({ src, alt, language, close }: { src: string; alt: string; language: Language; close: () => void }) {
  const t = labels[language];
  const dialog = useRef<HTMLDialogElement>(null), stage = useRef<HTMLDivElement>(null), image = useRef<HTMLImageElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 }), [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState<number | null>(null), [error, setError] = useState(false), [attempt, setAttempt] = useState(0), [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null);
  const anchor = useRef<{ x: number; y: number; clientX: number; clientY: number } | null>(null);
  const loaded = size.width > 0 && !error;
  const fit = loaded && viewport.width && viewport.height ? Math.min(1, viewport.width / size.width, viewport.height / size.height) : 1;
  const scale = zoom ?? fit;
  const minimum = Math.min(fit, .1);
  const stopDrag = () => {
    const current = drag.current; drag.current = null; setDragging(false);
    if (current && stage.current?.hasPointerCapture(current.id)) stage.current.releasePointerCapture(current.id);
  };
  useLayoutEffect(() => {
    const element = dialog.current!, container = stage.current!, previous = document.activeElement;
    element.showModal();
    const observer = new ResizeObserver(() => setViewport({ width: container.clientWidth, height: container.clientHeight }));
    observer.observe(container);
    window.addEventListener('blur', stopDrag);
    return () => { observer.disconnect(); window.removeEventListener('blur', stopDrag); element.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  const changeZoom = (next: number | null, point?: { clientX: number; clientY: number }) => {
    if (!loaded || !image.current || !stage.current) return;
    const box = image.current.getBoundingClientRect(), bounds = stage.current.getBoundingClientRect();
    const clientX = point?.clientX ?? bounds.left + bounds.width / 2, clientY = point?.clientY ?? bounds.top + bounds.height / 2;
    anchor.current = { x: Math.min(1, Math.max(0, (clientX - box.left) / box.width)), y: Math.min(1, Math.max(0, (clientY - box.top) / box.height)), clientX, clientY };
    setZoom(next === null ? null : Math.min(8, Math.max(minimum, next)));
  };
  useLayoutEffect(() => {
    const point = anchor.current;
    if (!point || !image.current || !stage.current) return;
    const box = image.current.getBoundingClientRect();
    stage.current.scrollLeft += box.left + box.width * point.x - point.clientX;
    stage.current.scrollTop += box.top + box.height * point.y - point.clientY;
    anchor.current = null;
  }, [scale]);
  useEffect(() => {
    const container = stage.current!;
    const wheel = (event: WheelEvent) => { event.preventDefault(); if (event.deltaY) changeZoom(scale * (event.deltaY < 0 ? 1.2 : 1 / 1.2), event); };
    container.addEventListener('wheel', wheel, { passive: false });
    return () => container.removeEventListener('wheel', wheel);
  }, [loaded, scale, minimum]);
  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    if (!loaded || event.button !== 0 || drag.current || container.scrollWidth <= container.clientWidth && container.scrollHeight <= container.clientHeight) return;
    event.preventDefault();
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: container.scrollLeft, top: container.scrollTop };
    container.setPointerCapture(event.pointerId); setDragging(true);
  };
  return createPortal(<dialog ref={dialog} className="image-preview-dialog" aria-label={t.title} onCancel={event => { event.preventDefault(); event.stopPropagation(); close(); }} onClick={event => { event.stopPropagation(); if (event.target === dialog.current) close(); }} onKeyDown={event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (event.key === '+' || event.key === '=') { event.preventDefault(); changeZoom(scale * 1.2); }
    else if (event.key === '-') { event.preventDefault(); changeZoom(scale / 1.2); }
    else if (event.key === '0') { event.preventDefault(); changeZoom(null); }
  }}>
    <header><span className="image-preview-title" title={alt}>{alt || t.title}</span><div className="image-preview-actions">
      <button type="button" className="icon-button" title={t.zoomOut} aria-label={t.zoomOut} disabled={!loaded || scale <= minimum} onClick={() => changeZoom(scale / 1.2)}><ZoomOut size={17} /></button>
      <output aria-live="polite">{loaded ? `${Math.round(scale * 100)}%` : '—'}</output>
      <button type="button" className="icon-button" title={t.zoomIn} aria-label={t.zoomIn} disabled={!loaded || scale >= 8} onClick={() => changeZoom(scale * 1.2)}><ZoomIn size={17} /></button>
      <button type="button" className="icon-button" title={t.fit} aria-label={t.fit} disabled={!loaded} onClick={() => changeZoom(null)}><Maximize size={17} /></button>
      <button type="button" className="quiet-button" title={t.actual} aria-label={t.actual} disabled={!loaded} onClick={() => changeZoom(1)}>1:1</button>
      <button type="button" autoFocus className="icon-button" title={t.close} aria-label={t.close} onClick={close}><X size={18} /></button>
    </div></header>
    <div ref={stage} className="image-preview-stage" tabIndex={0} aria-label={t.hint} data-dragging={dragging || undefined} onPointerDown={startDrag} onPointerMove={event => {
      const current = drag.current;
      if (current?.id === event.pointerId) { event.currentTarget.scrollLeft = current.left + current.x - event.clientX; event.currentTarget.scrollTop = current.top + current.y - event.clientY; }
    }} onPointerUp={event => { if (drag.current?.id === event.pointerId) stopDrag(); }} onPointerCancel={event => { if (drag.current?.id === event.pointerId) stopDrag(); }} onLostPointerCapture={stopDrag}>
      {error ? <div className="image-preview-status" role="alert"><p>{t.failed}</p><button type="button" className="secondary-button" onClick={() => { setError(false); setSize({ width: 0, height: 0 }); setZoom(null); setAttempt(value => value + 1); }}><RotateCcw size={14} />{t.retry}</button></div> : <div className="image-preview-canvas" style={loaded ? { width: size.width * scale, height: size.height * scale } : undefined}>
        {!loaded && <p className="image-preview-status" role="status">{t.loading}</p>}
        <img key={attempt} ref={image} src={src} alt={alt} draggable={false} style={loaded ? { width: size.width * scale, height: size.height * scale } : { visibility: 'hidden', position: 'absolute' }} onLoad={event => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => setError(true)} />
      </div>}
    </div>
    <footer>{t.hint}</footer>
  </dialog>, document.body);
}

export default function ZoomableImage({ language, onClick, onKeyDown, className = '', alt = '', ...props }: ComponentPropsWithoutRef<'img'> & { language?: Language }) {
  const [opened, setOpened] = useState<string | null>(null);
  const currentLanguage = language ?? (document.documentElement.lang.startsWith('zh') ? 'zh' : 'en');
  return <><img {...props} alt={alt} className={`${className} image-preview-trigger`} role="button" tabIndex={0} aria-haspopup="dialog" aria-label={`${labels[currentLanguage].open}${alt ? `：${alt}` : ''}`} onClick={event => {
    onClick?.(event); event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true }); setOpened(event.currentTarget.currentSrc || event.currentTarget.src);
  }} onKeyDown={event => {
    onKeyDown?.(event);
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); setOpened(event.currentTarget.currentSrc || event.currentTarget.src); }
  }} />{opened && <ImagePreview key={opened} src={opened} alt={alt} language={currentLanguage} close={() => setOpened(null)} />}</>;
}
