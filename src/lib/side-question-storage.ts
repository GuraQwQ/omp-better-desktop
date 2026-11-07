import { emptySideQuestions, readSideQuestions, type SideQuestionState } from './side-questions';
import { request } from './bridge';

interface Slot {
  value?: SideQuestionState;
  revision: number;
  saved: number;
  reading?: Promise<SideQuestionState>;
  writing?: Promise<void>;
  writingRevision?: number;
  timer?: ReturnType<typeof setTimeout>;
  error: string;
  listeners: Set<() => void>;
}

export class SideQuestionStorage {
  private slots = new Map<string, Slot>();
  constructor(private backend: { read: (key: string) => Promise<unknown>; write: (key: string, value: SideQuestionState) => Promise<unknown> }) {}

  private slot(key: string) {
    let slot = this.slots.get(key);
    if (!slot) { slot = { revision: 0, saved: 0, error: '', listeners: new Set() }; this.slots.set(key, slot); }
    return slot;
  }

  private notify(slot: Slot) { slot.listeners.forEach(listener => listener()); }
  status(key: string) { const slot = this.slot(key); return { dirty: slot.revision > slot.saved, saving: !!slot.writing, error: slot.error }; }
  peek(key: string) { return this.slot(key).value; }
  subscribe(key: string, listener: () => void) { const slot = this.slot(key); slot.listeners.add(listener); return () => { slot.listeners.delete(listener); }; }
  async change(key: string, transform: (state: SideQuestionState) => SideQuestionState) {
    await this.load(key);
    const current = this.slot(key).value!, next = transform(current);
    if (next !== current) this.update(key, next);
    return next;
  }

  async load(key: string): Promise<SideQuestionState> {
    const slot = this.slot(key);
    if (slot.value) return slot.value;
    slot.reading ??= (async () => {
      await slot.writing?.catch(() => {});
      const saved = await this.backend.read(key);
      // 清空可与读取同时发生，较早的读取结果不能恢复已经清理的上下文。
      slot.value ??= readSideQuestions(saved);
      return slot.value;
    })().finally(() => { slot.reading = undefined; });
    return slot.reading;
  }

  update(key: string, value: SideQuestionState) {
    const slot = this.slot(key);
    slot.value = value; slot.revision++;
    clearTimeout(slot.timer);
    slot.timer = setTimeout(() => { void this.flush(key).catch(() => {}); }, 250);
    this.notify(slot);
  }

  async flush(key: string): Promise<void> {
    const slot = this.slot(key);
    clearTimeout(slot.timer); slot.timer = undefined;
    if (slot.writing) {
      const writingRevision = slot.writingRevision!;
      try { await slot.writing; } catch (error) { if (slot.revision <= writingRevision) throw error; }
      if (slot.saved < slot.revision) await this.flush(key);
      return;
    }
    if (slot.saved >= slot.revision) return;
    const revision = slot.revision;
    slot.writingRevision = revision;
    slot.writing = this.backend.write(key, slot.value ?? emptySideQuestions()).then(() => {
      slot.saved = revision; slot.error = '';
    }).catch(error => { slot.error = error instanceof Error ? error.message : String(error); throw error; }).finally(() => {
      slot.writing = undefined; slot.writingRevision = undefined; this.notify(slot);
    });
    this.notify(slot);
    try { await slot.writing; } catch (error) { if (slot.revision <= revision) throw error; }
    if (slot.saved < slot.revision) await this.flush(key);
  }
}

export const sideQuestionStorage = new SideQuestionStorage({ read: key => request('desktop.state.get', { key }), write: (key, value) => request('desktop.state.set', { key, value }) });
