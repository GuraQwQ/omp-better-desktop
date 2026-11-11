import type { Message } from './types';

export interface QuestionResponseRow {
  id: string;
  question: string;
  header?: string | null;
  selectedOptions: string[];
  customInput: string;
}
export interface QuestionResponseRecord { questionId: string; answers: QuestionResponseRow[] }

const start = '[omp-desktop-question-response]\n';
const end = '\n[/omp-desktop-question-response]';

export function readQuestionResponse(message: Message): QuestionResponseRecord | undefined {
  if (message.role !== 'user') return;
  const content = message.content;
  const text = typeof content === 'string' ? content : Array.isArray(content) && content.every(block => block?.type === 'text' && typeof block.text === 'string') ? content.map(block => block.text).join('\n') : '';
  if (!text.startsWith(start) || !text.endsWith(end)) return;
  try {
    const record = JSON.parse(text.slice(start.length, -end.length));
    if (!record || typeof record.questionId !== 'string' || !/^desktop-ask-[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(record.questionId) || !Array.isArray(record.answers) || record.answers.length < 1 || record.answers.length > 3) return;
    const ids = new Set<string>();
    for (const answer of record.answers) {
      if (!answer || typeof answer.id !== 'string' || !answer.id.trim() || ids.has(answer.id) || typeof answer.question !== 'string' || !answer.question.trim() || answer.header != null && typeof answer.header !== 'string' || !Array.isArray(answer.selectedOptions) || answer.selectedOptions.some((option: unknown) => typeof option !== 'string') || typeof answer.customInput !== 'string' || !answer.selectedOptions.length && !answer.customInput.trim()) return;
      ids.add(answer.id);
    }
    return record;
  } catch {
    return;
  }
}
