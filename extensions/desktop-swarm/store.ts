import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { State, Snapshot } from './types';

export function rootKey(sessionId: string): string { return createHash('sha256').update(sessionId).digest('hex').slice(0, 32); }

export class Store {
  private tail: Promise<unknown> = Promise.resolve();
  private constructor(readonly directory: string, private state: State) {}

  static async open(base: string, sessionId: string, initial: Snapshot): Promise<Store> {
    const directory = path.join(base, rootKey(sessionId));
    const file = path.join(directory, 'state.json');
    let state: State;
    try {
      state = JSON.parse(await fs.readFile(file, 'utf8'));
      if (state.snapshot?.schemaVersion !== 1 || !Array.isArray(state.snapshot.members) || !Array.isArray(state.snapshot.messages) || !state.processed) throw Error('协作记录格式无法读取，请保留原文件后核对。');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      state = { snapshot: initial, processed: {} };
    }
    const store = new Store(directory, state);
    await store.change(current => {
      for (const member of current.snapshot.members) {
        if (member.status === 'working') {
          member.status = 'stopped';
          member.error = '上次运行已中断；核对工作区后恢复，原会话与待处理消息已保留。';
        }
      }
    });
    return store;
  }

  snapshot(): Snapshot {
    const snapshot = structuredClone(this.state.snapshot);
    snapshot.pending = snapshot.members.reduce((sum, member) => sum + (['stopped', 'blocked'].includes(member.status) ? 0 : this.pending(member.name).filter(message => message.delivery !== 'note').length), 0);
    snapshot.running = snapshot.members.filter(member => member.status === 'working').length;
    return snapshot;
  }

  pending(name: string) {
    const after = this.state.processed[name] ?? 0;
    return this.state.snapshot.messages.filter(message => message.seq > after && message.sender !== name && (message.recipients.includes(name) || (message.delivery === 'note' && message.recipients.length === 0)));
  }

  async change(update: (state: State) => void): Promise<Snapshot> {
    const task = this.tail.then(async () => {
      const next = structuredClone(this.state);
      update(next);
      next.snapshot.revision++;
      next.snapshot.updatedAt = Date.now();
      await fs.mkdir(this.directory, { recursive: true });
      const pending = path.join(this.directory, `state.${randomUUID()}.pending`);
      try {
        const handle = await fs.open(pending, 'wx');
        try { await handle.writeFile(JSON.stringify(next) + '\n', 'utf8'); await handle.sync(); } finally { await handle.close(); }
        await fs.rename(pending, path.join(this.directory, 'state.json'));
      } finally { await fs.unlink(pending).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
      this.state = next;
      return this.snapshot();
    });
    this.tail = task.catch(() => {});
    return task;
  }

  settled(): Promise<unknown> { return this.tail; }
}
