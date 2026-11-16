import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { LinkSource, TargetLink } from '../components/LinkTargets';
import ZoomableImage from '../components/ZoomableImage';
import { safeGenUIUrl } from '../lib/genui';

// 序号只在正文中定位，代码、现有链接和生成式界面内容都保持只读。
function sequenceReferences() {
  return (tree: any) => {
    const visit = (node: any) => {
      if (!node.children || ['link', 'code', 'inlineCode'].includes(node.type)) return;
      node.children = node.children.flatMap((child: any) => {
        if (child.type !== 'text') { visit(child); return [child]; }
        const parts: any[] = [];
        let offset = 0;
        for (const match of child.value.matchAll(/#(\d+)\b/g)) {
          if (match.index > offset) parts.push({ type: 'text', value: child.value.slice(offset, match.index) });
          parts.push({ type: 'link', url: `#swarm-post-${match[1]}`, children: [{ type: 'text', value: match[0] }] });
          offset = match.index + match[0].length;
        }
        return parts.length ? [...parts, { type: 'text', value: child.value.slice(offset) }] : [child];
      });
    };
    visit(tree);
  };
}

export default function SwarmPostBody({ text, directory, onReference, hasReference }: { text: string; directory?: string; onReference?: (sequence: number) => void; hasReference?: (sequence: number) => boolean }) {
  return <div className="swarm-board-markdown"><LinkSource directory={directory}><ReactMarkdown remarkPlugins={[remarkGfm, sequenceReferences]} skipHtml urlTransform={(url, key) => key === 'src' ? safeGenUIUrl(url, true) ?? defaultUrlTransform(url) : key === 'href' && /^(?:file:|[a-z]:[\\/])/i.test(url) ? url : defaultUrlTransform(url)} components={{ a: ({ href, children }) => {
    const sequence = /^#swarm-post-\d+$/.test(href ?? '') ? Number(href!.split('-').at(-1)) : undefined;
    return sequence !== undefined && onReference ? <button className="swarm-sequence-link" disabled={hasReference?.(sequence) === false} onClick={() => onReference(sequence)}>{children}</button> : <TargetLink href={href} target="_blank" rel="noreferrer">{children}</TargetLink>;
  }, img: ({ node: _node, ...props }) => <ZoomableImage {...props} /> }}>{text}</ReactMarkdown></LinkSource></div>;
}
