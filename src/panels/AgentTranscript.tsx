import { lazy, Suspense } from 'react';
import type { Copy } from '../lib/i18n';
import type { Message } from '../lib/types';
import ToolResult from '../components/ToolResult';

const MarkdownBody = lazy(() => import('../components/MarkdownBody'));
export default function AgentTranscript({ messages, t, zh, active = false }: { messages: Message[]; t: Copy; zh: boolean; active?: boolean }) {
  return <>{messages.map((message, index) => message.role === 'tool' || message.role === 'toolResult' ? <ToolResult key={`${message.id}:${index}`} message={message} t={t} active={active} /> : <article key={`${message.id}:${index}`} className={`agent-message agent-message-${message.role}`}><strong>{message.role === 'user' ? zh ? '输入' : 'Input' : message.role === 'assistant' ? zh ? '助手' : 'Assistant' : message.role}</strong>{Array.isArray(message.content) && message.content.some(block => block.type === 'thinking') && <details className="agent-thinking"><summary>{zh ? '思考' : 'Thinking'}</summary><pre>{message.content.filter(block => block.type === 'thinking').map(block => block.thinking ?? '').join('\n')}</pre></details>}<div className="agent-message-content"><Suspense fallback={<p>{t.loading}</p>}><MarkdownBody text={typeof message.content === 'string' ? message.content : message.content.filter(block => block.type === 'text').map(block => block.text ?? '').join('\n')} t={t} /></Suspense></div></article>)}</>;
}
