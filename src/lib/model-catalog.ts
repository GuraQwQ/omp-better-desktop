import { request } from './bridge';
import type { Json } from './types';

export interface ModelCatalogResult { models: Json[]; warning?: string }
type Entry = { result?: ModelCatalogResult; loadedAt: number; pending?: Promise<ModelCatalogResult> };
const MAX_AGE_MS = 60_000;

export class ModelCatalog {
  private readonly entries = new Map<string, Entry>();
  generation = 0;

  constructor(private readonly fetchModels = (cwd: string) => request<ModelCatalogResult>('models.list', { cwd })) {}

  peek(key: string): ModelCatalogResult | undefined { return this.entries.get(key)?.result; }

  load(key: string, cwd: string, refresh = false): Promise<ModelCatalogResult> {
    const entry = this.entries.get(key) ?? { loadedAt: 0 };
    this.entries.set(key, entry);
    if (entry.pending) return entry.pending;
    if (!refresh && entry.result && Date.now() - entry.loadedAt < MAX_AGE_MS) return Promise.resolve(entry.result);
    const pending = this.fetchModels(cwd).then(result => {
      if (this.entries.get(key) === entry) { entry.result = result; entry.loadedAt = Date.now(); }
      return result;
    }).finally(() => { if (entry.pending === pending) entry.pending = undefined; });
    entry.pending = pending;
    return pending;
  }

  invalidate(key?: string): void {
    this.generation++;
    if (key === undefined) this.entries.clear(); else this.entries.delete(key);
  }
}

export const modelCatalog = new ModelCatalog();
