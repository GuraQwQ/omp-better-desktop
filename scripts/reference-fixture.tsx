import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Transcript from '../src/components/Transcript';
import ComposerReferences from '../src/components/ComposerReferences';
import { copy } from '../src/lib/i18n';
import { appendReferences, createMessageReference, encodeReferencedPrompt, type ConversationReference, type SelectionContext } from '../src/lib/references';
import type { Message } from '../src/lib/types';
import '../src/tokens.css';
import '../src/styles.css';

const source = { sessionId: 'reference-fixture', sessionTitle: '完整来源示例', sessionPath: 'D:/很长的项目路径/会话/history.jsonl' };
const messages: Message[] = [
  { id: 'user-1', role: 'user', content: '请比较这两段内容。' },
  { id: 'assistant-1', role: 'assistant', content: [{ type: 'text', text: '第一段内容用于测试跨消息引用。' }, { type: 'toolCall', id: 'call-1', name: 'read', arguments: { path: 'D:/完整原始调用.ts' } }] },
  { id: 'result-1', role: 'toolResult', toolCallId: 'call-1', toolName: 'read', args: { path: 'D:/完整原始调用.ts' }, content: `完整工具输出\n${'工具结果内容\n'.repeat(2_000)}结尾标记`, result: { details: { resolvedPath: 'D:/完整原始调用.ts', fullDetails: '全部保留' } } },
  { id: 'assistant-2', role: 'assistant', content: '第二段内容保留独立的消息来源。' },
  { id: 'older-result', role: 'toolResult', toolCallId: 'older-call', toolName: 'read', content: '较早历史页中的工具结果。' },
];
const original = createMessageReference(source, messages[1], '带完整来源的既有选段');

function Fixture() {
  const [references, setReferences] = useState<ConversationReference[]>([]);
  const [context, setContext] = useState<SelectionContext>();
  const [sent, setSent] = useState(encodeReferencedPrompt('已发送消息正文', [original]));
  const [opened, setOpened] = useState('');
  const quote = (additions: ConversationReference[]) => setReferences(previous => appendReferences(previous, additions));
  return <main style={{ height: '100vh', display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
    <div style={{ display: 'flex', gap: 8 }}><strong>会话引用验证</strong><button className="quiet-button" onClick={() => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; }}>切换主题</button><button className="quiet-button" onClick={() => setReferences([])}>清空引用</button><button className="quiet-button" onClick={() => { setSent(encodeReferencedPrompt('新正文', references)); setReferences([]); }}>发送引用</button></div>
    <div style={{ flex: 1, minHeight: 0, display: 'flex' }}><Transcript restoreKey="reference-fixture" messages={[...messages, { id: 'sent-1', role: 'user', content: sent }]} t={copy('zh')} busy={false} referenceSource={source} onReference={quote} onSelection={(_text, action, context) => { setContext(context); if (action === 'quote' && context) quote(context.references); }} sideQuestionThreads={[{ id: 'question-1', title: '这处选段的讨论', turns: 2, source: { kind: 'selection', messageId: 'assistant-1', start: 0, end: 4 } }]} onSideQuestionThread={setOpened} /></div>
    <ComposerReferences references={references} onRemove={id => setReferences(previous => previous.filter(reference => reference.id !== id))} />
    <output id="reference-status" style={{ fontSize: 12 }}>{references.length} 条待发送引用{opened ? ` · 打开 ${opened}` : ''}</output>
    <textarea id="reference-data" aria-label="引用诊断数据" readOnly value={JSON.stringify({ references, context })} style={{ height: 45, width: '100%' }} />
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
