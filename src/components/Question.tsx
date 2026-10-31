import { useId } from 'react';
import { ExternalLink, MessageCircleQuestion } from 'lucide-react';
import { localizeError, type Copy } from '../lib/i18n';
import type { Json, Language, QuestionDraft } from '../lib/types';
import { request } from '../lib/bridge';
import './question.css';

export default function Question({ question, draft, change, language, t, answer }: { question: Json; draft: QuestionDraft; change: (update: (draft: QuestionDraft) => QuestionDraft) => void; language: Language; t: Copy; answer: (response: Json) => Promise<void> }) {
  const controlId = useId();
  const zh = language === 'zh';
  const busy = !!draft.submitting;
  const questions: Json[] = Array.isArray(question.questions) ? question.questions : [];
  const edit = (update: (value: QuestionDraft) => QuestionDraft) => change(value => ({ ...update(value), error: undefined }));
  const respond = (fields: Json) => { if (!busy) void answer({ type: 'extension_ui_response', id: question.id, ...fields }); };
  const cancel = () => respond(question.method === 'confirm' ? { confirmed: false } : { cancelled: true });
  const submit = () => respond(question.method === 'confirm' ? { confirmed: true } : question.method === 'ask' ? { answers: questions.map(q => ({ id: q.id, ...(draft.answers[q.id] ?? { selectedOptions: [], customInput: '' }) })) } : { value: draft.value });
  return <section className="question" aria-label={t.pending} onKeyDown={event => { if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); cancel(); } }}>
    <div className="question-heading"><MessageCircleQuestion size={18} aria-hidden="true" /><strong>{question.title ?? t.pending}</strong>{question.async && <span className="question-background">{zh ? '异步提问' : 'Asynchronous'}</span>}</div>
    {question.message && <p className="preserve-lines">{question.message}</p>}
    {question.async && <p>{zh ? '任务会继续运行，你可以稍后回答。' : 'Work continues while you consider your answer.'}</p>}
    {draft.error && <p className="question-error" role="alert">{localizeError(draft.error, language)}</p>}
    {question.method === 'open_url' ? <><p>{question.instructions}</p><button type="button" className="primary-button" onClick={() => request('system.open_url', { url: question.launchUrl ?? question.url }).catch(() => window.open(question.launchUrl ?? question.url, '_blank'))}><ExternalLink size={14} />{t.open}</button><button type="button" className="quiet-button" disabled={busy} onClick={() => respond({ cancelled: true })}>{t.done}</button></> : <form onSubmit={event => { event.preventDefault(); submit(); }} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.requestSubmit(); } }}>
      <div className="question-fields">{question.method === 'ask' ? questions.map(q => <fieldset key={q.id} disabled={busy}><legend>{q.header && <strong className="question-field-header">{q.header}</strong>}{q.question}</legend>
        <div className="answer-options">{(Array.isArray(q.options) ? q.options : []).map((option: Json, index: number) => {
          const checked = draft.answers[q.id]?.selectedOptions.includes(option.label) ?? false;
          return <label className="answer-option" key={option.label}><input type={q.multi ? 'checkbox' : 'radio'} name={controlId + '-' + q.id} checked={checked} onChange={() => edit(old => {
            const current = old.answers[q.id] ?? { selectedOptions: [], customInput: '' };
            const selected = current.selectedOptions.includes(option.label);
            return { ...old, answers: { ...old.answers, [q.id]: { customInput: q.multi ? current.customInput : '', selectedOptions: q.multi ? selected ? current.selectedOptions.filter(value => value !== option.label) : [...current.selectedOptions, option.label] : [option.label] } } };
          })} /><span><strong>{option.label}{q.recommended === index && <span className="question-recommendation">{zh ? '推荐' : 'Recommended'}</span>}</strong>{option.description && <small>{option.description}</small>}</span></label>;
        })}</div>
        <input aria-label={q.question ?? t.customAnswer} value={draft.answers[q.id]?.customInput ?? ''} placeholder={t.customAnswer} onChange={event => { const value = event.target.value; edit(old => ({ ...old, answers: { ...old.answers, [q.id]: { selectedOptions: q.multi ? old.answers[q.id]?.selectedOptions ?? [] : [], customInput: value } } })); }} />
      </fieldset>) : question.method === 'select' ? <div className="answer-options">{(Array.isArray(question.options) ? question.options : []).map((option: string, index: number) => <button type="button" className={'answer-option' + (draft.value === option ? ' selected' : '')} key={option} disabled={busy} aria-pressed={draft.value === option} onClick={() => edit(old => ({ ...old, value: option }))}><span><strong>{option}{question.optionDetails?.[index]?.recommended && <span className="question-recommendation">{zh ? '推荐' : 'Recommended'}</span>}</strong><small>{question.optionDetails?.[index]?.description}</small></span></button>)}</div> : question.method === 'input' || question.method === 'editor' ? question.secret ? <input className="question-control" type="password" autoComplete="off" aria-label={question.title ?? t.customAnswer} disabled={busy} value={draft.value} onChange={event => { const value = event.target.value; edit(old => ({ ...old, value })); }} placeholder={question.placeholder ?? t.customAnswer} /> : <textarea aria-label={question.title ?? t.customAnswer} rows={question.method === 'editor' ? 5 : 2} disabled={busy} value={draft.value} onChange={event => { const value = event.target.value; edit(old => ({ ...old, value })); }} placeholder={question.placeholder ?? t.customAnswer} /> : null}
      </div><div className="question-actions"><button type="button" className="quiet-button" disabled={busy} onClick={cancel}>{question.method === 'confirm' ? t.decline : t.cancel}</button><button type="submit" className="primary-button" disabled={busy}>{busy ? t.loading : question.method === 'confirm' ? t.approve : t.submit}</button></div>
    </form>}
  </section>;
}
