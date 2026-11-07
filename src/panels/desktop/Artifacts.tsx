import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Plus, RefreshCw, X } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { native, pickPath, request } from '../../lib/bridge';
import { copy } from '../../lib/i18n';
import type { Json } from '../../lib/types';

const Markdown = lazy(() => import('../../components/MarkdownBody'));

export default function Artifacts({ cwd, onError }: { cwd: string; onError: (error: unknown) => void }) {
  const [items, setItems] = useState<Json[]>([]);
  const [selected, setSelected] = useState<Json | null>(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const generation = useRef(0);
  const listRevision = useRef(0);
  const detailRevision = useRef(0);
  const errorHandler = useRef(onError); errorHandler.current = onError;

  const reload = async () => {
    const scope = generation.current;
    const revision = ++listRevision.current;
    const result = await request<{ items: Json[] }>('artifact.list', { cwd });
    if (scope === generation.current && revision === listRevision.current) setItems(result.items);
  };
  useEffect(() => {
    const scope = ++generation.current;
    setItems([]); setSelected(null); setLoading(false); setWorking(false);
    void reload().catch(error => { if (scope === generation.current) errorHandler.current(error); });
    return () => { generation.current++; detailRevision.current++; listRevision.current++; };
  }, [cwd]);

  const open = async (id: string) => {
    const scope = generation.current;
    const revision = ++detailRevision.current;
    setLoading(true); setSelected(null);
    try {
      const item = await request<Json>('artifact.read', { id });
      if (scope === generation.current && revision === detailRevision.current) setSelected(item);
    } catch (error) { if (scope === generation.current && revision === detailRevision.current) errorHandler.current(error); }
    finally { if (scope === generation.current && revision === detailRevision.current) setLoading(false); }
  };
  const add = async () => {
    const scope = generation.current; setWorking(true);
    try {
      const path = await pickPath(false);
      if (!path || scope !== generation.current) return;
      const revision = ++listRevision.current;
      const result = await request<{ items: Json[] }>('artifact.add', { cwd, path });
      if (scope !== generation.current || revision !== listRevision.current) return;
      setItems(result.items);
      const item = result.items.find(item => item.path.replaceAll('\\', '/').toLowerCase() === path.replaceAll('\\', '/').toLowerCase());
      if (item) await open(item.id);
    } catch (error) { if (scope === generation.current) errorHandler.current(error); }
    finally { if (scope === generation.current) setWorking(false); }
  };
  const remove = async (id: string) => {
    const scope = generation.current; setWorking(true);
    try {
      listRevision.current++; detailRevision.current++; setLoading(false);
      await request('artifact.remove', { id });
      if (scope !== generation.current) return;
      if (selected?.id === id) { detailRevision.current++; setSelected(null); setLoading(false); }
      await reload();
    } catch (error) { if (scope === generation.current) errorHandler.current(error); }
    finally { if (scope === generation.current) setWorking(false); }
  };

  return <>
    <div className="desktop-tool-actions"><button className="quiet-button" disabled={working} onClick={() => void add()}><Plus size={14} />登记文件</button><button className="quiet-button" disabled={working} onClick={() => { const scope = generation.current; void reload().catch(error => { if (scope === generation.current) errorHandler.current(error); }); }}><RefreshCw size={14} />刷新</button></div>
    <p className="desktop-tool-hint">保存 HTML、图片和 Markdown 文件到项目后，可登记为产物或常用工具。</p>
    <div className="artifact-list">{items.map(item => <div key={item.id}><button className={selected?.id === item.id ? 'active' : ''} disabled={working} onClick={() => void open(item.id)}>{item.name}<small>{item.kind}</small></button><button className="icon-button" disabled={working} aria-label={`移除登记 ${item.name}`} onClick={() => void remove(item.id)}><X size={12} /></button></div>)}</div>
    {!items.length && <p>尚未登记文件。</p>}{loading && <p role="status">正在读取…</p>}
    {selected && <section className="artifact-preview"><h3>{selected.name}</h3><code>{selected.path}</code>{selected.kind === 'html'
      ? <iframe title={selected.name} sandbox="allow-scripts" src={native ? convertFileSrc(selected.id, 'artifact') : `data:text/html;charset=utf-8,${encodeURIComponent(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none';">${selected.content}`)}`} />
      : selected.kind === 'image' ? <img src={selected.content} alt={selected.name} />
        : selected.kind === 'markdown' ? <Suspense fallback={<pre>{selected.content}</pre>}><Markdown text={selected.content} t={copy('zh')} /></Suspense>
          : <pre>{selected.content}</pre>}</section>}
  </>;
}
