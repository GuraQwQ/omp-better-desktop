export type GenUIKind = 'openui' | 'html';
export interface GenUIBlock { kind: GenUIKind; source: string; index: number; start: number; end: number; complete: boolean; previous?: GenUIBlock }
export type GenUIRepairs = Record<string, GenUIBlock>;
export function collectGenUIRepairs(texts: Iterable<string>): GenUIRepairs {
  const repairs: GenUIRepairs = {};
  for (const text of texts) for (const block of extractGenUIBlocks(text)) {
    const target = genUIRepairTarget(block.source);
    if (target) repairs[target] = { ...block, previous: repairs[target] };
  }
  return repairs;
}

export function extractGenUIBlocks(text: string): GenUIBlock[] {
  const blocks: GenUIBlock[] = [];
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  let offset = 0;
  let fence: { marker: string; length: number; kind?: GenUIKind; start: number; content: number } | undefined;
  for (const line of lines) {
    const opening = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)/.exec(line);
    if (!fence && opening) {
      const language = opening[2].trim().toLowerCase();
      const kind = ['openui', 'openui-lang'].includes(language) ? 'openui' : ['genui-html', 'generative-html'].includes(language) ? 'html' : undefined;
      fence = { marker: opening[1][0], length: opening[1].length, kind, start: offset, content: offset + line.length };
    } else if (fence && new RegExp(`^ {0,3}${fence.marker}{${fence.length},}\\s*$`).test(line)) {
      if (fence.kind) blocks.push({ kind: fence.kind, source: text.slice(fence.content, offset).replace(/\r?\n$/, ''), index: blocks.length, start: fence.start, end: offset + line.length, complete: true });
      fence = undefined;
    }
    offset += line.length;
  }
  if (fence?.kind) blocks.push({ kind: fence.kind, source: text.slice(fence.content), index: blocks.length, start: fence.start, end: text.length, complete: false });
  return blocks;
}

export function genUIRepairMessage(id: string, kind: GenUIKind, source: string, error: string, state: Record<string, unknown>) {
  const marker = (name: string, value: string) => `${kind === 'html' ? '<!--' : '//'} ${name}: ${value}${kind === 'html' ? ' -->' : ''}`;
  return `请修复生成式界面 ${id}，保留用户当前输入和已有功能。输出完整的 ${kind === 'html' ? 'genui-html' : 'openui'} 代码围栏，前两行必须为：\n${marker('omp-genui-target',id)}\n${marker('omp-genui-base',genUIRevision(source))}\n错误：${error}\n当前本地状态：${JSON.stringify(state)}\n当前源码：\n${source}`;
}

export function genUIRepairTarget(source: string): string | undefined {
  return /^\s*(?:\/\/|<!--)\s*omp-genui-target:\s*([^\s<>]+)(?:\s*-->)?/.exec(source)?.[1];
}

export function genUIRevision(source: string): string {
  let hash = 14695981039346656037n;
  for (let index = 0; index < source.length; index++) { hash ^= BigInt(source.charCodeAt(index)); hash = BigInt.asUintN(64, hash * 1099511628211n); }
  return `${source.length}-${hash.toString(16)}`;
}

export function resolveGenUIRepair(original: GenUIBlock, latest?: GenUIBlock): GenUIBlock | undefined {
  const chain: GenUIBlock[] = [];
  for (let block = latest; block; block = block.previous) chain.push(block);
  let current = original;
  for (const block of chain.reverse()) {
    const base = /(?:\/\/|<!--)\s*omp-genui-base:\s*([^\s<>]+)/.exec(block.source)?.[1];
    if (base === genUIRevision(current.source)) current = block;
  }
  return current === original ? undefined : current;
}

export function safeGenUIUrl(value: unknown, allowImageData = false): string | undefined {
  if (typeof value !== 'string') return undefined;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) || allowImageData && /^data:image\//i.test(value) ? url.href : undefined; } catch { return undefined; }
}
