import { useMemo, useRef, type ComponentPropsWithoutRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CopyButton from './CopyButton';
import type { Copy } from '../lib/i18n';

type WithNode<T extends 'a' | 'pre'> = ComponentPropsWithoutRef<T> & { node?: unknown };

// 代码块右上角的复制按钮，悬停或聚焦时才显示。
function CodeBlock({ t, children, ...props }: ComponentPropsWithoutRef<'pre'> & { t: Copy }) {
  const ref = useRef<HTMLPreElement>(null);
  return <div className="code-block"><pre ref={ref} {...props}>{children}</pre><CopyButton className="code-copy" size={12} label={t.copy} doneLabel={t.copied} source={() => ref.current?.textContent ?? ''} /></div>;
}

// 独立成块以便按需加载：react-markdown 与 remark-gfm 不进入主包。
export default function MarkdownBody({ text, t }: { text: string; t: Copy }) {
  const components = useMemo(() => ({
    a: ({ node: _node, ...props }: WithNode<'a'>) => <a {...props} target="_blank" rel="noreferrer" />,
    pre: ({ node: _node, ...props }: WithNode<'pre'>) => <CodeBlock t={t} {...props} />,
  }), [t]);
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{text}</ReactMarkdown>;
}
