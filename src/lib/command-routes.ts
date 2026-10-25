import type { CatalogEntry } from './types';

export function rpcCommand(entry: CatalogEntry): string | undefined {
  if (entry.kind !== 'slash') return;
  return ({ btw: 'btw', goal: 'goal', live: 'live_start', queue: 'follow_up' } as Record<string, string>)[entry.name];
}

export function terminalCommand(entry: CatalogEntry, args = ''): string | undefined {
  if (entry.kind !== 'slash' || entry.surface !== 'terminal' && entry.rpc !== false) return;
  return `/${entry.name}${args.trim() ? ` ${args.trim()}` : ''}`;
}
