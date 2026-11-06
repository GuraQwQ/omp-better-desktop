interface TextNode {
  type: string;
  value?: string;
  children?: TextNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

// 只装饰新到达的短尾部；大批输出立即展示，代码与原始文本保持完整。
export function revealStreamText(tree: TextNode, from: number, source: string): void {
  const tails: { parent: TextNode; index: number; node: TextNode; prefix: string; chars: string[]; count: number }[] = [];
  const visit = (parent: TextNode) => {
    if (['code', 'inlineCode', 'html'].includes(parent.type)) return;
    parent.children?.forEach((node, index) => {
      if (node.type !== 'text' || !node.value) { visit(node); return; }
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start === undefined || end === undefined || end <= from) return;
      const raw = source.slice(start, end);
      if (start < from && raw !== node.value) return;
      const cut = Math.max(0, from - start);
      tails.push({ parent, index, node, prefix: node.value.slice(0, cut), chars: Array.from(graphemes.segment(node.value.slice(cut)), item => item.segment), count: 0 });
    });
  };
  visit(tree);
  let budget = 12;
  for (let i = tails.length - 1; i >= 0 && budget; i--) { tails[i].count = Math.min(budget, tails[i].chars.length); budget -= tails[i].count; }
  let delay = 0;
  const replacements = tails.filter(tail => tail.count).map(tail => {
    const prefix = tail.prefix + tail.chars.slice(0, -tail.count).join('');
    const children: TextNode[] = prefix ? [{ type: 'text', value: prefix }] : [];
    for (const value of tail.chars.slice(-tail.count)) children.push({ type: 'text', value, data: { hName: 'span', hProperties: { className: ['stream-char'], style: `--stream-delay:${delay++ * 30}ms` } } });
    return { ...tail, children };
  });
  for (const { parent, index, children } of replacements.reverse()) parent.children!.splice(index, 1, ...children);
}
