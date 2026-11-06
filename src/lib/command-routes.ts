import type { CatalogEntry } from './types';

const dynamicSources = new Set(['skill', 'extension', 'custom', 'mcp_prompt', 'file']);

export function isBuiltinSlashCommand(entry: CatalogEntry): boolean {
  return entry.kind === 'slash' && !dynamicSources.has(entry.source ?? '');
}

export function desktopCommandSurface(entry: CatalogEntry, args = ''): string | undefined {
  if (!isBuiltinSlashCommand(entry) || args.trim()) return;
  return ({
    settings: 'settings:omp', setup: 'settings:providers', login: 'settings:providers', logout: 'settings:providers', model: 'models',
    context: 'context', tools: 'context', todo: 'tasks',
    git: 'review', hub: 'agents', tree: 'tree', branch: 'tree', fork: 'tree',
    resume: 'sessions', session: 'sessions',
    mcp: 'settings:mcp', extensions: 'settings:plugins', plugins: 'settings:plugins', marketplace: 'settings:plugins',
    skills: 'settings:skills', ssh: 'settings:ssh', agents: 'settings:agents', modelpreset: 'settings:models',
  } as Record<string, string>)[entry.name];
}

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
  if (!isBuiltinSlashCommand(entry)) return;
  return ({ btw: 'btw', goal: 'goal', live: 'live_start', queue: 'follow_up' } as Record<string, string>)[entry.name];
}

export function terminalCommand(entry: CatalogEntry, args = ''): string | undefined {
  if (entry.kind !== 'slash' || entry.surface !== 'terminal' && entry.rpc !== false) return;
  return `/${entry.name}${args.trim() ? ` ${args.trim()}` : ''}`;
}
