import type { Json, QuestionDraft, SessionView } from './types';

export const QUESTION_CONFIRMATION_PENDING = 'Answer confirmation is still pending. Retry to check the same submission.';

export function createQuestionDraft(question: Json): QuestionDraft {
  return { value: String(question.prefill ?? question.defaultValue ?? ''), answers: {} };
}

export function questionDraft(session: SessionView, question: Json): QuestionDraft {
  return session.questionDrafts?.[question.id] ?? createQuestionDraft(question);
}

export function questionAnswersComplete(question: Json, draft: QuestionDraft): boolean {
  return question.method !== 'ask' || Array.isArray(question.questions) && question.questions.length > 0 && question.questions.every((item: Json) => {
    const answer = draft.answers[item.id];
    return !!answer && (answer.selectedOptions.length > 0 || !!answer.customInput.trim());
  });
}

export function answerableQuestion(session: SessionView | undefined, id: string): Json | undefined {
  if (!session || session.historyOnly) return;
  const question = session.pending.find(item => item.id === id);
  return question && !questionDraft(session, question).submitting ? question : undefined;
}

export function updateQuestionDraft(session: SessionView, id: string, update: (draft: QuestionDraft) => QuestionDraft): SessionView {
  const question = session.pending.find(item => item.id === id);
  if (!question) return session;
  return { ...session, questionDrafts: { ...session.questionDrafts, [id]: update(questionDraft(session, question)) } };
}

export function removeQuestion(session: SessionView, id: string): SessionView {
  const drafts = { ...session.questionDrafts };
  delete drafts[id];
  return { ...session, pending: session.pending.filter(item => item.id !== id), questionDrafts: Object.keys(drafts).length ? drafts : undefined };
}

export function completeQuestion(session: SessionView, question: Json): SessionView {
  // 相同 ID 的新请求不能被旧提交的迟到响应清除。
  return session.pending.some(item => item === question) ? removeQuestion(session, question.id) : session;
}

export function clearQuestions(session: SessionView): SessionView {
  return { ...session, pending: [], questionDrafts: undefined };
}
