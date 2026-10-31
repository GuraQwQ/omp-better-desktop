import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface JobKey { caseId: string; variant: 'original' | 'experimental' }
export const jobId = (job: JobKey) => job.caseId + '-' + (job.variant === 'original' ? 'A' : 'B');

export function parseConcurrency(value: string | undefined): 1 | 2 {
  if (value === undefined || value === '2') return 2;
  if (value === '1') return 1;
  throw new Error('--concurrency 只接受 1 或 2。');
}

/** 每题形成一个屏障；两个槽位优先给同题 A/B，错误不会取消同伴或后续题。 */
export async function schedulePairs<T extends JobKey>(jobs: readonly T[], concurrency: 1 | 2, execute: (job: T, slotWaitMs: number) => Promise<void>) {
  const queuedAt = performance.now();
  const failures: { job: T; error: unknown }[] = [];
  for (const caseId of new Set(jobs.map(job => job.caseId))) {
    const pair = jobs.filter(job => job.caseId === caseId);
    for (let index = 0; index < pair.length; index += concurrency) {
      const batch = pair.slice(index, index + concurrency);
      const settled = await Promise.allSettled(batch.map(job => execute(job, performance.now() - queuedAt)));
      settled.forEach((result, item) => { if (result.status === 'rejected') failures.push({ job: batch[item], error: result.reason }); });
    }
  }
  return failures;
}

export function serialWriter() {
  let tail = Promise.resolve();
  return (write: () => Promise<void>) => {
    const current = tail.then(write);
    tail = current.catch(() => {});
    return current;
  };
}

export async function writeAtomic(file: string, contents: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = file + '.' + crypto.randomUUID() + '.tmp';
  try {
    await fs.writeFile(temporary, contents, 'utf8');
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, { force: true }); }
}

/** 单题结果先于汇总提交，恢复时以它为准；timeout/error 也是已完成样本。 */
export async function loadCompleted<T extends JobKey & { status: string }>(output: string, jobs: readonly JobKey[]): Promise<Map<string, T>> {
  const read = async (file: string): Promise<unknown | undefined> => {
    try { return JSON.parse(await fs.readFile(file, 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw new Error('无法读取完整的已保存结果：' + file, { cause: error }); }
  };
  const expected = new Set(jobs.map(jobId));
  const values = new Map<string, T>();
  const accept = (value: unknown, expectedId?: string) => {
    if (!value || typeof value !== 'object') throw new Error('已保存结果结构无效。');
    const row = value as T;
    if (typeof row.caseId !== 'string' || !['original', 'experimental'].includes(row.variant) || typeof row.status !== 'string' || !row.status || ['pending', 'running'].includes(row.status)) throw new Error('结果文件未包含有效终态。');
    const id = jobId(row);
    if (!expected.has(id) || expectedId !== undefined && id !== expectedId) throw new Error('已保存结果不属于当前题目：' + id);
    values.set(id, row);
  };
  const aggregate = await read(path.join(output, 'results.json'));
  if (aggregate !== undefined) {
    if (!Array.isArray(aggregate)) throw new Error('已保存汇总不是结果列表。');
    for (const value of aggregate) accept(value);
  }
  for (const job of jobs) {
    const id = jobId(job);
    const value = await read(path.join(output, id, 'result.json'));
    if (value !== undefined) accept(value, id);
  }
  return values;
}
