import type { CatalogEntry } from './types';

export function mergeCommandEntries(catalog: CatalogEntry[], dynamic: CatalogEntry[]): CatalogEntry[] {
  const entries = new Map(catalog.map(entry => [`${entry.kind ?? 'slash'}:${entry.name}`, entry]));
  for (const entry of dynamic) {
    const kind = entry.kind ?? 'slash';
    const key = `${kind}:${entry.name}`;
    const previous = entries.get(key);
    const builtin = entry.source === 'builtin';
    entries.set(key, builtin ? { ...previous, ...entry, kind } : { ...entry, kind, ...(kind === 'slash' ? { rpc: true, surface: 'prompt' } : {}) });
  }
  return [...entries.values()];
}

export function rpcCommand(entry: CatalogEntry): string | undefined {
  if (entry.kind !== 'slash') return;
  return ({ btw: 'btw', goal: 'goal', live: 'live_start', queue: 'follow_up' } as Record<string, string>)[entry.name];
}

export function terminalCommand(entry: CatalogEntry, args = ''): string | undefined {
  if (entry.kind !== 'slash' || entry.surface !== 'terminal' && entry.rpc !== false) return;
  return `/${entry.name}${args.trim() ? ` ${args.trim()}` : ''}`;
}
