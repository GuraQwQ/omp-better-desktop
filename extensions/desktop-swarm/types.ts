import type { ExtensionAPI, ExtensionContext, AgentSession, ModelRegistry } from '@oh-my-pi/pi-coding-agent';

export type Role = 'coordinator' | 'worker' | 'verifier';
export type Status = 'idle' | 'working' | 'waiting' | 'stopped' | 'blocked';
export interface Member {
  id: string; name: string; role: Role; status: Status; model: string; cwd: string;
  sessionFile?: string; task: string; lastReadSeq: number; lastPostSeq: number; error?: string;
  workspace?: 'inherit' | 'worktree'; baseCwd?: string; baseRevision?: string;
}
export interface BoardMessage { seq: number; sender: string; recipients: string[]; text: string; createdAt: number; delivery?: 'note' | 'nudge' }
export interface Snapshot {
  schemaVersion: 1; rootSessionId?: string; enabled: boolean; title: string; task: string; revision: number;
  members: Member[]; messages: BoardMessage[]; pending: number; running: number; updatedAt: number;
}
export interface State { snapshot: Snapshot; processed: Record<string, number> }
export interface Control { requestId?: string; action: string; args?: Record<string, unknown> }
export interface Binding { runtime: SwarmRuntimeLike; name: string }
export interface SwarmRuntimeLike {
  readonly enabled: boolean;
  control(input: Control, actor?: string, fromUser?: boolean): Promise<unknown>;
  read(name: string, since?: number): Promise<BoardMessage[]>;
  wait(name: string, since?: number): Promise<unknown>;
  attach(api: ExtensionAPI, context: ExtensionContext, name: string): Promise<void>;
  close(): Promise<void>;
}
export interface LiveMember { session: AgentSession; registry: ModelRegistry; unsubscribe: () => void; policy: string }

export const TOOL_NAMES = ['swarm_post', 'swarm_read', 'swarm_status', 'swarm_add', 'swarm_wait'] as const;
export const STATUS_KEY = 'desktop:swarm';
