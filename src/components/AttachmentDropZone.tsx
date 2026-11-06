import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { native, request } from '../lib/bridge';
import type { ComposerAttachment } from '../lib/attachments';
import type { Language } from '../lib/types';
import './composer-attachments.css';

export default function AttachmentDropZone({ children, disabled, language, addFiles, addPaths, addPrepared, onError, busy }: {
  children: ReactNode; disabled: boolean; language: Language; busy: boolean;
  addFiles: (files: File[]) => Promise<void>; addPaths: (paths: string[]) => Promise<void>; addPrepared: (items: ComposerAttachment[]) => void; onError: (error: unknown) => void;
}) {
  const zone = useRef<HTMLDivElement>(null);
  const depth = useRef(0);
  const [over, setOver] = useState(false);
  const paste = useRef<{ files: boolean } | null>(null);
  const handlers = useRef({ disabled, addPaths, addPrepared, onError });
  handlers.current = { disabled, addPaths, addPrepared, onError };
  useEffect(() => {
    if (!native) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    void getCurrentWebview().onDragDropEvent(({ payload }) => {
      if (payload.type === 'leave') { setOver(false); return; }
      const rect = zone.current?.getBoundingClientRect();
      const x = payload.position.x / devicePixelRatio, y = payload.position.y / devicePixelRatio;
      const inside = !!rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom && !handlers.current.disabled;
      setOver(inside && payload.type !== 'drop');
      if (inside && payload.type === 'drop') void handlers.current.addPaths(payload.paths).catch(handlers.current.onError);
    }).then(unlisten => { if (disposed) unlisten(); else stop = unlisten; }).catch(onError);
    return () => { disposed = true; stop?.(); };
  }, []);
  const filesDragged = (event: DragEvent) => event.dataTransfer.types.includes('Files');
  return <div ref={zone} className={`attachment-drop-zone${over && !disabled ? ' is-drag-over' : ''}${busy ? ' is-preparing' : ''}`} aria-busy={busy}
    onDragEnter={event => { if (!filesDragged(event)) return; event.preventDefault(); depth.current++; if (!disabled) setOver(true); }}
    onDragOver={event => { if (!filesDragged(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = disabled ? 'none' : 'copy'; }}
    onDragLeave={event => { if (!filesDragged(event)) return; if (--depth.current <= 0) { depth.current = 0; setOver(false); } }}
    onDrop={event => { if (!filesDragged(event)) return; event.preventDefault(); event.stopPropagation(); depth.current = 0; setOver(false); if (!disabled) void addFiles(Array.from(event.dataTransfer.files)).catch(onError); }}
    onPaste={event => {
      const files = Array.from(event.clipboardData.files);
      if (!files.length) return;
      event.preventDefault();
      if (paste.current) paste.current.files = true;
      if (!disabled) void addFiles(files).catch(onError);
    }}
    onKeyDownCapture={event => {
      if (!native || disabled || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'v' || event.altKey || event.repeat) return;
      const current = { files: false }; paste.current = current;
      const insert = addPrepared;
      void request<ComposerAttachment[]>('attachment.clipboard').then(items => { if (!current.files && items.length) insert(items); }).catch(onError);
    }}>
    {children}
    {over && !disabled && <div className="attachment-drop-hint">{language === 'zh' ? '松开以添加附件' : 'Drop to attach'}</div>}
    {busy && <div className="attachment-preparing" role="status">{language === 'zh' ? '正在准备附件…' : 'Preparing attachments…'}</div>}
  </div>;
}
