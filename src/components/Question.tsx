import { useState } from 'react';
import { ExternalLink, MessageCircleQuestion } from 'lucide-react';
import type { Copy } from '../lib/i18n';
import type { Json } from '../lib/types';
import { request } from '../lib/bridge';

export default function Question({ question, t, answer }: { question: Json; t: Copy; answer: (response: Json) => Promise<void> }) {
  const [value, setValue] = useState(question.defaultValue ?? '');
  const [answers, setAnswers] = useState<Record<string, { selectedOptions: string[]; customInput: string }>>({});
  const [busy, setBusy] = useState(false);
  const respond = async (fields: Json) => { setBusy(true); try { await answer({ type: 'extension_ui_response', id: question.id, ...fields }); } finally { setBusy(false); } };
  return <section className="question" aria-label={t.pending}>
    <div className="question-heading"><MessageCircleQuestion size={18} /><strong>{question.title ?? t.pending}</strong></div>
    {question.message && <p className="preserve-lines">{question.message}</p>}
    {question.method === 'open_url' ? <><p>{question.instructions}</p><button className="primary-button" onClick={() => request('system.open_url', { url: question.launchUrl ?? question.url }).catch(() => window.open(question.launchUrl ?? question.url, '_blank'))}><ExternalLink size={14} />{t.open}</button><button className="quiet-button" onClick={() => respond({ cancelled: true })}>{t.done}</button></> : <>
      {question.method === 'ask' ? question.questions.map((q: Json) => <fieldset key={q.id}><legend>{q.question}</legend><div className="answer-options">{q.options.map((option: Json) => {
        const current = answers[q.id] ?? { selectedOptions: [], customInput: '' };
        const checked = current.selectedOptions.includes(option.label);
        return <label className="answer-option" key={option.label}><input type={q.multi ? 'checkbox' : 'radio'} name={q.id} checked={checked} onChange={() => setAnswers(old => ({ ...old, [q.id]: { ...current, customInput: q.multi ? current.customInput : '', selectedOptions: q.multi ? checked ? current.selectedOptions.filter(s => s !== option.label) : [...current.selectedOptions, option.label] : [option.label] } }))} /><span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span></label>;
      })}</div><input value={answers[q.id]?.customInput ?? ''} placeholder={t.customAnswer} onChange={event => setAnswers(old => ({ ...old, [q.id]: { selectedOptions: q.multi ? old[q.id]?.selectedOptions ?? [] : [], customInput: event.target.value } }))} /></fieldset>) : question.method === 'select' ? <div className="answer-options">{question.options?.map((option: string, index: number) => <button className={`answer-option ${value === option ? 'selected' : ''}`} key={option} onClick={() => setValue(option)}><span><strong>{option}</strong><small>{question.optionDetails?.[index]?.description}</small></span></button>)}</div> : question.method === 'input' || question.method === 'editor' ? question.secret ? <input type="password" autoComplete="off" value={value} onChange={event => setValue(event.target.value)} placeholder={question.placeholder ?? t.customAnswer} /> : <textarea rows={question.method === 'editor' ? 5 : 2} value={value} onChange={event => setValue(event.target.value)} placeholder={question.placeholder ?? t.customAnswer} /> : null}
      <div className="question-actions"><button className="quiet-button" disabled={busy} onClick={() => respond(question.method === 'confirm' ? { confirmed: false } : { cancelled: true })}>{question.method === 'confirm' ? t.decline : t.cancel}</button><button className="primary-button" disabled={busy} onClick={() => respond(question.method === 'confirm' ? { confirmed: true } : question.method === 'ask' ? { answers: question.questions.map((q: Json) => ({ id: q.id, ...(answers[q.id] ?? { selectedOptions: [], customInput: '' }) })) } : { value })}>{question.method === 'confirm' ? t.approve : t.submit}</button></div>
    </>}
  </section>;
}
