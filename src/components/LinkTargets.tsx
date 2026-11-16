import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, FileText, FolderOpen } from 'lucide-react';
import { native, request } from '../lib/bridge';
import { resolveLinkTarget, type LinkTarget } from '../lib/link-target';
import type { Language } from '../lib/types';
import './link-targets.css';

type OpenLink = (href: string, anchor: HTMLElement, x?: number, y?: number, sourceDirectory?: string) => boolean;
type MenuTarget = LinkTarget | { kind: 'invalid'; href: string };
const LinkContext = createContext<OpenLink | undefined>(undefined);
const SourceDirectory = createContext<string | undefined>(undefined);
export function LinkSource({ directory, children }: { directory?: string; children: ReactNode }) { return <SourceDirectory.Provider value={directory}>{children}</SourceDirectory.Provider>; }
export const useTargetMenu = () => useContext(LinkContext);

export function TargetLink({ href, children, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const open = useContext(LinkContext), sourceDirectory = useContext(SourceDirectory);
  return <a {...props} href={href} className={`target-link ${props.className ?? ''}`} onClick={event => {
    onClick?.(event);
    if (!event.defaultPrevented && href && open && !href.startsWith('#')) { event.preventDefault(); event.stopPropagation(); open(href, event.currentTarget, event.clientX, event.clientY, sourceDirectory); }
  }}>{children}</a>;
}

export function LinkTargets({ cwd, language, onOpenFile, children }: { cwd: string; language: Language; onOpenFile: (path: string, line?: number) => void; children: ReactNode }) {
  const [selected, setSelected] = useState<{ target: MenuTarget; anchor: HTMLElement; x: number; y: number }>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [isFile, setIsFile] = useState(false);
  const [checking, setChecking] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const currentSelection = useRef(selected); currentSelection.current = selected;
  const zh = language === 'zh';
  const close = (focus = false) => { if (focus && selected?.anchor.isConnected) selected.anchor.focus({ preventScroll: true }); setSelected(undefined); };
  const open: OpenLink = useCallback((href, anchor, x, y, sourceDirectory) => {
    const target = resolveLinkTarget(href, cwd, sourceDirectory);
    const rect = anchor.getBoundingClientRect();
    setError(target ? '' : zh ? '无法解析这个链接，请确认路径并选择对应项目。' : 'Unable to resolve this link. Check the path and select its project.'); setBusy(false); setIsFile(false);
    setSelected({ target: target ?? { kind: 'invalid', href }, anchor, x: x || rect.left, y: y || rect.bottom });
    return true;
  }, [cwd, zh]);
  useLayoutEffect(() => {
    if (!selected || !menu.current) return;
    const box = menu.current.getBoundingClientRect();
    menu.current.style.left = `${Math.max(8, Math.min(selected.x, innerWidth - box.width - 8))}px`;
    menu.current.style.top = `${Math.max(8, Math.min(selected.y + 5, innerHeight - box.height - 8))}px`;
  }, [selected, isFile, error]);
  useEffect(() => { if (selected) menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true }); }, [selected]);
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setChecking(selected.target.kind === 'file' && native);
    if (selected.target.kind === 'file' && native) void request('system.path_info', { path: selected.target.path }).then(value => { if (!cancelled) setIsFile(value.isFile); }).catch(value => { if (!cancelled) setError(String(value)); }).finally(() => { if (!cancelled) setChecking(false); });
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !selected.anchor.contains(event.target as Node)) close(); };
    const scroll = (event: Event) => { if (!menu.current?.contains(event.target as Node)) close(); };
    const resize = () => close();
    document.addEventListener('pointerdown', outside); document.addEventListener('scroll', scroll, true); window.addEventListener('resize', resize);
    return () => { cancelled = true; document.removeEventListener('pointerdown', outside); document.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', resize); };
  }, [selected]);
  useEffect(() => { close(); }, [cwd]);
  const perform = async (action: 'browser' | 'reveal' | 'view') => {
    if (!selected || selected.target.kind === 'invalid' || busy) return;
    const target = selected.target; setBusy(true); setError('');
    try {
      if (target.kind === 'url') { if (native) await request('system.open_url', { url: target.url }); else window.open(target.url, '_blank', 'noopener,noreferrer'); }
      else if (action === 'view') onOpenFile(target.relative ?? target.path, target.line);
      else await request('system.reveal_path', { path: target.path });
      if (currentSelection.current === selected) close(true);
    } catch (value) { if (currentSelection.current === selected) setError(String(value)); } finally { if (currentSelection.current === selected) setBusy(false); }
  };
  return <LinkContext.Provider value={open}>{children}{selected && createPortal(<div ref={menu} className="link-target-menu ui-menu" role="menu" aria-label={zh ? '打开方式' : 'Open with'} style={{ left: selected.x, top: selected.y }} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
    if (event.key === 'Tab') close();
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); const items = Array.from(menu.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')); const index = items.indexOf(document.activeElement as HTMLButtonElement);
      items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length]?.focus();
    }
  }}>
    <div className="link-target-path">{selected.target.kind === 'url' ? selected.target.url : selected.target.kind === 'file' ? selected.target.path : selected.target.href}</div>
    {selected.target.kind === 'url' ? <button role="menuitem" disabled={busy} onClick={() => void perform('browser')}><ExternalLink size={14} />{zh ? '在系统浏览器中打开' : 'Open in system browser'}</button> : selected.target.kind === 'file' && <>
      <button role="menuitem" disabled={busy} onClick={() => void perform('reveal')}><FolderOpen size={14} />{zh ? '在文件管理器中显示' : 'Show in file manager'}</button>
      {checking && <p className="link-target-status" role="status">{zh ? '正在检查文件…' : 'Checking file…'}</p>}
      {isFile && <button role="menuitem" disabled={busy} onClick={() => void perform('view')}><FileText size={14} />{zh ? '在内置查看器中打开' : 'Open in built-in viewer'}</button>}
    </>}
    {error && <p className="link-target-error" role="alert">{error}</p>}
  </div>, document.body)}</LinkContext.Provider>;
}
