import { useEffect, useLayoutEffect, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Copy, Minus, Square, X } from 'lucide-react';
import { native } from '../lib/bridge';
import './window-chrome.css';

// 工作区的面包屑与操作按钮渲染进标题栏的 #window-slot，把原来的两行合成一行。
export function WindowSlot({ inert, children }: { inert?: boolean; children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { setSlot(document.getElementById('window-slot')); }, []);
  return slot ? createPortal(<div className="workspace-header" inert={inert}>{children}</div>, slot) : null;
}

export default function WindowChrome({ language }: { language: 'zh' | 'en' }) {
  const [maximized, setMaximized] = useState(false);
  const [failed, setFailed] = useState(false);
  const zh = language === 'zh';
  const labels = zh
    ? { bar: '窗口标题栏', minimize: '最小化', maximize: '最大化', restore: '还原窗口', close: '关闭窗口', error: '窗口操作失败，请重试。' }
    : { bar: 'Window title bar', minimize: 'Minimize', maximize: 'Maximize', restore: 'Restore window', close: 'Close window', error: 'Window action failed. Try again.' };
  const failure = (error: unknown) => { console.error(error); setFailed(true); };
  const act = async (action: () => Promise<void>) => {
    if (!native) return;
    setFailed(false);
    try { await action(); } catch (error) { failure(error); }
  };
  const toggle = () => act(async () => {
    const current = getCurrentWindow();
    await current.toggleMaximize();
    setMaximized(await current.isMaximized());
  });
  useEffect(() => {
    if (!native) return;
    const current = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const refresh = () => current.isMaximized().then(value => { if (!disposed) setMaximized(value); }).catch(error => { if (!disposed) failure(error); });
    void refresh();
    void current.onResized(refresh).then(stop => { if (disposed) stop(); else unlisten = stop; }).catch(error => { if (!disposed) failure(error); });
    return () => { disposed = true; unlisten?.(); };
  }, []);
  // 整条标题栏都是拖拽区；按钮、菜单等可交互元素除外。
  const drag = (event: MouseEvent<HTMLElement>) => {
    if (!native || event.button !== 0 || (event.target as Element).closest('button, summary, input, a, .ui-menu')) return;
    if (event.detail === 2) void toggle();
    else void act(() => getCurrentWindow().startDragging());
  };
  const maximizeLabel = maximized ? labels.restore : labels.maximize;
  return <header className="window-chrome" aria-label={labels.bar} onMouseDown={drag}>
    <div className="window-drag-region"><span>Better OMP Desktop</span>{failed && <span className="window-action-error" role="status">{labels.error}</span>}</div>
    <div id="window-slot" className="window-slot" />
    <div className="window-controls">
      <button type="button" aria-label={labels.minimize} title={labels.minimize} disabled={!native} onClick={() => void act(() => getCurrentWindow().minimize())}><Minus size={14} /></button>
      <button type="button" aria-label={maximizeLabel} title={maximizeLabel} aria-pressed={maximized} disabled={!native} onClick={() => void toggle()}>{maximized ? <Copy size={12} /> : <Square size={12} />}</button>
      <button type="button" className="window-close" aria-label={labels.close} title={labels.close} disabled={!native} onClick={() => void act(() => getCurrentWindow().close())}><X size={15} /></button>
    </div>
  </header>;
}
