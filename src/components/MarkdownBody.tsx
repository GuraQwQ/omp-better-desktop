import { useLayoutEffect, useMemo, useRef, type ComponentPropsWithoutRef } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import ZoomableImage from './ZoomableImage';
import { LinkSource, TargetLink } from './LinkTargets';
import { safeGenUIUrl } from '../lib/genui';
import remarkGfm from 'remark-gfm';
import CopyButton from './CopyButton';
import type { Copy } from '../lib/i18n';
import { revealStreamText } from '../lib/stream-reveal';

type WithNode<T extends 'a' | 'pre' | 'img'> = ComponentPropsWithoutRef<T> & { node?: unknown };

// 代码块右上角的复制按钮，悬停或聚焦时才显示。
function CodeBlock({ t, children, ...props }: ComponentPropsWithoutRef<'pre'> & { t: Copy }) {
  const ref = useRef<HTMLPreElement>(null);
  return <div className="code-block"><pre ref={ref} {...props}>{children}</pre><CopyButton className="code-copy" size={12} label={t.copy} doneLabel={t.copied} source={() => ref.current?.textContent ?? ''} /></div>;
}

// 独立成块以便按需加载：react-markdown 与 remark-gfm 不进入主包。
export default function MarkdownBody({ text, t, live = false, sourceDirectory }: { text: string; t: Copy; live?: boolean; sourceDirectory?: string }) {
  const previous = useRef(text);
  const from = previous.current.length;
  const reveal = live && text.startsWith(previous.current) && from < text.length && document.documentElement.dataset.motion === 'rich' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  useLayoutEffect(() => { previous.current = text; }, [text]);
  const components = useMemo(() => ({
    a: ({ node: _node, ...props }: WithNode<'a'>) => <TargetLink {...props} target="_blank" rel="noreferrer" />,
    img: ({ node: _node, ...props }: WithNode<'img'>) => <ZoomableImage {...props} />,
    pre: ({ node: _node, ...props }: WithNode<'pre'>) => <CodeBlock t={t} {...props} />,
  }), [t]);
  return <LinkSource directory={sourceDirectory}><ReactMarkdown urlTransform={(url, key) => key === 'src' ? safeGenUIUrl(url, true) ?? defaultUrlTransform(url) : key === 'href' && /^(?:file:|[a-z]:[\\/])/i.test(url) ? url : defaultUrlTransform(url)} remarkPlugins={reveal ? [remarkGfm, () => tree => revealStreamText(tree, from, text)] : [remarkGfm]} components={components}>{text}</ReactMarkdown></LinkSource>;
}
