export type Language = 'en' | 'zh';
export type Json = Record<string, any>;
export interface Preferences { language: Language; theme: 'system' | 'light' | 'dark' }
export interface Project { path: string; name: string }
export interface RuntimeRecord { path: string; version: string; revision?: string }
export interface Bootstrap { dataRoot: string; runtime: RuntimeRecord | null; preferences: Preferences; projects: Project[] }
export interface SessionSummary { path: string; id: string; title?: string; cwd: string; updatedAt?: string | number }
export interface ContentBlock { type: string; text?: string; thinking?: string; name?: string; id?: string; arguments?: any; data?: string; mimeType?: string }
export interface Message { id: string; role: string; content: string | ContentBlock[]; toolName?: string; toolCallId?: string; isError?: boolean; usage?: Json; timestamp?: number; [key: string]: any }
export interface SessionView { id: string; cwd: string; path?: string; title: string; messages: Message[]; state: Json; status: string; pending: Json[]; nextCursor?: string; historyOnly?: boolean; draft?: string }
export interface DesktopEvent { sessionId: string; event: Json }
export interface CatalogEntry { name: string; description?: string; kind?: string; source?: string; surface?: string; args?: string[]; [key: string]: any }
