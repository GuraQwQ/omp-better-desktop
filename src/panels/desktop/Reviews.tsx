import { useEffect, useRef, useState } from 'react';
import { request } from '../../lib/bridge';
import { messageText } from '../../lib/session-state';
import { parseReview, reviewPrompt, type ReviewReport } from '../../lib/review';
import type { SessionView } from '../../lib/types';

export default function Reviews({ session, onPrompt, onError }: { session?: SessionView; onPrompt: (text: string) => void; onError: (error: unknown) => void }) {
  const key = `review:${session?.path ?? session?.id ?? ''}`;
  const [report, setReport] = useState<ReviewReport | null>(null);
  const [input, setInput] = useState('');
  const [ready, setReady] = useState(false);
  const [working, setWorking] = useState(false);
  const generation = useRef(0);
  const errorHandler = useRef(onError); errorHandler.current = onError;
  useEffect(() => {
    const scope = ++generation.current;
    setReady(false); setReport(null); setInput(''); setWorking(false);
    void request<ReviewReport | null>('desktop.state.get', { key }).then(value => {
      if (scope === generation.current) { setReport(value); setReady(true); }
    }).catch(error => { if (scope === generation.current) errorHandler.current(error); });
    return () => { generation.current++; };
  }, [key]);
  const save = async (value: ReviewReport) => {
    const scope = generation.current; setWorking(true);
    try {
      await request('desktop.state.set', { key, value });
      if (scope !== generation.current) return false;
      setReport(value); return true;
    } catch (error) { if (scope === generation.current) errorHandler.current(error); return false; }
    finally { if (scope === generation.current) setWorking(false); }
  };
  const capture = () => {
    try {
      const candidates = input.trim() ? [input] : (session?.messages ?? []).filter(message => message.role === 'assistant').map(messageText).reverse();
      let parsed: ReviewReport | undefined;
      for (const text of candidates) { try { parsed = parseReview(text); break; } catch { /* 普通回复继续寻找上一份报告 */ } }
      if (!parsed) throw new Error('还没有可读取的评审报告。请先请求评审或粘贴 JSON。');
      void save(parsed);
    } catch (error) { errorHandler.current(error); }
  };
  const change = async (id: string, status: 'open' | 'fixing' | 'verify' | 'resolved') => report ? save({ ...report, issues: report.issues.map(issue => issue.id === id ? { ...issue, status } : issue) }) : false;
  return <>
    <div className="desktop-tool-actions"><button className="quiet-button" disabled={!session || working} onClick={() => onPrompt('评审当前项目或最近改动，给出具体证据和优先级。请用 ```review 围栏输出 JSON：{"summary":"总结","issues":[{"id":"1","title":"具体问题","severity":"P2","file":"相对文件路径","line":1,"evidence":"证据与影响","suggestion":"修复建议"}]}。')}>请求评审</button><button className="quiet-button" disabled={!ready || working} onClick={capture}>读取最新报告</button></div>
    <details><summary>粘贴报告 JSON</summary><textarea aria-label="评审 JSON" rows={5} value={input} disabled={working} onChange={event => setInput(event.target.value)} /><button className="quiet-button" disabled={!ready || working} onClick={capture}>导入报告</button></details>
    {report ? <><p>{report.summary}</p><p>{report.issues.filter(issue => issue.status === 'resolved').length} / {report.issues.length} 已解决</p>{report.issues.map(issue => <article className="desktop-record" key={issue.id}><small>{issue.severity} · {issue.status}</small><h3>{issue.title}</h3>{issue.file && <code>{issue.file}{issue.line ? `:${issue.line}` : ''}</code>}<p>{issue.evidence}</p><p>{issue.suggestion}</p><div className="desktop-tool-actions"><button className="quiet-button" disabled={working} onClick={() => void change(issue.id, 'fixing').then(saved => { if (saved) onPrompt(reviewPrompt(issue)); })}>逐项修复</button><button className="quiet-button" disabled={working} onClick={() => void change(issue.id, 'verify').then(saved => { if (saved) onPrompt(reviewPrompt(issue, true)); })}>复验</button><label><input type="checkbox" checked={issue.status === 'resolved'} disabled={working} onChange={event => void change(issue.id, event.target.checked ? 'resolved' : 'open')} />已解决</label></div></article>)}</> : <p>评审报告与修复进度将保存在当前会话。</p>}
  </>;
}
