import type { SwarmMember, SwarmSnapshot } from '../lib/agents-state';

export type BoardPost = SwarmSnapshot['messages'][number];
export interface BoardFilter { query: string; sender: string; recipient: string; member: string }
export function filterBoard(posts: BoardPost[], filter: BoardFilter): BoardPost[] {
  const query = filter.query.trim().toLocaleLowerCase();
  return posts.filter(post => (!filter.sender || post.sender === filter.sender)
    && (!filter.recipient || post.recipients.includes(filter.recipient))
    && (!filter.member || post.sender === filter.member || post.recipients.includes(filter.member))
    && (!query || (query.match(/^#\d+$/) ? post.seq === Number(query.slice(1)) : `${post.text} ${post.sender} ${post.recipients.join(' ')}`.toLocaleLowerCase().includes(query))));
}

export function swarmEdges(posts: BoardPost[], members: SwarmMember[]): { from: string; to: string; count: number }[] {
  const known = new Set(members.map(member => member.name));
  const edges = new Map<string, { from: string; to: string; count: number }>();
  for (const post of posts) {
    if (!known.has(post.sender)) continue;
    for (const to of new Set(post.recipients)) {
      if (to === post.sender || !known.has(to)) continue;
      const key = JSON.stringify([post.sender, to]);
      const edge = edges.get(key);
      if (edge) edge.count++; else edges.set(key, { from: post.sender, to, count: 1 });
    }
  }
  return [...edges.values()];
}

export const roleLabel = (role: SwarmMember['role'], zh: boolean) => role === 'coordinator' ? zh ? '协调者' : 'Coordinator' : role === 'verifier' ? zh ? '验证者' : 'Verifier' : zh ? '执行者' : 'Worker';
export const postSummary = (text: string) => text.replace(/```[\s\S]*?(?:```|$)/g, '').replace(/[#*_`>[\]]/g, '').replace(/\s+/g, ' ').trim();

export interface GraphPlayback { task: string; live: boolean; index: number }
export function graphPlayback(state: GraphPlayback, task: string, length: number, action?: number | 'live'): GraphPlayback {
  const end = Math.max(0, length);
  if (state.task !== task || action === 'live') return { task, live: true, index: end };
  if (typeof action === 'number') { const index = Math.min(end, Math.max(0, action)); return { task, live: index === end, index }; }
  return { ...state, index: state.live ? end : Math.min(end, state.index) };
}
