import { describeCommand } from './command-descriptions';
import type { CatalogEntry, Language } from './types';
import { isBuiltinSlashCommand } from './command-routes';

export interface SlashCompletion { entry: CatalogEntry; token: string; description: string; group: 'commands' | 'skills' | 'extensions' }

const commandPriority = ['model', 'new', 'resume', 'plan', 'compact', 'context', 'git', 'tree', 'fork', 'goal', 'settings', 'mcp', 'agents', 'effort', 'todo', 'skills', 'plugins', 'rename', 'branch', 'hub', 'tools', 'usage', 'stats'];
const groupPriority = { commands: 0, skills: 1, extensions: 2 };

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
    items.push({ entry, token, description, group: entry.source === 'skill' || entry.kind === 'skill' || token.startsWith('skill:') ? 'skills' : ['extension', 'custom', 'mcp_prompt', 'file'].includes(entry.source ?? entry.kind ?? '') ? 'extensions' : 'commands' });
  }
  const matchRank = (item: SlashCompletion) => {
    const names = [item.token, ...(item.entry.aliases ?? [])].map((name: string) => name.toLocaleLowerCase());
    return !needle || names.includes(needle) ? 0 : names.some(name => name.startsWith(needle)) ? 1 : 2;
  };
  const priority = (item: SlashCompletion) => {
    const index = isBuiltinSlashCommand(item.entry) ? commandPriority.indexOf(item.token) : -1;
    return index < 0 ? commandPriority.length : index;
  };
  return items.sort((a, b) => matchRank(a) - matchRank(b) || groupPriority[a.group] - groupPriority[b.group] || priority(a) - priority(b) || a.token.localeCompare(b.token));
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
