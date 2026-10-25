import type { SessionSummary, SessionView } from './types';

export function sessionPathKey(path: string): string {
  const value = path.replaceAll('\\', '/').replace(/^\/\/\?\//, '').replace(/^UNC\//i, '//').replace(/\/+$/, '');
  return /^[a-z]:\//i.test(value) || value.startsWith('//') ? value.toLowerCase() : value;
}

export function sessionKey(session: Pick<SessionView | SessionSummary, 'id' | 'path'>): string {
  return session.path ? `path:${sessionPathKey(session.path)}` : `id:${session.id}`;
}

export function uniqueSessions(sessions: SessionView[]): SessionView[] {
  const unique = new Map<string, SessionView>();
  for (const session of sessions) {
    const key = sessionKey(session);
    const previous = unique.get(key);
    if (!previous || previous.historyOnly || !session.historyOnly) unique.set(key, session);
  }
  return [...unique.values()];
}

export function storeSession(sessions: Record<string, SessionView>, session: SessionView): Record<string, SessionView> {
  return Object.fromEntries(uniqueSessions([...Object.values(sessions).filter(value => value.id !== session.id), session]).map(value => [value.id, value]));
}
