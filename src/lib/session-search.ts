import { sessionKey, sessionPathKey } from './session-identity';
import type { Project, SessionSummary, SessionView } from './types';

const updatedAt = (session: SessionSummary | SessionView) => 'updatedAt' in session ? Number(session.updatedAt ?? 0) : 0;
const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase().replaceAll('\\', '/').trim();

export function searchSessions(projects: Project[], history: Record<string, SessionSummary[]>, opened: SessionView[], query: string) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hidden = new Set(opened.filter(session => session.hidden).map(sessionKey));
  return projects.flatMap(project => {
    const values = new Map<string, SessionSummary | SessionView>();
    for (const value of history[project.path] ?? []) if (!hidden.has(sessionKey(value))) values.set(sessionKey(value), value);
    for (const value of opened) if (!value.hidden && sessionPathKey(value.cwd) === sessionPathKey(project.path)) values.set(sessionKey(value), { ...values.get(sessionKey(value)), ...value });
    return [...values.values()].map(session => ({ project, session }));
  }).filter(({ project, session }) => {
    const text = normalize(`${session.title ?? ''} ${project.name} ${session.cwd} ${session.path ?? ''} ${session.id}`);
    return words.every(word => text.includes(word));
  }).sort((a, b) => {
    const score = (title = '') => normalize(title) === normalize(query) ? 2 : normalize(title).startsWith(normalize(query)) ? 1 : 0;
    return score(b.session.title) - score(a.session.title) || updatedAt(b.session) - updatedAt(a.session);
  });
}
