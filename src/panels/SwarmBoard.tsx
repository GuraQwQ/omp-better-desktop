import { type CSSProperties, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, Bot, ListFilter, Search, X } from 'lucide-react';
import Select from '../components/Select';
import { filterBoard, postSummary, type BoardFilter, type BoardPost } from './swarm-view';
import SwarmPostBody from './SwarmPostBody';

type Props = { posts: BoardPost[]; memberNames: string[]; zh: boolean; memberFilter: string; onMemberFilter: (name: string) => void; onReply: (name: string, sequence?: number) => void; active: boolean; directory?: string; sequence?: number; onSequenceLocated?: () => void };
export default function SwarmBoard({ posts, memberNames, zh, memberFilter, onMemberFilter, onReply, active, directory, sequence, onSequenceLocated }: Props) {
  const [query, setQuery] = useState(''), [sender, setSender] = useState(''), [recipient, setRecipient] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false), [highlight, setHighlight] = useState<number>();
  const [jumpRevision, setJumpRevision] = useState(0);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [seen, setSeen] = useState(posts.at(-1)?.seq ?? 0), [nearEnd, setNearEnd] = useState(true);
  const scroll = useRef<HTMLDivElement>(null), rows = useRef(new Map<number, HTMLLIElement>());
  const following = useRef(true), pendingJump = useRef<number | undefined>(undefined);
  const id = useId();
  const filter: BoardFilter = { query, sender, recipient, member: memberFilter };
  const visible = useMemo(() => filterBoard(posts, filter), [posts, query, sender, recipient, memberFilter]);
  const latest = posts.at(-1)?.seq ?? 0;
  const unread = posts.filter(post => post.seq > seen).length;
  const names = [...new Set([...memberNames, ...posts.flatMap(post => [post.sender, ...post.recipients])])];
  const filtered = !!(query || sender || recipient || memberFilter);

  function jumpLatest() {
    const element = scroll.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    following.current = true; setNearEnd(true); setSeen(latest);
  }
  function locate(sequence: number) {
    if (!posts.some(post => post.seq === sequence)) return;
    pendingJump.current = sequence;
    setQuery(''); setSender(''); setRecipient(''); onMemberFilter(''); setHighlight(sequence);
    setExpanded(previous => new Set(previous).add(sequence));
    setJumpRevision(value => value + 1);
  }
  useEffect(() => { if (active && sequence !== undefined) { locate(sequence); onSequenceLocated?.(); } }, [sequence, active]);
  useLayoutEffect(() => {
    if (!active) return;
    if (pendingJump.current !== undefined) {
      const row = rows.current.get(pendingJump.current), element = scroll.current;
      if (row && element) { element.scrollTop += row.getBoundingClientRect().top - element.getBoundingClientRect().top - 12; following.current = false; setNearEnd(false); }
      pendingJump.current = undefined;
    } else if (following.current && !filtered) jumpLatest();
  }, [latest, active, query, sender, recipient, memberFilter, highlight, jumpRevision]);
  useEffect(() => { if (highlight === undefined) return; const timer = setTimeout(() => setHighlight(undefined), 1800); return () => clearTimeout(timer); }, [highlight]);

  return <div className="swarm-board-view">
    <div className="swarm-board-search"><label><Search size={14} /><input type="search" aria-label={zh ? '搜索看板' : 'Search board'} value={query} onChange={event => setQuery(event.target.value)} placeholder={zh ? '搜索' : 'Search'} /></label><button className={`icon-button ${filtersOpen ? 'active' : ''}`} aria-label={zh ? '筛选消息' : 'Filter messages'} aria-expanded={filtersOpen} aria-controls={`${id}-filters`} onClick={() => setFiltersOpen(value => !value)}><ListFilter size={15} /></button></div>
    {filtersOpen && <div className="swarm-board-filters" id={`${id}-filters`}><Select label={zh ? '发送者' : 'Sender'} value={sender} onChange={setSender} options={[{ value: '', label: zh ? '所有发送者' : 'All senders' }, ...names.map(name => ({ value: name, label: name }))]} /><Select label={zh ? '收件人' : 'Recipient'} value={recipient} onChange={setRecipient} options={[{ value: '', label: zh ? '所有收件人' : 'All recipients' }, ...names.map(name => ({ value: name, label: name }))]} /></div>}
    {filtered && <div className="swarm-filter-summary"><span>{memberFilter ? `@${memberFilter} · ` : ''}{zh ? `${visible.length} 条匹配` : `${visible.length} matches`}</span><button className="quiet-button" onClick={() => { setQuery(''); setSender(''); setRecipient(''); onMemberFilter(''); }}><X size={12} />{zh ? '清除筛选' : 'Clear filters'}</button></div>}
    <div className="swarm-board-scroll" ref={scroll} onScroll={() => {
      const element = scroll.current; if (!element) return;
      const close = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
      following.current = close; setNearEnd(close); if (close && !filtered) setSeen(latest);
    }}>
      {visible.length ? <ol>{visible.map(post => {
        const long = post.text.length > 520 || post.text.split('\n').length > 9;
        const open = expanded.has(post.seq), contentId = `${id}-post-${post.seq}`;
        const hue = Array.from(post.sender).reduce((value, character) => (value * 31 + character.charCodeAt(0)) % 360, 0);
        const delivery = post.delivery === 'note' ? zh ? '留言' : 'Note' : zh ? '提醒' : 'Nudge';
        return <li key={post.seq} ref={element => { if (element) rows.current.set(post.seq, element); else rows.current.delete(post.seq); }} className={highlight === post.seq ? 'is-highlighted' : ''} data-post-seq={post.seq}>
          <span className="swarm-post-avatar" style={{ '--sender-hue': hue } as CSSProperties} aria-hidden="true"><Bot size={16} /></span>
          <div className="swarm-post-content">
            <header>
              <div className="swarm-post-route">
                <button className="swarm-sender" onClick={() => onReply(post.sender, post.seq)}>@{post.sender}</button>
                <span className="swarm-recipients">→ {post.recipients.length ? post.recipients.map(name => `@${name}`).join(' ') : zh ? '看板' : 'Board'}</span>
              </div>
              <div className="swarm-post-meta" title={delivery}>
                <span className="visually-hidden">{delivery}</span>
                <button className="swarm-seq" onClick={() => locate(post.seq)} aria-label={zh ? `定位消息 #${post.seq}` : `Locate message #${post.seq}`}>#{post.seq}</button>
                <span aria-hidden="true">·</span>
                <time dateTime={new Date(post.createdAt).toISOString()}>{new Date(post.createdAt).toLocaleTimeString(zh ? 'zh-CN' : 'en', { hour: '2-digit', minute: '2-digit' })}</time>
              </div>
            </header>
            <div id={contentId}>{long && !open ? <p className="swarm-post-excerpt">{postSummary(post.text).slice(0, 300)}…</p> : <SwarmPostBody text={post.text} directory={directory} onReference={locate} hasReference={sequence => posts.some(item => item.seq === sequence)} />}</div>
            {long && <button className="quiet-button swarm-post-expand" aria-expanded={open} aria-controls={contentId} onClick={() => setExpanded(previous => { const next = new Set(previous); if (next.has(post.seq)) next.delete(post.seq); else next.add(post.seq); return next; })}>{open ? zh ? '收起' : 'Collapse' : zh ? '展开全文' : 'Expand full message'}</button>}
          </div>
        </li>;
      })}</ol> : <p className="panel-empty">{posts.length ? zh ? '没有匹配的协作消息。' : 'No matching messages.' : zh ? '成员的汇报与讨论会保留在这里。' : 'Member updates and discussions will appear here.'}</p>}
    </div>
    {(!nearEnd || unread > 0) && <div className="swarm-new-messages"><button className="secondary-button" onClick={() => { if (filtered) { setQuery(''); setSender(''); setRecipient(''); onMemberFilter(''); following.current = true; } jumpLatest(); }}><ArrowDown size={13} />{unread > 0 ? zh ? `${unread} 条新消息 · 跳到最新` : `${unread} new · Jump to latest` : zh ? '跳到最新' : 'Jump to latest'}</button></div>}
  </div>;
}
