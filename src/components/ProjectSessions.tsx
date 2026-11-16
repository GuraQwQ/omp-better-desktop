import { ChevronRight, Folder, MessageSquare, Search, X } from 'lucide-react';
import type { RefObject } from 'react';
import SavedSessions, { SessionRow, type SessionAction, type SessionListEntry } from './SavedSessions';
import type { Bootstrap, Project, SessionSummary, SessionView } from '../lib/types';
import type { Copy } from '../lib/i18n';
import { displayPath } from '../lib/display-path';
import { sessionKey, sessionPathKey } from '../lib/session-identity';
import { searchSessions } from '../lib/session-search';

type Props = {
  bootstrap: Bootstrap; project: Project | null; session?: SessionView; sessions: SessionView[];
  history: Record<string, SessionSummary[]>; expandedProjects: Record<string, boolean>; unread: Record<string, boolean>;
  sessionQuery: string; searchLoading: boolean; searchInput: RefObject<HTMLInputElement | null>; t: Copy;
  onQuery: (value: string) => void; onProject: (project: Project) => void; onToggle: (project: Project) => void;
  onOpen: (project: Project, session: SessionSummary | SessionView) => void;
  onAction: (session: SessionListEntry, action: SessionAction) => Promise<void>;
  onReorder: (paths: string[], cwd: string) => void;
};
export default function ProjectSessions({ bootstrap, project, session, sessions, history, expandedProjects, unread, sessionQuery, searchLoading, searchInput, t, onQuery, onProject, onToggle, onOpen, onAction, onReorder }: Props) {
  const searchResults = searchSessions(bootstrap.projects, history, sessions, sessionQuery);
  return <>
      <div className="session-search"><Search size={14} /><input ref={searchInput} type="search" aria-label={t.searchSessions} placeholder={t.searchSessions} value={sessionQuery} onChange={event => onQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); onQuery(''); } }} />{sessionQuery && <button className="icon-button" title={t.clearSearch} onClick={() => { onQuery(''); searchInput.current?.focus(); }}><X size={13} /></button>}</div>
      <div className="project-list">{sessionQuery.trim() ? <div className="session-search-results"><p className="search-status" role="status">{searchLoading ? t.loading : searchResults.length ? `${searchResults.length} ${t.session}` : t.noResults}</p>{searchResults.map(({ project: item, session: value }) => <SessionRow key={sessionKey(value)} value={{ ...value, path: value.path ?? '' }} active={!!session && sessionKey(session) === sessionKey(value)} title={`${value.title || t.newTitle} / ${displayPath(item.path)}`} language={bootstrap.preferences.language} onAction={onAction} open={() => onOpen(item, value)} trailing={<small>{item.name}</small>} />)}</div> : bootstrap.projects.length ? bootstrap.projects.map(item => {
        const expanded = !!expandedProjects[item.path];
        const listId = `project-sessions-${encodeURIComponent(item.path)}`;
        const opened = sessions.filter(value => !value.hidden && sessionPathKey(value.cwd) === sessionPathKey(item.path));
        const metadata = new Map((history[item.path] ?? []).map(value => [sessionKey(value), value]));
        const openedByKey = new Map(opened.map(value => [sessionKey(value), value]));
        const saved = [...new Map([...(history[item.path] ?? []).filter(value => !sessions.some(open => open.hidden && sessionKey(open) === sessionKey(value))).map(value => [sessionKey(value), value] as const), ...opened.filter(value => value.path).map(value => { const cached = metadata.get(sessionKey(value)); return [sessionKey(value), { ...value, path: value.path!, updatedAt: cached?.updatedAt, pinned: cached?.pinned, pinOrder: cached?.pinOrder, archived: cached?.archived }] as const; })]).values()];
        const openSaved = (value: SessionListEntry) => { const current = openedByKey.get(sessionKey(value)); onOpen(item, current ?? value); };
        return <div key={item.path}>
          <div className="project-row"><button className="icon-button project-toggle" aria-expanded={expanded} aria-controls={listId} title={`${expanded ? t.collapseProject : t.expandProject} ${item.name}`} onClick={() => onToggle(item)}><ChevronRight size={13} className={expanded ? 'rotate' : ''} /></button><button className={`project-item ${project?.path === item.path ? 'selected' : ''}`} title={displayPath(item.path)} onClick={() => onProject(item)}><Folder size={15} /><span>{item.name}</span></button></div>
          {expanded && <div className="session-list" id={listId}>
            {opened.filter(value => !value.path).map(value => <SessionRow key={sessionKey(value)} value={{ path: '', id: value.id, cwd: value.cwd, title: value.title }} active={session?.id === value.id} title={value.title} language={bootstrap.preferences.language} icon={<span className={`session-status ${value.status}`} />} trailing={value.pending.length > 0 ? <i /> : unread[value.id] && <i className="done" />} open={() => { onOpen(item, value); }} />)}
            <SavedSessions sessions={saved} activeKey={session ? sessionKey(session) : ''} t={t} language={bootstrap.preferences.language} open={openSaved} onAction={onAction} onReorder={paths => onReorder(paths, item.path)} icon={value => { const current = openedByKey.get(sessionKey(value)); return current && !current.historyOnly ? <span className={`session-status ${current.status}`} /> : <MessageSquare size={12} />; }} trailing={value => { const current = openedByKey.get(sessionKey(value)); return current?.pending.length ? <i /> : current && unread[current.id] ? <i className="done" /> : null; }} />
            {!opened.length && !saved.length && <p>{t.noSessions}</p>}
          </div>}
        </div>;
      }) : <p className="sidebar-empty">{t.noProjects}</p>}</div>
  </>;
}
