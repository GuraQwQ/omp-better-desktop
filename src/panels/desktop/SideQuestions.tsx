import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { pickPath, request } from '../../lib/bridge';
import { copy } from '../../lib/i18n';
import type { ComposerAttachment } from '../../lib/attachments';
import type { ConversationReference } from '../../lib/references';
import ComposerAttachments from '../../components/ComposerAttachments';
import { sideQuestions } from '../../lib/side-question-session';
import { exportSideQuestions, sideQuestionContextSize, sideQuestionSourceKey, sideQuestionSourceLabel, sideQuestionThreadSummaries, sideQuestionThreadTitle, type SideQuestionSource, type SideQuestionThreadSummary } from '../../lib/side-questions';
import type { Json, Language, SessionSummary, SessionView } from '../../lib/types';

const Markdown = lazy(() => import('../../components/MarkdownBody'));
interface Props {
  cwd: string; session?: SessionView; selection?: string; selectionNonce?: number; language: Language;
  sideQuestionSource?: SideQuestionSource; sideQuestionThreadId?: string;
  onSideQuestionThreadsChange?: (threads: SideQuestionThreadSummary[]) => void;
  onSideQuestion: (question: string, recordId?: string, images?: { type: 'image'; data: string; mimeType: string }[]) => Promise<Json>;
  onCancelSideQuestion: (recordId?: string, desktopSessionId?: string) => Promise<Json>;
  onExportSideQuestions: (content: string, filename: string) => Promise<void>;
  onOpen: (session: SessionSummary, messageId?: string) => void;
  onReference: (text: string | ConversationReference[]) => void;
}
const statusLabels = { running: ['回答中', 'Answering'], complete: ['已完成', 'Complete'], cancelled: ['已取消', 'Cancelled'], error: ['失败', 'Failed'], interrupted: ['已中断', 'Interrupted'] };

export default function SideQuestions(props: Props) {
  const { session, language } = props, zh = language === 'zh';
  const key = 'side-questions:' + (session?.path ?? session?.id ?? 'scratch:' + props.cwd);
  const conversation = sideQuestions.get(key);
  conversation.configure({ session, send: props.onSideQuestion, cancel: props.onCancelSideQuestion });
  const { state, ready, busy, preparing, cancelling, error: lifecycleError, loadError, saveStatus, cancelFailure } = useSyncExternalStore(conversation.subscribe, conversation.getSnapshot);
  const [localError, setError] = useState('');
  const error = localError || lifecycleError;
  const [exporting, setExporting] = useState(false), [attaching, setAttaching] = useState(false);
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');
  const panel = useRef<HTMLElement>(null), active = useRef(true);
  const currentThread = conversation.current;
  useEffect(() => {
    active.current = true; conversation.configure({ session, send: props.onSideQuestion, cancel: props.onCancelSideQuestion }); void conversation.load();
    return () => { active.current = false; conversation.detach(); };
  }, [conversation]);
  const sourceKey = props.sideQuestionSource ? sideQuestionSourceKey(props.sideQuestionSource) : 'whole';
  useEffect(() => {
    conversation.selectAction(JSON.stringify([props.sideQuestionThreadId ?? sourceKey, props.selectionNonce, props.selection]), props.sideQuestionThreadId, props.sideQuestionSource, props.selection);
  }, [conversation, sourceKey, props.sideQuestionThreadId, props.selectionNonce, props.selection, ready]);
  const summaries = sideQuestionThreadSummaries(state), summaryKey = JSON.stringify(summaries);
  useEffect(() => { if (ready) props.onSideQuestionThreadsChange?.(summaries); }, [ready, summaryKey]);
  useEffect(() => {
    const visibility = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  useEffect(() => {
    if (!ready || !visible) return;
    const id = currentThread.id;
    const frame = requestAnimationFrame(() => {
      const bounds = panel.current?.getBoundingClientRect();
      if (active.current && document.visibilityState === 'visible' && bounds?.width && bounds.height && conversation.current.id === id) conversation.markRead(id);
    });
    return () => cancelAnimationFrame(frame);
  }, [conversation, ready, visible, currentThread.id, currentThread.records]);
  useEffect(() => { if (ready) void conversation.refresh(); }, [conversation, ready, session?.id, session?.historyOnly]);
  const attach = async (directory: boolean) => {
    const { id, generation } = currentThread; setAttaching(true); setError('');
    try {
      const path = await pickPath(directory); if (!path || !active.current) return;
      const items = await request<ComposerAttachment[]>('attachment.paths', { paths: [path] });
      if (active.current) conversation.addAttachments(id, generation, items);
    } catch (error) { if (active.current) setError(error instanceof Error ? error.message : String(error)); }
    finally { if (active.current) setAttaching(false); }
  };
  const exportAll = async () => {
    setExporting(true); setError('');
    try { await props.onExportSideQuestions(exportSideQuestions(conversation.getSnapshot().state, session?.title ?? '会话'), (session?.title ?? '会话') + '-全部旁问.md'); }
    catch (error) { if (active.current) setError(error instanceof Error ? error.message : String(error)); }
    finally { if (active.current) setExporting(false); }
  };
  const running = busy || state.threads.some(thread => thread.records.some(record => record.status === 'running'));
  return <section ref={panel} className="side-questions" aria-label={zh ? '连续旁问' : 'Side questions'}>
    <div className="side-question-toolbar"><label className="side-question-thread-picker">{zh ? '讨论' : 'Discussion'}<select aria-label={zh ? '旁问讨论' : 'Side-question discussion'} value={currentThread.id} onChange={event => conversation.select(event.target.value)}>{(state.threads.length ? state.threads : [currentThread]).map(thread => <option value={thread.id} key={thread.id}>{sideQuestionThreadTitle(thread)} · {sideQuestionSourceLabel(thread.source)} · {thread.records.length}</option>)}</select></label><button className="quiet-button" onClick={() => conversation.activate({ kind: 'whole' })}>{zh ? '会话讨论' : 'Whole chat'}</button><button className="quiet-button" disabled={!ready || exporting} onClick={() => void exportAll()}>{exporting ? zh ? '正在导出…' : 'Exporting…' : zh ? '导出全部' : 'Export all'}</button></div>
    <div className="side-question-source"><span>{currentThread.source.kind === 'selection' ? `${zh ? '来源' : 'Source'} · ${sideQuestionSourceLabel(currentThread.source)}` : currentThread.source.kind === 'saved' ? zh ? '已保存讨论' : 'Saved discussion' : zh ? '整个会话' : 'Whole chat'}</span>{currentThread.source.kind === 'selection' && session?.path && <button className="quiet-button" title={currentThread.source.messageId} onClick={() => props.onOpen({ path: session.path!, id: session.id, cwd: session.cwd, title: session.title }, currentThread.source.kind === 'selection' ? currentThread.source.messageId : undefined)}>{zh ? '回到原消息' : 'Go to source'}</button>}</div>
    <div className="side-question-toolbar"><p className="desktop-tool-hint">{zh ? `本讨论上下文 ${sideQuestionContextSize(currentThread).toLocaleString()} 字符` : `${sideQuestionContextSize(currentThread).toLocaleString()} context characters`}</p><button className="quiet-button" onClick={() => conversation.clear(currentThread.id)}>{zh ? '清空上下文' : 'Clear context'}</button></div>
    <div className="side-question-body">
    {loadError && <p className="desktop-error" role="alert">{loadError}<button className="quiet-button" onClick={() => void conversation.load()}>{zh ? '重试读取' : 'Retry loading'}</button></p>}
    {error && <p className="desktop-error" role="alert">{error}<button className="quiet-button" onClick={() => { setError(''); void conversation.refresh(); }}>{zh ? '刷新回答' : 'Refresh answers'}</button></p>}
    {cancelFailure && <p className="desktop-error" role="alert">{cancelFailure.message}<button className="quiet-button" onClick={() => void conversation.retryCancel()}>{zh ? '重试取消' : 'Retry cancellation'}</button></p>}
    {saveStatus.error && <p className="desktop-error" role="alert">{zh ? '保存失败：' : 'Save failed: '}{saveStatus.error}<button className="quiet-button" onClick={() => void conversation.flush()}>{zh ? '重试保存' : 'Retry saving'}</button></p>}
    <div className="side-question-history">{currentThread.records.map(record => <article className="desktop-record side-question-record" key={record.id} data-side-question-id={record.id}>
      <header><span>{statusLabels[record.status][zh ? 0 : 1]}</span><button className="quiet-button" disabled={record.status === 'running'} aria-label={zh ? `移除旁问 ${record.question}` : `Remove question ${record.question}`} onClick={() => conversation.remove(currentThread.id, record.id)}>{zh ? '移除' : 'Remove'}</button></header>
      {record.quote && <blockquote>{record.quote}</blockquote>}<p className="side-question-question">{record.question}</p>
      {record.attachments?.length ? <div className="side-question-record-attachments">{record.attachments.map((item, index) => <span key={index} title={item.path}>{item.name}</span>)}</div> : null}
      {!!record.warnings?.length && <div className="side-question-material-note" role="status"><span>{zh ? '附件材料' : 'Attachment material'}</span><ul>{record.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}
      {record.answer && <div className="side-question-answer"><Suspense fallback={<p className="preserve-lines">{record.answer}</p>}><Markdown text={record.answer} t={copy(language)} live={record.status === 'running'} /></Suspense></div>}
      {record.error && <p className="desktop-error">{record.error}</p>}
      <div className="desktop-tool-actions">{record.status === 'running' ? <button className="quiet-button" onClick={() => void conversation.cancelRecord(record)}>{cancelling ? zh ? '正在取消…' : 'Cancelling…' : zh ? '取消旁问' : 'Cancel question'}</button> : <button className="quiet-button" onClick={() => conversation.edit(currentThread.id, { draft: record.question, quote: record.quote, attachments: record.attachments ?? [] })}>{zh ? '编辑再问' : 'Edit question'}</button>}{record.answer && <button className="quiet-button" onClick={() => props.onReference(`${record.question}\n\n${record.answer}`)}>{zh ? '引用到草稿' : 'Quote to draft'}</button>}</div>
    </article>)}</div>
    {!currentThread.records.length && <p className="desktop-tool-hint">{zh ? '围绕当前来源提问；问答与草稿保存在这个讨论中。' : 'Ask about this source. Questions, answers, and drafts stay in this discussion.'}</p>}
    <label className="desktop-field">{zh ? '旁问选段' : 'Selection'}<textarea aria-label={zh ? '旁问选段' : 'Selection'} rows={3} value={currentThread.quote} onChange={event => conversation.edit(currentThread.id, { quote: event.target.value })} /></label>
    <ComposerAttachments items={currentThread.attachments} disabled={false} language={language} name={item => `side-attachment-${currentThread.id.replace(/[^a-zA-Z0-9_-]/g, '_')}-${item.name.replace(/[^a-zA-Z0-9_-]/g, '_')}-${currentThread.attachments.indexOf(item)}`} remove={index => conversation.edit(currentThread.id, { attachments: currentThread.attachments.filter((_, itemIndex) => itemIndex !== index) })} />
    <div className="desktop-tool-actions"><button className="quiet-button" disabled={attaching} onClick={() => void attach(false)}>{zh ? '添加文件' : 'Add file'}</button><button className="quiet-button" disabled={attaching} onClick={() => void attach(true)}>{zh ? '添加目录' : 'Add folder'}</button></div>
    </div>
    <div className="side-question-compose">
    <label className="desktop-field">{zh ? '旁问草稿' : 'Question draft'}<textarea aria-label={zh ? '旁问草稿' : 'Question draft'} rows={3} value={currentThread.draft} onChange={event => conversation.edit(currentThread.id, { draft: event.target.value })} /></label>
    <div className="side-question-toolbar"><button className="primary-button" disabled={!ready || running || attaching || !currentThread.draft.trim()} onClick={() => void conversation.ask()}>{zh ? '发送旁问' : 'Ask question'}</button>{preparing && <button className="quiet-button" onClick={conversation.cancelPreparation}>{zh ? '取消准备' : 'Cancel preparation'}</button>}<span className="desktop-tool-hint" role="status">{!ready ? zh ? '正在恢复…' : 'Restoring…' : preparing ? zh ? '正在准备附件…' : 'Preparing attachments…' : cancelling ? zh ? '正在结束上一个旁问…' : 'Ending the previous question…' : saveStatus.error ? zh ? '待重试保存' : 'Save pending retry' : saveStatus.dirty ? zh ? '正在保存…' : 'Saving…' : zh ? '已保存' : 'Saved'}</span></div>
    </div>
  </section>;
}
