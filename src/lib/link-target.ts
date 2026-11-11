export type LinkTarget = { kind: 'url'; url: string } | { kind: 'file'; path: string; relative?: string; line?: number };

function normalizePath(value: string): string {
  const path = value.replace(/\\/g, '/');
  const prefix = /^[a-z]:\//i.exec(path)?.[0] ?? (path.startsWith('//') ? '//' : path.startsWith('/') ? '/' : '');
  const parts: string[] = [];
  for (const part of path.slice(prefix.length).split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop(); else parts.push(part);
  }
  return prefix + parts.join('/');
}

export function resolveLinkTarget(href: string, cwd: string): LinkTarget | undefined {
  if (!href || href.startsWith('#')) return;
  if (/^https?:\/\//i.test(href)) {
    try { return { kind: 'url', url: new URL(href).href }; } catch { return; }
  }
  let path = href;
  if (/^file:/i.test(path)) {
    try { const url = new URL(path); path = (url.hostname && url.hostname !== 'localhost' ? `//${url.hostname}` : '') + url.pathname + url.hash; } catch { return; }
    path = path.replace(/^\/([a-z]:\/)/i, '$1');
  } else if (/^[a-z][\w+.-]*:/i.test(path) && !/^[a-z]:[\\/]/i.test(path)) return;
  const lineMatch = /(?:#L|:)(\d+)(?::\d+)?$/.exec(path);
  if (lineMatch) path = path.slice(0, -lineMatch[0].length);
  try { path = decodeURIComponent(path); } catch { /* 非网址形式的本地百分号保持原样。 */ }
  const absolute = /^(?:[a-z]:[\\/]|[\\/])/i.test(path);
  if (!absolute && !cwd) return;
  path = normalizePath(absolute ? path : `${cwd}/${path}`);
  const base = normalizePath(cwd).replace(/\/$/, '');
  const windows = /^[a-z]:\//i.test(path) || path.startsWith('//');
  const compare = (value: string) => windows ? value.toLowerCase() : value;
  const relative = base && compare(path).startsWith(compare(base) + '/') ? path.slice(base.length + 1) : undefined;
  return { kind: 'file', path, ...(relative ? { relative } : {}), ...(lineMatch ? { line: Number(lineMatch[1]) } : {}) };
}
