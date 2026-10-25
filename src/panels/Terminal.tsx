import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, TerminalSquare } from 'lucide-react';
import { onDesktopEvent, request } from '../lib/bridge';
import type { Copy } from '../lib/i18n';
import '@xterm/xterm/css/xterm.css';

export default function TerminalPanel({ id, initialCommand = '', t, close, onError }: { id: string; initialCommand?: string; t: Copy; close: (takenOver: boolean) => void; onError: (error: unknown) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const takenOver = useRef(false);
  const [ready, setReady] = useState(false);
  const [command, setCommand] = useState(initialCommand);
  useEffect(() => {
    takenOver.current = false;
    let disposed = false;
    let terminal: import('@xterm/xterm').Terminal | undefined;
    let cleanup: (() => void) | undefined;
    let observer: ResizeObserver | undefined;
    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]);
      if (disposed || !container.current) return;
      terminal = new Terminal({ fontFamily: 'Cascadia Code, Consolas, monospace', fontSize: 13, cursorBlink: true, theme: { background: '#181a1b', foreground: '#e3e5e5' }, scrollback: 3000 });
      const fit = new FitAddon(); terminal.loadAddon(fit); terminal.open(container.current); fit.fit();
      cleanup = await onDesktopEvent(({ sessionId, event }) => {
        if (disposed || sessionId !== id) return;
        if (event.type === 'terminal_data') terminal?.write(event.data);
        if (event.type === 'terminal_exit') { takenOver.current = true; setReady(false); void request('terminal.close', { id }).then(() => close(true)).catch(onError); }
      });
      await request('terminal.open', { id, cols: terminal.cols, rows: terminal.rows });
      takenOver.current = true;
      if (disposed) { await request('terminal.close', { id }); return; }
      setReady(true);
      terminal.onData(data => { request('terminal.write', { id, data }).catch(onError); });
      observer = new ResizeObserver(() => { fit.fit(); if (terminal) request('terminal.resize', { id, cols: terminal.cols, rows: terminal.rows }).catch(onError); });
      observer.observe(container.current); terminal.focus();
    })().catch(error => { onError(error); if (!disposed) close(takenOver.current); });
    return () => { disposed = true; cleanup?.(); observer?.disconnect(); terminal?.dispose(); };
  }, [id]);
  const run = async () => {
    if (!command.trim() || !ready) return;
    try { await request('terminal.write', { id, data: `\x1b[200~${command}\x1b[201~\r` }); setCommand(''); } catch (error) { onError(error); }
  };
  return <div className="terminal-panel"><header><TerminalSquare size={16} /><strong>{t.terminal}</strong><span className="spacer" /><button className="quiet-button" disabled={!ready} onClick={() => request('terminal.close', { id }).then(() => close(takenOver.current)).catch(onError)}><ArrowLeft size={14} />{t.returnToChat}</button></header>{command && <div className="settings-actions"><input aria-label={t.commandArgs} value={command} onChange={event => setCommand(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void run(); }} /><button className="secondary-button" disabled={!ready} onClick={run}>{t.execute}</button></div>}{!ready && <p>{t.loading}</p>}<div className="terminal-container" ref={container} /></div>;
}
