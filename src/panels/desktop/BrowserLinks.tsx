import { useEffect, useRef, useState } from 'react';
import { request } from '../../lib/bridge';
import type { Json } from '../../lib/types';

export default function BrowserLinks({ onError }: { onError: (error: unknown) => void }) {
  const [url, setUrl] = useState('');
  const [links, setLinks] = useState<Json[]>([]);
  const [ready, setReady] = useState(false);
  const [working, setWorking] = useState(false);
  const generation = useRef(0);
  const errorHandler = useRef(onError); errorHandler.current = onError;
  useEffect(() => {
    const scope = ++generation.current;
    void request<Json[] | null>('desktop.state.get', { key: 'browser-history' }).then(value => {
      if (scope === generation.current) { setLinks(value ?? []); setReady(true); }
    }).catch(error => { if (scope === generation.current) errorHandler.current(error); });
    return () => { generation.current++; };
  }, []);
  const open = async (value: string) => {
    const scope = generation.current; setWorking(true);
    try {
      const result = await request<Json>('browser.open', { url: /^[a-z]+:/i.test(value) ? value : `https://${value}` });
      if (scope !== generation.current) return;
      const next = [{ url: result.url, at: Date.now() }, ...links.filter(link => link.url !== result.url)].slice(0, 50);
      await request('desktop.state.set', { key: 'browser-history', value: next });
      if (scope === generation.current) { setLinks(next); setUrl(''); }
    } catch (error) { if (scope === generation.current) errorHandler.current(error); }
    finally { if (scope === generation.current) setWorking(false); }
  };
  const clear = async () => {
    const scope = generation.current; setWorking(true);
    try { await request('desktop.state.set', { key: 'browser-history', value: [] }); if (scope === generation.current) setLinks([]); }
    catch (error) { if (scope === generation.current) errorHandler.current(error); }
    finally { if (scope === generation.current) setWorking(false); }
  };
  return <>
    <p>使用设备上的默认浏览器打开，沿用已有的登录与扩展。</p>
    <form className="desktop-tool-actions" onSubmit={event => { event.preventDefault(); void open(url); }}><input aria-label="网址" placeholder="https://…" value={url} disabled={working} onChange={event => setUrl(event.target.value)} /><button className="primary-button" disabled={!ready || working || !url.trim()}>打开</button></form>
    {links.map(link => <div className="desktop-record" key={link.url}><button className="quiet-button browser-link" disabled={working} onClick={() => void open(link.url)}>{link.url}</button><small>{new Date(link.at).toLocaleString()}</small></div>)}
    {!!links.length && <button className="quiet-button" disabled={working} onClick={() => void clear()}>清空网址历史</button>}
  </>;
}
