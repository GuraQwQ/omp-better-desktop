import { describeCommand } from './command-descriptions';
import type { CatalogEntry, Language } from './types';

export interface SlashCompletion { entry: CatalogEntry; token: string; description: string; group: 'commands' | 'skills' | 'extensions' }

export function slashCommandAt(text: string, caret: number) {
  const match = /^[ \t]*\/([^\s/]*)$/.exec(text.slice(0, caret));
  if (!match) return null;
  const suffix = /^[^\s/]*/.exec(text.slice(caret))?.[0] ?? '';
  return { start: caret - match[1].length - 1, end: caret + suffix.length, query: match[1] };
}

export function matchingSlashCommands(entries: CatalogEntry[], query: string, language: Language): SlashCompletion[] {
  const merged = new Map<string, CatalogEntry>();
  for (const entry of entries) {
    if (entry.kind && !['slash', 'skill', 'extension', 'custom', 'mcp_prompt', 'file'].includes(entry.kind)) continue;
    const token = entry.name.replace(/^\//, '');
    if (!token || /[\s/]/.test(token)) continue;
    merged.set(token, { ...merged.get(token), ...entry, name: token });
  }
  const needle = query.toLocaleLowerCase();
  const items: SlashCompletion[] = [];
  for (const [token, entry] of merged) {
    const description = describeCommand(entry, language);
    if (!`${token} ${description} ${entry.description ?? ''} ${(entry.aliases ?? []).join(' ')}`.toLocaleLowerCase().includes(needle)) continue;
    items.push({ entry, token, description, group: entry.source === 'skill' || entry.kind === 'skill' || token.startsWith('skill:') ? 'skills' : entry.source === 'extension' || entry.kind === 'extension' ? 'extensions' : 'commands' });
  }
  const sorted = items.sort((a, b) => Number(!a.token.toLocaleLowerCase().startsWith(needle)) - Number(!b.token.toLocaleLowerCase().startsWith(needle)) || a.token.localeCompare(b.token));
  if (needle) return sorted.slice(0, 30);
  // 空查询给技能和扩展留位置，避免内置命令占满首屏。
  const initial = [...sorted.filter(item => item.group === 'commands').slice(0, 16), ...sorted.filter(item => item.group === 'skills').slice(0, 10), ...sorted.filter(item => item.group === 'extensions').slice(0, 4)];
  const selected = new Set(initial.map(item => item.token));
  return [...initial, ...sorted.filter(item => !selected.has(item.token))].slice(0, 30);
}

export function insertSlashCommand(text: string, range: { start: number; end: number }, token: string) {
  const suffix = text.slice(range.end);
  const separator = /^[ \t]/.test(suffix) ? '' : ' ';
  const inserted = `/${token}${separator}`;
  return { text: text.slice(0, range.start) + inserted + suffix, caret: range.start + inserted.length + (separator ? 0 : 1) };
}

export function composingInput(event: { isComposing?: boolean; keyCode?: number }, composing = false): boolean {
  return composing || !!event.isComposing || event.keyCode === 229;
}

export function completionKey(event: { key: string; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }, count: number): 'next' | 'previous' | 'dismiss' | 'choose' | undefined {
  if (event.key === 'Escape') return 'dismiss';
  if (event.key === 'ArrowDown') return 'next';
  if (event.key === 'ArrowUp') return 'previous';
  if (count && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && ['Tab', 'Enter'].includes(event.key)) return 'choose';
}
