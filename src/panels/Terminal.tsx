import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, TerminalSquare } from 'lucide-react';
import { onDesktopEvent, request } from '../lib/bridge';
import type { Copy } from '../lib/i18n';
import '@xterm/xterm/css/xterm.css';

export default function TerminalPanel({ id, t, close, onError }: { id: string; t: Copy; close: () => void; onError: (error: unknown) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false;
    let terminal: import('@xterm/xterm').Terminal | undefined;
    let cleanup: (() => void) | undefined;
    let observer: ResizeObserver | undefined;
    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]);
      if (disposed || !container.current) return;
      terminal = new Terminal({ fontFamily: 'Cascadia Code, Consolas, monospace', fontSize: 13, cursorBlink: true, theme: { background: '#181a1b', foreground: '#e3e5e5' }, scrollback: 3000 });
      const fit = new FitAddon(); terminal.loadAddon(fit); terminal.open(container.current); fit.fit();
      cleanup = await onDesktopEvent(({ sessionId, event }) => { if (sessionId === id && event.type === 'terminal_data') terminal?.write(event.data); });
      await request('terminal.open', { id, cols: terminal.cols, rows: terminal.rows });
      if (disposed) { await request('terminal.close', { id }); return; }
      setReady(true);
      terminal.onData(data => { request('terminal.write', { id, data }).catch(onError); });
      observer = new ResizeObserver(() => { fit.fit(); if (terminal) request('terminal.resize', { id, cols: terminal.cols, rows: terminal.rows }).catch(onError); });
      observer.observe(container.current); terminal.focus();
    })().catch(onError);
    return () => { disposed = true; cleanup?.(); observer?.disconnect(); terminal?.dispose(); };
  }, [id]);
  return <div className="terminal-panel"><header><TerminalSquare size={16} /><strong>{t.terminal}</strong><span className="spacer" /><button className="quiet-button" onClick={() => request('terminal.close', { id }).then(close).catch(onError)}><ArrowLeft size={14} />{t.returnToChat}</button></header>{!ready && <p>{t.loading}</p>}<div className="terminal-container" ref={container} /></div>;
}
