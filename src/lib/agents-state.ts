import type { SubagentSnapshot } from '../generated/rpc-wire';
import type { Json, Message, SessionView } from './types';

export type AgentView = Omit<SubagentSnapshot, 'progress'> & { progress?: Json; messages?: Message[]; eventRevision?: number; messageCounter?: number; openMessageId?: string };
export interface PeerMessage { id: string; from: string; to: string; text: string; timestamp: number }
export interface AgentsState { members: Record<string, AgentView>; peers: PeerMessage[] }
export interface SwarmMember { id: string; name: string; role: 'coordinator' | 'worker' | 'verifier'; status: 'idle' | 'working' | 'waiting' | 'stopped' | 'blocked'; model: string; cwd: string; sessionFile?: string; task: string; lastReadSeq: number; lastPostSeq: number; error?: string; workspace?: 'inherit' | 'worktree'; baseCwd?: string; baseRevision?: string }
export interface SwarmSnapshot { schemaVersion: 1; rootSessionId?: string; enabled: boolean; title: string; task?: string; revision: number; members: SwarmMember[]; messages: { seq: number; sender: string; recipients: string[]; text: string; createdAt: number; delivery?: 'note' | 'nudge' }[]; pending: number; running: number; updatedAt: number }
export type SessionUpdater = (id: string, update: (session: SessionView) => SessionView) => void;
export interface AgentFocusDetail { id: string; parentToolCallId?: string }
export const AGENT_FOCUS_EVENT = 'desktop-agent-focus';
export function focusAgent(detail: AgentFocusDetail) { window.dispatchEvent(new CustomEvent<AgentFocusDetail>(AGENT_FOCUS_EVENT, { detail })); }
export const emptyAgents = (): AgentsState => ({ members: {}, peers: [] });
export const terminalAgent = (status?: string) => ['completed', 'failed', 'aborted'].includes(status ?? '');
const sameRun = (left: Partial<AgentView>, right: Partial<AgentView>) => left.parentToolCallId && right.parentToolCallId ? left.parentToolCallId === right.parentToolCallId : !left.sessionFile || !right.sessionFile || left.sessionFile === right.sessionFile;

export function mergeAgentSnapshot(state: AgentsState | undefined, snapshots: SubagentSnapshot[]): AgentsState {
  const current = state ?? emptyAgents();
  const members = { ...current.members };
  for (const value of snapshots) {
    const previous = members[value.id];
    // 查询可能晚于完成事件返回，旧基线不能让已结束的同一次运行重新出现。
    if (previous && (previous.lastUpdate > value.lastUpdate || sameRun(previous, value) && terminalAgent(previous.status))) continue;
    members[value.id] = { ...(previous && sameRun(previous, value) ? previous : {}), ...value };
  }
  return { ...current, members };
}

export function reduceAgentEvent(state: AgentsState | undefined, event: Json, transcript: (messages: Message[], event: Json) => Message[]): AgentsState | undefined {
  const payload = event.payload;
  if (!['subagent_lifecycle', 'subagent_progress', 'subagent_event', 'irc_message'].includes(event.type)) return state;
  const current = state ?? emptyAgents();
  if (event.type === 'irc_message') {
    const message = event.message ?? {}, details = message.details ?? {};
    const from = details.from, to = details.to ?? 'main', text = details.body ?? details.message;
    if (typeof from !== 'string' || typeof text !== 'string') return state;
    const timestamp = typeof message.timestamp === 'number' ? message.timestamp : Date.now();
    const id = String(details.id ?? `${message.customType}:${from}:${to}:${timestamp}:${text}`);
    if (current.peers.some(item => item.id === id)) return current;
    return { ...current, peers: [...current.peers, { id, from, to, text, timestamp }].slice(-500) };
  }
  if (!payload) return state;
  const id = event.type === 'subagent_progress' ? payload.progress?.id : payload.id;
  if (typeof id !== 'string') return state;
  const previous = current.members[id];
  if (event.type === 'subagent_event') {
    if (!previous) return state;
    const raw = payload.event;
    if (!raw || typeof raw.type !== 'string') return state;
    let counter = previous.messageCounter ?? 0, openMessageId = previous.openMessageId;
    const frame = { ...raw };
    if (['message_start', 'message_update', 'message_end'].includes(raw.type)) {
      if (raw.type === 'message_start' || !openMessageId) openMessageId = raw.messageId ?? `sub-${id}-${++counter}`;
      frame.messageId = raw.messageId ?? openMessageId;
    }
    const messages = transcript(previous.messages ?? [], frame);
    if (raw.type === 'message_end' || raw.type === 'agent_end') openMessageId = undefined;
    return { ...current, members: { ...current.members, [id]: { ...previous, messages, openMessageId, messageCounter: counter, eventRevision: (previous.eventRevision ?? 0) + 1 } } };
  }
  if (previous && !sameRun(previous, payload)) {
    if (event.type !== 'subagent_lifecycle' || payload.status !== 'started') return state;
  } else if (previous && terminalAgent(previous.status) && !(event.type === 'subagent_lifecycle' && payload.status === 'started')) return state;
  const started = event.type === 'subagent_lifecycle' && payload.status === 'started';
  const base = previous && sameRun(previous, payload) && !started ? previous : { id, messages: [] };
  const value: AgentView = {
    ...base, id, index: payload.index ?? previous?.index ?? 0,
    agent: payload.agent ?? previous?.agent ?? id, agentSource: payload.agentSource ?? previous?.agentSource ?? 'bundled',
    status: event.type === 'subagent_lifecycle' ? started ? 'running' : payload.status : payload.progress.status,
    lastUpdate: Date.now(), description: payload.description ?? payload.progress?.description ?? previous?.description,
    parentToolCallId: payload.parentToolCallId ?? previous?.parentToolCallId,
    sessionFile: payload.sessionFile ?? previous?.sessionFile,
    task: payload.task ?? previous?.task, assignment: payload.assignment ?? previous?.assignment,
    progress: payload.progress ?? (started ? undefined : previous?.progress),
  };
  return { ...current, members: { ...current.members, [id]: value } };
}

export function mergeSwarmSnapshot(snapshot: unknown, previous?: SwarmSnapshot, rootSessionId?: string): SwarmSnapshot | undefined {
  if (typeof snapshot !== 'object' || snapshot === null) return previous;
  const value = snapshot as SwarmSnapshot;
  if (value.schemaVersion !== 1 || !Array.isArray(value.members) || !Array.isArray(value.messages)) return previous;
  if (rootSessionId && value.rootSessionId !== rootSessionId) return previous;
  return previous && previous.rootSessionId === value.rootSessionId && previous.revision > value.revision ? previous : value;
}

const transcriptIdentity = (message: Message) => message.toolCallId ? `tool:${message.toolCallId}` : typeof message.timestamp === 'number' ? `${message.role}:${message.timestamp}` : `id:${message.id}`;
export function mergeAgentMessages(base: Message[], incoming: Message[]): Message[] {
  const result = base.slice();
  for (const message of incoming) {
    const key = transcriptIdentity(message), index = result.findIndex(item => transcriptIdentity(item) === key);
    if (index < 0) result.push(message); else result[index] = { ...result[index], ...message };
  }
  return result;
}

export function taskAgents(message: Message): AgentView[] {
  const details = message.result?.details ?? message.partialResult?.details ?? message.details ?? {};
  const values = new Map<string, AgentView>();
  for (const item of Array.isArray(details.progress) ? details.progress : []) if (typeof item.id === 'string') values.set(item.id, { ...item, lastUpdate: 0, progress: item, parentToolCallId: message.toolCallId });
  for (const item of Array.isArray(details.results) ? details.results : []) if (typeof item.id === 'string') values.set(item.id, {
    ...item, status: item.status ?? (item.exitCode === 0 ? 'completed' : 'failed'), lastUpdate: 0, parentToolCallId: message.toolCallId,
    progress: { ...item, ...(item.stderr ? { error: item.stderr } : {}) },
  });
  return [...values.values()];
}

export function visibleAgents(session?: SessionView): AgentView[] {
  if (!session) return [];
  const members = new Map<string, AgentView>();
  for (const message of session.messages) if (message.toolName === 'task') for (const agent of taskAgents(message)) members.set(agent.id, agent);
  for (const agent of Object.values(session.agents?.members ?? {})) {
    const result = members.get(agent.id);
    members.set(agent.id, result && terminalAgent(result.status) && !terminalAgent(agent.status) && sameRun(result, agent) ? { ...agent, ...result, messages: agent.messages } : { ...result, ...agent, progress: { ...result?.progress, ...agent.progress } });
  }
  return [...members.values()].sort((a, b) => Number(terminalAgent(a.status)) - Number(terminalAgent(b.status)) || a.index - b.index);
}

export function agentStatus(status: string, zh: boolean): string {
  const labels: Record<string, [string, string]> = { pending: ['排队中', 'Queued'], running: ['运行中', 'Running'], completed: ['已完成', 'Completed'], failed: ['失败', 'Failed'], aborted: ['已停止', 'Stopped'], idle: ['空闲', 'Idle'], working: ['运行中', 'Working'], waiting: ['等待中', 'Waiting'], stopped: ['已停止', 'Stopped'], blocked: ['需要处理', 'Needs attention'] };
  return labels[status]?.[zh ? 0 : 1] ?? status;
}
