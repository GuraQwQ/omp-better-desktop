export function fileMentionAt(text: string, caret: number) {
  const match = /(?:^|\s)@([^\s@"]*)$/.exec(text.slice(0, caret));
  return match ? { start: caret - match[1].length - 1, end: caret, query: match[1] } : null;
}

export function matchingFiles(files: string[], query: string): string[] {
  const needle = query.toLowerCase().replaceAll('\\', '/');
  const score = (path: string) => path.split('/').at(-1)!.toLowerCase().startsWith(needle) ? 0 : path.toLowerCase().startsWith(needle) ? 1 : 2;
  return [...new Set(files)].filter(path => path.toLowerCase().includes(needle)).sort((a, b) => score(a) - score(b) || a.localeCompare(b)).slice(0, 30);
}

export function insertFileMention(text: string, range: { start: number; end: number }, path: string) {
  const reference = `@"${path.replaceAll('\\', '/').replaceAll('"', '\\"')}" `;
  return { text: text.slice(0, range.start) + reference + text.slice(range.end), caret: range.start + reference.length };
}
