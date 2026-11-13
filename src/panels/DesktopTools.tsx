import { lazy, Suspense, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { native } from '../lib/bridge';
import type { Json, Language, Preferences, SessionSummary, SessionView } from '../lib/types';
import type { ConversationReference } from '../lib/references';
import type { SideQuestionSource, SideQuestionThreadSummary } from '../lib/side-questions';
import '../components/desktop-tools.css';

const WorkspaceTools = lazy(() => import('./WorkspaceTools'));
const SessionLibrary = lazy(() => import('./SessionLibrary'));
const Artifacts = lazy(() => import('./desktop/Artifacts'));
const Notes = lazy(() => import('./desktop/Notes'));
const Reviews = lazy(() => import('./desktop/Reviews'));
const BrowserLinks = lazy(() => import('./desktop/BrowserLinks'));
const Schedules = lazy(() => import('./desktop/Schedules'));
const SideQuestions = lazy(() => import('./desktop/SideQuestions'));
const workspaceTabs = ['search', 'git', 'worktrees', 'editor', 'terminals'] as const;
export type DesktopTab = typeof workspaceTabs[number] | 'library' | 'artifacts' | 'notes' | 'side-questions' | 'schedules' | 'structured-review' | 'browser';
const titles: Record<DesktopTab, string> = { search: '项目搜索', git: 'Git', worktrees: '工作树', editor: '文件编辑', terminals: '终端', library: '会话库', artifacts: '工具与产物', notes: '选段批注', 'side-questions': '连续旁问', schedules: '定时任务', 'structured-review': '结构化评审', browser: '浏览器' };
interface Props {
  openFile?: { path: string; line?: number; nonce?: number };
  tab: DesktopTab; cwd: string; language: Language; preferences: Preferences; session?: SessionView; selection?: string; selectionNonce?: number;
  onEnsureSession: () => Promise<SessionView>;
  sideQuestionSource?: SideQuestionSource; sideQuestionThreadId?: string; onSideQuestionThreadsChange?: (threads: SideQuestionThreadSummary[]) => void;
  onTab: (tab: DesktopTab) => void; onClose: () => void; onOpen: (summary: SessionSummary, messageId?: string) => void;
  onReference: (text: string | ConversationReference[]) => void; onPrompt: (text: string) => void;
  onSideQuestion: (question: string, recordId?: string, images?: { type: 'image'; data: string; mimeType: string }[]) => Promise<Json>;
  onCancelSideQuestion: (recordId?: string, desktopSessionId?: string) => Promise<Json>; onExportSideQuestions: (content: string, filename: string) => Promise<void>;
  onProject: (path: string) => void; onArchiveChange: () => void;
}

export default function DesktopTools(props: Props) {
  const [error, setError] = useState('');
  const [connectionRetry, setConnectionRetry] = useState(0);
  const onError = (error: unknown) => setError(error instanceof Error ? error.message : String(error));
  const connecting = props.tab === 'side-questions' && !props.session;
  useEffect(() => {
    if (!native || !connecting) return;
    let cancelled = false;
    setError('');
    void props.onEnsureSession().catch(error => { if (!cancelled) onError(error); });
    return () => { cancelled = true; };
  }, [connecting, props.tab, props.cwd, props.session?.id, connectionRetry]);
  const allowed = (tab: DesktopTab) => tab === 'structured-review' ? props.preferences.features?.reviews === true : tab === 'browser' ? props.preferences.features?.browser === true : true;
  const tabs = (Object.keys(titles) as DesktopTab[]).filter(allowed).filter(tab => !workspaceTabs.includes(tab as typeof workspaceTabs[number]) || tab === 'search');
  const sessionKey = `${props.cwd}:${props.session?.path ?? props.session?.id ?? 'scratch'}`;
  return <aside className="desktop-tools">
    <header><h2>{titles[props.tab]}</h2><button className="icon-button" aria-label="关闭工具" onClick={props.onClose}><X size={16} /></button></header>
    <nav aria-label="工作区工具">{tabs.map(tab => { const active = props.tab === tab || tab === 'search' && workspaceTabs.includes(props.tab as typeof workspaceTabs[number]); return <button key={tab} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} onClick={() => { setError(''); props.onTab(tab); }}>{tab === 'search' ? '工作区' : titles[tab]}</button>; })}</nav>
    {error && <p className="desktop-error" role="alert">{error}<button className="icon-button" aria-label="关闭错误" onClick={() => setError('')}><X size={12} /></button></p>}
    <div className={`desktop-tools-content${props.tab === 'side-questions' ? ' desktop-tools-side-questions' : ''}`}><Suspense fallback={<p role="status">正在加载…</p>}>{!native ? <p>在桌面应用中使用本地工具。</p> : !allowed(props.tab) ? <p>此功能可在应用设置中开启。</p>
      : connecting ? error ? <button className="quiet-button" onClick={() => setConnectionRetry(value => value + 1)}>重试连接</button> : <p role="status">正在连接会话…</p>
      : workspaceTabs.includes(props.tab as typeof workspaceTabs[number]) ? <WorkspaceTools openFile={props.openFile} cwd={props.cwd} language={props.language} initialTab={props.tab as typeof workspaceTabs[number]} onProject={props.onProject} />
        : props.tab === 'library' ? <SessionLibrary language={props.language} cwd={props.cwd || undefined} externalEnabled={props.preferences.features?.externalSessions === true} onOpen={props.onOpen} onReference={props.onReference} onArchiveChange={props.onArchiveChange} />
          : props.tab === 'artifacts' ? <Artifacts key={props.cwd} cwd={props.cwd} onError={onError} />
            : props.tab === 'notes' ? <Notes key={sessionKey} session={props.session} selection={props.selection} selectionNonce={props.selectionNonce} onReference={props.onReference} onError={onError} />
              : props.tab === 'side-questions' ? <SideQuestions key={sessionKey} cwd={props.cwd} session={props.session} selection={props.selection} selectionNonce={props.selectionNonce} sideQuestionSource={props.sideQuestionSource} sideQuestionThreadId={props.sideQuestionThreadId} onSideQuestionThreadsChange={props.onSideQuestionThreadsChange} language={props.language} onSideQuestion={props.onSideQuestion} onCancelSideQuestion={props.onCancelSideQuestion} onExportSideQuestions={props.onExportSideQuestions} onOpen={props.onOpen} onReference={props.onReference} />
              : props.tab === 'schedules' ? <Schedules key={props.cwd} cwd={props.cwd} onOpen={props.onOpen} onError={onError} />
                : props.tab === 'structured-review' ? <Reviews key={sessionKey} session={props.session} onPrompt={props.onPrompt} onError={onError} />
                  : <BrowserLinks onError={onError} />}</Suspense></div>
  </aside>;
}
