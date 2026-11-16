import { request } from './bridge';
import type { Json } from './types';

export interface ModelCatalogResult { models: Json[]; warning?: string }
type Entry = { result?: ModelCatalogResult; loadedAt: number; revision: number; refreshedRevision?: number; pending?: Promise<ModelCatalogResult>; refreshing?: Promise<ModelCatalogResult> };
const MAX_AGE_MS = 60_000;

export class ModelCatalog {
  private readonly entries = new Map<string, Entry>();
  generation = 0;

  constructor(private readonly fetchModels = (cwd: string, refresh: boolean) => request('models.list', { cwd, refresh })) {}

  peek(key: string): ModelCatalogResult | undefined { return this.entries.get(key)?.result; }

  load(key: string, cwd: string, refresh = false): Promise<ModelCatalogResult> {
    const entry = this.entries.get(key) ?? { loadedAt: 0, revision: 0 };
    this.entries.set(key, entry);
    if (!refresh && entry.result && Date.now() - entry.loadedAt < MAX_AGE_MS) return Promise.resolve(entry.result);
    const slot = refresh ? 'refreshing' : 'pending';
    if (entry[slot]) return entry[slot];
    const revision = refresh || !entry.refreshing ? ++entry.revision : entry.revision;
    const pending = this.fetchModels(cwd, refresh).then(result => {
      if (this.entries.get(key) === entry && entry.revision === revision && (refresh || entry.refreshedRevision !== revision)) {
        entry.result = result; entry.loadedAt = Date.now();
        if (refresh) entry.refreshedRevision = revision;
      }
      return result;
    }).finally(() => { if (entry[slot] === pending) entry[slot] = undefined; });
    entry[slot] = pending;
    return pending;
  }

  invalidate(key?: string): void {
    this.generation++;
    if (key === undefined) this.entries.clear(); else this.entries.delete(key);
  }
}

export const modelCatalog = new ModelCatalog();
