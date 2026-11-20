import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Download, ExternalLink, LoaderCircle } from 'lucide-react';
import { communityEntries, installCommunity, type CommunityFormat } from '../lib/community';
import { request } from '../lib/bridge';
import { localizeError } from '../lib/i18n';
import type { Language } from '../lib/types';
import MotionPresence from './MotionPresence';
import './select.css';
import './community-recommendations.css';

export default function CommunityRecommendations({ resource, sessionId, cwd, language, disabled, onInstalled }: { resource: string; sessionId: string; cwd: string; language: Language; disabled?: boolean; onInstalled: () => Promise<void> }) {
  const zh = language === 'zh';
  const format: CommunityFormat = resource === 'mcp' ? 'mcp' : resource === 'plugins' ? 'plugin' : 'skill';
  const entries = communityEntries.filter(entry => entry.formats.includes(format));
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const active = useRef(true), pending = useRef(false);
  const [position, setPosition] = useState<CSSProperties>();
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const close = (restore = false) => { setPosition(undefined); if (restore) trigger.current?.focus({ preventScroll: true }); };
  const show = () => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(380, innerWidth - 16), below = innerHeight - rect.bottom - 12, above = rect.top - 12;
    const upwards = below < 300 && above > below;
    setPosition({ width, left: Math.max(8, Math.min(rect.right - width, innerWidth - width - 8)), maxHeight: Math.max(120, upwards ? above : below), ...(upwards ? { bottom: innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }), transformOrigin: upwards ? 'bottom right' : 'top right' });
  };
  useEffect(() => {
    if (!position) return;
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close(); };
    const scroll = (event: Event) => { if (!menu.current?.contains(event.target as Node)) close(); };
    const resize = () => close();
    document.addEventListener('pointerdown', outside); document.addEventListener('scroll', scroll, true); window.addEventListener('resize', resize);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', resize); };
  }, [position]);
  const install = async (entry: typeof entries[number], selected: CommunityFormat) => {
    if (pending.current) return;
    pending.current = true; setBusy(`${entry.id}:${selected}`); setError(''); setNotice('');
    try {
      await installCommunity(entry, selected, sessionId, cwd);
      await onInstalled();
      if (active.current) setNotice(zh ? `${entry.name} 已安装，重新连接会话后生效。` : `${entry.name} installed. Reconnect the session to apply.`);
    } catch (value) { if (active.current) setError(localizeError(value instanceof Error ? value.message : String(value), language)); }
    finally { pending.current = false; if (active.current) setBusy(''); }
  };
  return <span className="community-recommendations">
    <button type="button" className="quiet-button" ref={trigger} disabled={disabled || !!busy} aria-haspopup="dialog" aria-expanded={!!position} aria-controls={position ? id : undefined} onClick={() => position ? close() : show()}>{busy ? <LoaderCircle size={14} className="spin" /> : null}{zh ? '社区推荐' : 'Community'}<ChevronDown size={12} /></button>
    {!position && (busy || notice || error) && <span className={`community-feedback ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'}>{busy ? (zh ? '正在下载并安装…' : 'Downloading and installing…') : error || notice}</span>}
    {createPortal(<MotionPresence open={!!position}><div id={id} ref={menu} role="dialog" aria-label={zh ? '社区推荐' : 'Community recommendations'} className="community-menu ui-menu" style={position} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); } }}>
      {entries.map(entry => <section key={entry.id} className="community-entry"><div className="community-entry-heading"><strong>{entry.name}</strong><button type="button" className="quiet-button" aria-label={`${entry.name} ${zh ? '仓库' : 'repository'}`} title={entry.repository} onClick={() => void request('system.open_url', { url: entry.repository }).catch(value => setError(String(value)))}><ExternalLink size={13} />{zh ? '仓库' : 'Repository'}</button></div><p>{entry.description[zh ? 0 : 1]}</p>{entry.formats.includes('plugin') && entry.pluginHint && <p>{entry.pluginHint[zh ? 0 : 1]}</p>}<div className="community-formats">{entry.formats.map(selected => <button key={selected} type="button" className={selected === format ? 'secondary-button' : 'quiet-button'} disabled={!!busy || disabled} aria-label={`${zh ? '下载安装' : 'Install'} ${entry.name} ${selected === 'skill' ? 'Skill' : selected === 'plugin' ? (zh ? '插件' : 'plugin') : 'MCP'}`} onClick={() => void install(entry, selected)}>{busy === `${entry.id}:${selected}` ? <LoaderCircle size={13} className="spin" /> : <Download size={13} />}{zh ? '安装 ' : 'Install '}{selected === 'skill' ? 'Skill' : selected === 'plugin' ? (zh ? '插件' : 'Plugin') : 'MCP'}</button>)}</div></section>)}
      {(busy || notice || error) && <p className={`community-menu-feedback ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'}>{busy ? (zh ? '正在下载并安装…' : 'Downloading and installing…') : error || notice}</p>}
    </div></MotionPresence>, document.body)}
  </span>;
}
