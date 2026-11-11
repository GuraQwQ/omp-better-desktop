import { request } from './bridge';
import type { GenUIKind } from './genui';

type State = Record<string, unknown>;
export interface SavedGenUI { source: string; state: State; revision: string; configurationKey: string }
interface Options { source: string; kind: GenUIKind; configurationKey: string; persistence: boolean; state: boolean }
interface Snapshot { initialState: State; lastGood: string; loaded: boolean; error: string; remote: SavedGenUI | null | undefined }
interface Backend {
  read(id: string): Promise<SavedGenUI | null>;
  write(value: { id: string; source: string; kind: GenUIKind; state: State; baseRevision: string | null; configurationKey: string }): Promise<SavedGenUI | null>;
  clear(): Promise<{ cleared: number }>;
}

class GenUIView {
  private value: State;
  private snapshot: Snapshot;
  private options: Options;
  private revision: string | null = null;
  private epoch = 0;
  private readVersion = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private listeners = new Set<() => void>();
  private queue = Promise.resolve();
  private writes = 0;
  private editRevision = 0;
  private clearedSource?: string;
  constructor(readonly id: string, readonly continuity: string | undefined, options: Options, private store: GenUIViews, initial: State = {}) {
    this.value = initial; this.options = options;
    this.snapshot = { initialState: initial, lastGood: '', loaded: !options.persistence, error: '', remote: undefined };
  }
  get state() { return this.value; }
  get evictable() { return !this.listeners.size && !this.timer && !this.writes && !this.snapshot.error; }
  get pending() { return this.queue; }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<Snapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.listeners.forEach(listener => listener()); }

  async activate(options: Options) {
    const version = ++this.readVersion;
    this.configure(options);
    this.publish({ initialState: this.value, loaded: !options.persistence });
    if (!options.persistence) return;
    try {
      await this.queue; await this.store.ready;
      const saved = await this.store.backend.read(this.id);
      if (version !== this.readVersion) return;
      this.revision = saved?.revision ?? null;
      if (saved) this.value = { ...saved.state, ...this.value };
      this.publish({ initialState: this.value, lastGood: this.snapshot.lastGood || (saved?.configurationKey === this.options.configurationKey ? saved.source : ''), error: '' });
    } catch (error) { if (version === this.readVersion) this.publish({ error: String(error) }); }
    finally { if (version === this.readVersion) this.publish({ loaded: true }); }
  }
  configure(options: Options) {
    if (options.source !== this.options.source) this.editRevision++;
    if (options.configurationKey !== this.options.configurationKey) this.publish({ lastGood: '' });
    this.options = options;
  }
  release() { this.readVersion++; this.flush(); }
  update(state: State) {
    if (!this.options.state || JSON.stringify(state) === JSON.stringify(this.value)) return;
    this.clearedSource = undefined;
    this.editRevision++;
    this.value = { ...state };
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = undefined; this.save(); }, 400);
  }
  rendered(source: string) { if (this.snapshot.lastGood !== source) this.publish({ lastGood: source }); }
  refresh() { this.publish({ initialState: { ...this.value } }); }
  flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; this.save(); }
    return this.queue;
  }
  save() {
    if (!this.options.persistence || !this.snapshot.loaded || this.clearedSource === this.options.source) return this.queue;
    const epoch = this.epoch, options = this.options, state = { ...this.value }, source = this.snapshot.lastGood || options.source, ready = this.store.ready;
    this.writes++;
    this.queue = this.queue.then(async () => {
      if (epoch !== this.epoch) return;
      await ready;
      if (epoch !== this.epoch || !this.options.persistence) return;
      try {
        const saved = await this.store.backend.write({ id: this.id, source, kind: options.kind, state, baseRevision: this.revision, configurationKey: options.configurationKey });
        if (epoch === this.epoch && saved) { this.revision = saved.revision; this.publish({ error: '' }); }
      } catch (error) { if (epoch === this.epoch) this.publish({ error: String(error) }); }
    }).finally(() => { this.writes--; });
    return this.queue;
  }
  async readLatest() {
    const epoch = this.epoch;
    try {
      await this.queue; await this.store.ready;
      const remote = await this.store.backend.read(this.id);
      if (epoch === this.epoch) this.publish({ remote });
    } catch (error) { if (epoch === this.epoch) this.publish({ error: String(error) }); }
  }
  async resolve(restore: boolean) {
    const saved = this.snapshot.remote;
    if (saved === undefined) return;
    this.cancelQueued();
    const epoch = this.epoch;
    await this.queue; await this.store.ready;
    if (epoch !== this.epoch) return;
    this.revision = saved?.revision ?? null;
    if (restore) this.value = { ...saved?.state };
    this.publish({ remote: undefined, error: '', ...(restore ? { initialState: this.value } : {}) });
    if (!restore) return this.save();
  }
  cancelQueued() { this.epoch++; this.readVersion++; clearTimeout(this.timer); this.timer = undefined; return this.editRevision; }
  cleared(editRevision: number) { this.revision = null; this.clearedSource = this.editRevision === editRevision ? this.options.source : undefined; this.publish({ remote: undefined, error: '', loaded: true }); }
  clearFailed(error: unknown) { this.publish({ loaded: true, error: String(error) }); }
}

export class GenUIViews {
  private views = new Map<string, GenUIView>();
  private clearing?: Promise<{ cleared: number }>;
  ready: Promise<unknown> = Promise.resolve();
  constructor(readonly backend: Backend) {}
  open(id: string, options: Options, continuity?: string) {
    let view = this.views.get(id);
    if (!view) {
      const previous = continuity ? [...this.views.values()].reverse().find(value => value.continuity === continuity) : undefined;
      view = new GenUIView(id, continuity, options, this, { ...previous?.state });
    }
    this.views.delete(id); this.views.set(id, view);
    // 保留可见、待写和保存失败的界面；其余输入缓存按最近使用顺序淘汰。
    for (const [key, candidate] of this.views) { if (this.views.size <= 128) break; if (candidate !== view && candidate.evictable) this.views.delete(key); }
    return view;
  }
  clear() {
    if (this.clearing) return this.clearing;
    const views = [...this.views.values()];
    const revisions = views.map(view => view.cancelQueued());
    const pending = views.map(view => view.pending);
    // 已发出的写入先结束，再清空；之后的新编辑在清空完成后保存。
    const cleared = Promise.all(pending).then(() => this.backend.clear()).then(result => { views.forEach((view, index) => view.cleared(revisions[index])); return result; }).catch(error => { views.forEach(view => view.clearFailed(error)); throw error; });
    this.ready = cleared.catch(() => {});
    this.clearing = cleared.finally(() => { this.clearing = undefined; });
    return this.clearing;
  }
}

export const genUIViews = new GenUIViews({ read: id => request('genui.get', { id }), write: value => request('genui.save', value), clear: () => request('genui.clear') });
