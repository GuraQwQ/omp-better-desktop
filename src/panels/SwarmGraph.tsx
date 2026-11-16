import { useEffect, useId, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { SwarmSnapshot } from '../lib/agents-state';
import { agentStatus } from '../lib/agents-state';
import { graphPlayback, roleLabel, swarmEdges } from './swarm-view';
import SwarmPostBody from './SwarmPostBody';

export default function SwarmGraph({ snapshot, zh, onBoard, onSequence, directory }: { snapshot: SwarmSnapshot; zh: boolean; onBoard: (member: string) => void; onSequence: (sequence: number) => void; directory?: string }) {
  const [selected, setSelected] = useState('coordinator'), [showAll, setShowAll] = useState(false);
  const task = snapshot.members.find(member => member.role === 'coordinator')?.sessionFile ?? snapshot.title;
  const [playback, setPlayback] = useState({ task, live: true, index: snapshot.messages.length });
  const cursor = graphPlayback(playback, task, snapshot.messages.length);
  useEffect(() => { setPlayback({ task, live: true, index: snapshot.messages.length }); }, [task]);
  const currentPost = cursor.index ? snapshot.messages[cursor.index - 1] : undefined;
  const marker = useId().replaceAll(':', '');
  const allEdges = useMemo(() => swarmEdges(snapshot.messages, snapshot.members), [snapshot.messages, snapshot.members]);
  const edges = useMemo(() => swarmEdges(snapshot.messages.slice(0, cursor.index), snapshot.members), [snapshot.messages, snapshot.members, cursor.index]);
  const linked = new Set(allEdges.flatMap(edge => [edge.from, edge.to]));
  const members = snapshot.members.filter(member => showAll || member.status === 'working' || member.status === 'waiting' || member.status === 'blocked' || linked.has(member.name));
  const center = members.find(member => member.name === selected) ?? members.find(member => member.role === 'coordinator') ?? members[0];
  const adjacent = edges.filter(edge => edge.from === center?.name || edge.to === center?.name || currentPost && edge.from === currentPost.sender && currentPost.recipients.includes(edge.to));
  const neighbors = new Set(adjacent.flatMap(edge => [edge.from, edge.to]));
  const positioned = members.map((member, index) => {
    if (member === center) return { member, x: 240, y: 180 };
    const other = members.filter(item => item !== center), position = other.indexOf(member), angle = 2 * Math.PI * position / Math.max(1, other.length) - Math.PI / 2;
    return { member, x: 240 + 160 * Math.cos(angle), y: 180 + 125 * Math.sin(angle) };
  });
  const positions = new Map(positioned.map(item => [item.member.name, item]));
  const move = (action: number | 'live') => setPlayback(graphPlayback(cursor, task, snapshot.messages.length, action));
  return <div className="swarm-graph-view"><div className="swarm-playback"><button className="icon-button" aria-label={zh ? '上一条消息' : 'Previous message'} disabled={!cursor.index} onClick={() => move(cursor.index - 1)}><ChevronLeft size={15} /></button><input aria-label={zh ? '消息回看进度' : 'Message playback position'} type="range" min={0} max={snapshot.messages.length} value={cursor.index} onChange={event => move(Number(event.target.value))} /><button className="icon-button" aria-label={zh ? '下一条消息' : 'Next message'} disabled={cursor.index === snapshot.messages.length} onClick={() => move(cursor.index + 1)}><ChevronRight size={15} /></button><button className={`quiet-button ${cursor.live ? 'active' : ''}`} onClick={() => move('live')}>{zh ? '实时' : 'Live'}</button></div><div className="swarm-playback-caption"><strong>{cursor.live ? zh ? '实时' : 'Live' : zh ? `回看 #${currentPost?.seq ?? 0}` : `Review #${currentPost?.seq ?? 0}`}<span>{cursor.index} / {snapshot.messages.length}</span></strong>{currentPost && <time dateTime={new Date(currentPost.createdAt).toISOString()}>{new Date(currentPost.createdAt).toLocaleTimeString(zh ? 'zh-CN' : 'en', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>}</div><div className="swarm-graph-controls"><label><input type="checkbox" checked={showAll} onChange={event => setShowAll(event.target.checked)} />{zh ? '显示全部成员' : 'Show all members'}</label><span>{zh ? `${edges.length} 条消息关系` : `${edges.length} message links`}</span></div>
    {members.length ? <><svg viewBox="0 0 480 360" className="swarm-graph" aria-label={zh ? '成员通信关系' : 'Member communication graph'} role="group"><defs><marker id={marker} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker></defs>
      {adjacent.map(edge => {
        const from = positions.get(edge.from), to = positions.get(edge.to); if (!from || !to) return null;
        const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy), offset = 43 / length;
        const x1 = from.x + dx * offset, y1 = from.y + dy * offset, x2 = to.x - dx * offset, y2 = to.y - dy * offset;
        const bend = edges.some(item => item.from === edge.to && item.to === edge.from) ? 12 : 0;
        const cx = (x1 + x2) / 2 - dy / length * bend, cy = (y1 + y2) / 2 + dx / length * bend;
        const highlighted = currentPost?.sender === edge.from && currentPost.recipients.includes(edge.to);
        return <g key={`${edge.from}:${edge.to}`} className={`swarm-graph-edge ${highlighted ? 'current' : ''}`}><path d={`M${x1},${y1} Q${cx},${cy} ${x2},${y2}`} fill="none" markerEnd={`url(#${marker})`} strokeWidth={Math.min(3, 1 + Math.log2(edge.count + 1) / 2)} /><text x={cx - dy / length * 9} y={cy + dx / length * 9} textAnchor="middle">{edge.count}</text><title>{`${edge.from} → ${edge.to}: ${edge.count}`}</title></g>;
      })}
      {positioned.map(({ member, x, y }) => <g key={member.id} className={`swarm-graph-node ${member.name === center?.name ? 'selected' : ''} ${neighbors.has(member.name) ? 'connected' : ''}`} transform={`translate(${x},${y})`} role="button" tabIndex={0} aria-label={`${member.name}, ${agentStatus(member.status, zh)}`} aria-pressed={member.name === center?.name} onClick={() => { setSelected(member.name); onBoard(member.name); }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(member.name); onBoard(member.name); } }}><rect x="-57" y="-17" width="114" height="34" rx="8" /><circle cx="-44" cy="0" r="3" className={member.status} /><text x="3" y="4" textAnchor="middle">{member.name.length > 15 ? `${member.name.slice(0, 14)}…` : member.name}</text><title>{`${member.name} · ${roleLabel(member.role, zh)} · ${agentStatus(member.status, zh)}`}</title></g>)}
    </svg><div className="swarm-graph-focus"><strong>@{center?.name}</strong><span>{zh ? '显示相邻通信与当前消息，数字为累计发布次数。' : 'Adjacent links and the current message; labels show cumulative post counts.'}</span></div><div className="swarm-graph-members">{members.map(member => <button key={member.id} className={`quiet-button ${center?.name === member.name ? 'active' : ''}`} onClick={() => setSelected(member.name)}>{member.name}</button>)}</div></> : <p className="panel-empty">{zh ? '成员开始工作或发布消息后显示关系。' : 'Relationships appear when members work or post.'}</p>}
    {currentPost && <article className="swarm-graph-post"><header><strong>#{currentPost.seq} · @{currentPost.sender}</strong><span>→ {currentPost.recipients.map(name => `@${name}`).join(' ') || (zh ? '公告板' : 'Board')}</span></header><SwarmPostBody text={currentPost.text} directory={directory} onReference={onSequence} hasReference={sequence => snapshot.messages.some(item => item.seq === sequence)} /></article>}
  </div>;
}
