import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Question from '../src/components/Question';
import { copy, localizeError } from '../src/lib/i18n';
import { request } from '../src/lib/bridge';
import { answerableQuestion, clearQuestions, completeQuestion, createQuestionDraft, questionDraft, removeQuestion, updateQuestionDraft } from '../src/lib/question-draft';
import { applyEvent, isSessionRunning, returnFromTerminal } from '../src/lib/session-state';
import type { Json, SessionView } from '../src/lib/types';

const ask: Json = { type: 'extension_ui_request', method: 'ask', id: 'question-1', async: true, title: '选择目标', questions: [{ id: 'target', header: '目标', question: '选哪一个？', recommended: 0, options: [{ label: 'A' }] }] };
const freeText: Json = { type: 'extension_ui_request', method: 'ask', id: 'question-2', questions: [{ id: 'notes', question: '补充说明' }] };
const makeSession = (id: string): SessionView => ({ id, cwd: '/project', path: '/session/one.jsonl', title: id, messages: [], pending: [], status: 'running', state: { isStreaming: true, isSettled: false } });
let first = applyEvent(makeSession('first'), ask);
let second = applyEvent(makeSession('second'), ask);
assert.equal(isSessionRunning(first), true, '后台提问不能暂停运行状态');
assert.deepEqual(createQuestionDraft(ask).answers, {}, '推荐项不能自动写成已提交的选择');

first = updateQuestionDraft(first, ask.id, draft => ({ ...draft, answers: { target: { selectedOptions: ['A'], customInput: '第一会话输入' } } }));
second = updateQuestionDraft(second, ask.id, draft => ({ ...draft, answers: { target: { selectedOptions: [], customInput: '第二会话输入' } } }));
const sessions = { first, second };
assert.equal(questionDraft(sessions.first, ask).answers.target.customInput, '第一会话输入');
assert.equal(questionDraft(sessions.second, ask).answers.target.customInput, '第二会话输入', '相同问题 ID 的不同会话草稿不能串用');
assert.equal(applyEvent(first, { ...ask }), first, '同一请求重发应保留草稿与请求身份');

first = applyEvent(first, freeText);
first = updateQuestionDraft(first, freeText.id, draft => ({ ...draft, answers: { notes: { selectedOptions: [], customInput: '自由文本' } } }));
assert.equal(answerableQuestion(first, ask.id), ask);
first = updateQuestionDraft(first, ask.id, draft => ({ ...draft, submitting: true }));
assert.equal(answerableQuestion(first, ask.id), undefined, '提交中的请求应拒绝第二次提交');
first = updateQuestionDraft(first, ask.id, draft => ({ ...draft, submitting: false, error: '暂时失败' }));
assert.equal(answerableQuestion(first, ask.id), ask, '失败后可以重试');
assert.equal(questionDraft(first, ask).answers.target.customInput, '第一会话输入', '失败后保留已填写内容');
first = completeQuestion(first, ask);
assert.deepEqual(first.pending.map(question => question.id), [freeText.id]);
assert.equal(first.questionDrafts?.[ask.id], undefined);
assert.equal(first.questionDrafts?.[freeText.id].answers.notes.customInput, '自由文本', '完成一个请求不能清理另一个请求');

const replaced = applyEvent(first, { ...freeText, title: '新的请求内容' });
assert.equal(replaced.questionDrafts?.[freeText.id], undefined, '同 ID 新请求不能继承旧草稿');
assert.equal(completeQuestion(replaced, freeText), replaced, '旧提交迟到不能删除新请求');
assert.equal(updateQuestionDraft(first, 'missing', draft => ({ ...draft, value: 'stale' })), first, '已取消请求不能被迟到编辑重新创建');
assert.equal(answerableQuestion(undefined, ask.id), undefined);

const secret: Json = { type: 'extension_ui_request', method: 'input', id: 'secret', secret: true };
const withSecret = updateQuestionDraft(applyEvent(first, secret), secret.id, draft => ({ ...draft, value: 'test-only secret' }));
const cancelled = applyEvent(withSecret, { type: 'extension_ui_request', method: 'cancel', targetId: secret.id });
assert.equal(cancelled.questionDrafts?.secret, undefined, '运行时取消应清除秘密输入草稿');
assert.equal(cancelled.pending.some(question => question.id === secret.id), false);
assert.equal(isSessionRunning(cancelled), true, '取消问题不能改变任务运行状态');
assert.equal(removeQuestion(cancelled, freeText.id).questionDrafts, undefined);

for (const status of ['disconnected', 'released']) {
  const ended = applyEvent(withSecret, { type: 'desktop_status', status });
  assert.deepEqual(ended.pending, []);
  assert.equal(ended.questionDrafts, undefined);
  assert.equal(answerableQuestion(ended, secret.id), undefined);
  assert.equal(applyEvent(ended, ask), ended, '断连后的迟到问题不能恢复为待答');
}
const resumed = { ...clearQuestions(withSecret), historyOnly: false };
assert.deepEqual(resumed.pending, []);
assert.equal(resumed.questionDrafts, undefined, '重连与新会话不迁移旧问题草稿');
assert.deepEqual(returnFromTerminal(withSecret, true).pending, []);
assert.equal(returnFromTerminal(withSecret, true).questionDrafts, undefined);
assert.equal(returnFromTerminal(withSecret, false), withSecret);

const settled = applyEvent(withSecret, { type: 'session_settled' });
assert.equal(settled.pending.length, withSecret.pending.length, '任务完成时仍可回答后台问题');
assert.equal(settled.questionDrafts, withSecret.questionDrafts);
assert.equal(isSessionRunning(settled), false);
assert.equal(applyEvent(withSecret, { type: 'session_info_update', title: '新标题' }).questionDrafts, withSecret.questionDrafts);
assert.equal(applyEvent({ ...withSecret, path: undefined }, { type: 'session_info_update', sessionFile: '/first-save.jsonl' }).questionDrafts, withSecret.questionDrafts, '首次保存会话不能清除问题');
assert.equal(applyEvent(withSecret, { type: 'session_info_update', sessionFile: '/session/two.jsonl' }).questionDrafts, undefined, '底层会话切换应清除旧请求');
assert.equal(applyEvent(withSecret, { type: 'session_info_update', sessionFile: null }).questionDrafts, undefined);
const markup = renderToStaticMarkup(createElement(Question, {
  question: { ...ask, questions: [...ask.questions, ...freeText.questions] }, draft: createQuestionDraft(ask), change: () => {}, language: 'zh', t: copy('zh'), answer: async () => {},
}));
assert(markup.includes('补充说明'), '没有 options 的原生问题仍应渲染');
assert(markup.includes('推荐'), '推荐项应有可见标记');
assert(!/ checked(?:=|\s|>)/.test(markup), '推荐标记不能自动选中或提交');
assert.equal(createQuestionDraft({ method: 'editor', prefill: '原生编辑内容' }).value, '原生编辑内容');
assert.equal(localizeError('Choose valid answers or enter a custom response.', 'zh'), '请选择一个选项，或输入自己的回答。');
assert.equal(localizeError('Choose valid answers or enter a custom response.', 'en'), 'Choose valid answers or enter a custom response.');
assert.equal((await request('bootstrap')).preferences.asyncQuestions, true, '异步提问默认开启');
await request('preferences.set', { patch: { asyncQuestions: false } });
assert.equal((await request('bootstrap')).preferences.asyncQuestions, false, '显式关闭应保留');
await request('preferences.set', { patch: { language: 'zh', theme: 'dark' } });
const previewPreferences = await request('preferences.set', { patch: { asyncQuestions: true } });
assert.equal(previewPreferences.language, 'zh');
assert.equal(previewPreferences.theme, 'dark');
assert.equal(previewPreferences.asyncQuestions, true, '网页预览应和宿主一样返回完整偏好，切换后台提问不丢失其它选项');
console.log('后台提问运行状态、会话草稿隔离、重试/双提交、取消/断连/重连和迟到响应检查通过。');
