import { MessageCircleQuestion } from 'lucide-react';
import type { Copy } from '../lib/i18n';
import type { QuestionResponseRecord } from '../lib/question-response';
import './question-response.css';

export default function QuestionResponse({ record, t }: { record: QuestionResponseRecord; t: Copy }) {
  return <section className="question-response" aria-label={t.questionAnswers}>
    <div className="question-response-heading"><MessageCircleQuestion size={14} aria-hidden="true" /><span>{t.questionAnswers}</span></div>
    <dl>{record.answers.map(answer => <div className="question-response-row" key={answer.id}>
      <dt>{answer.header && <span>{answer.header}</span>}{answer.question}</dt>
      <dd>{answer.selectedOptions.length > 0 && <ul>{answer.selectedOptions.map(option => <li key={option}>{option}</li>)}</ul>}{answer.customInput && <p>{answer.customInput}</p>}</dd>
    </div>)}</dl>
  </section>;
}
