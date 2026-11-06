import type { CatalogEntry, Json } from './types';

const dynamicSources = new Set(['skill', 'extension', 'custom', 'mcp_prompt', 'file']);

export function isBuiltinSlashCommand(entry: CatalogEntry): boolean {
  return entry.kind === 'slash' && !dynamicSources.has(entry.source ?? '');
}

const desktopSurfaces: Record<string, string> = {
    settings: 'settings:omp', setup: 'settings:providers', login: 'settings:providers', logout: 'settings:providers', model: 'models',
    context: 'context', tools: 'context', todo: 'tasks',
    git: 'review', hub: 'agents', tree: 'tree', branch: 'tree', fork: 'tree',
    resume: 'sessions', session: 'sessions',
    mcp: 'settings:mcp', extensions: 'settings:plugins', plugins: 'settings:plugins', marketplace: 'settings:plugins',
    skills: 'settings:skills', ssh: 'settings:ssh', agents: 'settings:agents', modelpreset: 'settings:models',
};

export type CommandRoute =
  | { kind: 'desktop'; surface: string }
  | { kind: 'session'; action: 'new' | 'close' | 'restart' }
  | { kind: 'rpc'; command: string; params: Json }
  | { kind: 'terminal'; input: string }
  | { kind: 'prompt'; message: string };

export function resolveCommand(entry: CatalogEntry, args = ''): CommandRoute {
  const message = `/${entry.name}${args.trim() ? ` ${args}` : ''}`;
  if (!isBuiltinSlashCommand(entry)) return { kind: 'prompt', message };
  if (!args.trim()) {
    if (entry.name === 'new') return { kind: 'session', action: 'new' };
    if (entry.name === 'quit' || entry.name === 'exit') return { kind: 'session', action: 'close' };
    if (entry.name === 'restart') return { kind: 'session', action: 'restart' };
    if (desktopSurfaces[entry.name]) return { kind: 'desktop', surface: desktopSurfaces[entry.name] };
  }
  if (args.trim() && entry.name === 'btw') return { kind: 'rpc', command: 'btw', params: { question: args } };
  if (args.trim() && entry.name === 'queue') return { kind: 'rpc', command: 'follow_up', params: { message: args } };
  if (entry.rpc === false) return { kind: 'terminal', input: message };
  return { kind: 'prompt', message };
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
