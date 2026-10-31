import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { jobId, loadCompleted, parseConcurrency, schedulePairs, serialWriter, writeAtomic, type JobKey } from './token-bench/scheduler';
import { observeRun } from './token-bench/observations';
import type { MeterAttempt, MeterSummary } from './token-bench/meter';

const cache = path.resolve(import.meta.dir, '../.cache');
await fs.mkdir(cache, { recursive: true });
const root = await fs.mkdtemp(path.join(cache, 'token-runner-check-'));
const jobs = Array.from({ length: 6 }, (_, index) => ['original', 'experimental'].map(variant => ({ caseId: 'case-' + index, variant: variant as JobKey['variant'] }))).flat();
type Saved = JobKey & { status: string; marker: number };

try {
  assert.equal(parseConcurrency(undefined), 2);
  assert.equal(parseConcurrency('1'), 1);
  assert.equal(parseConcurrency('2'), 2);
  for (const value of ['0', '3', '2.0', 'NaN', '']) assert.throws(() => parseConcurrency(value));
  for (const concurrency of [1, 2] as const) {
    let active = 0, peak = 0;
    const history: string[] = [], waited: number[] = [];
    const failures = await schedulePairs(jobs, concurrency, async (job, slotWaitMs) => {
      active++; peak = Math.max(peak, active); history.push('start:' + jobId(job)); waited.push(slotWaitMs);
      try {
        await Bun.sleep(job.variant === 'original' ? 12 : 2);
        if (job.caseId === 'case-1') throw new Error('fixture-worker-failure');
      } finally { active--; history.push('end:' + jobId(job)); }
    });
    assert.equal(peak, concurrency);
    assert.equal(active, 0);
    assert.equal(failures.length, 2);
    assert.equal(history.filter(item => item.startsWith('start:')).length, 12);
    assert.ok(waited.at(-1)! > waited[0]);
    for (let index = 1; index < 6; index++) {
      const previousEnd = Math.max(history.indexOf(`end:case-${index - 1}-A`), history.indexOf(`end:case-${index - 1}-B`));
      assert.ok(history.indexOf(`start:case-${index}-A`) > previousEnd, '下一题越过同题屏障');
    }
    if (concurrency === 2) assert.deepEqual(history.slice(0, 2), ['start:case-0-A', 'start:case-0-B']);
  }

  const output = path.join(root, 'results');
  const original: Saved = { ...jobs[0], status: 'completed', marker: 1 };
  const timeout: Saved = { ...jobs[1], status: 'timeout', marker: 2 };
  const failed: Saved = { ...jobs[3], status: 'error', marker: 3 };
  await writeAtomic(path.join(output, 'results.json'), JSON.stringify([original, timeout]));
  await writeAtomic(path.join(output, jobId(failed), 'result.json'), JSON.stringify(failed));
  const protectedResult = await fs.readFile(path.join(output, jobId(failed), 'result.json'), 'utf8');
  const loaded = await loadCompleted<Saved>(output, jobs);
  assert.equal(loaded.size, 3);
  const queue = serialWriter();
  let writers = 0, maxWriters = 0;
  const executed: string[] = [];
  await schedulePairs(jobs.filter(job => !loaded.has(jobId(job))), 2, async job => {
    executed.push(jobId(job));
    const result = { ...job, status: 'completed', marker: 4 };
    await queue(async () => {
      writers++; maxWriters = Math.max(maxWriters, writers);
      try {
        loaded.set(jobId(job), result);
        await writeAtomic(path.join(output, jobId(job), 'result.json'), JSON.stringify(result));
        await Bun.sleep(2);
        await writeAtomic(path.join(output, 'results.json'), JSON.stringify(jobs.map(key => loaded.get(jobId(key))).filter(Boolean)));
      } finally { writers--; }
    });
  });
  assert.equal(maxWriters, 1);
  assert.equal(executed.length, 9);
  assert.equal(executed.includes(jobId(timeout)), false);
  assert.equal(executed.includes(jobId(failed)), false);
  assert.equal(await fs.readFile(path.join(output, jobId(failed), 'result.json'), 'utf8'), protectedResult);
  const stored: Saved[] = JSON.parse(await fs.readFile(path.join(output, 'results.json'), 'utf8'));
  assert.deepEqual(stored.map(jobId), jobs.map(jobId));
  assert.equal((await loadCompleted<Saved>(output, jobs)).size, 12);
  const writeFailure = queue(async () => { throw new Error('fixture-write-failure'); });
  const recoveredWrite = queue(() => writeAtomic(path.join(output, 'after-failure.json'), '{"saved":true}'));
  await assert.rejects(writeFailure, /fixture-write-failure/);
  await recoveredWrite;
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(output, 'after-failure.json'), 'utf8')), { saved: true });
  const onlyIndividual = path.join(root, 'individual');
  await writeAtomic(path.join(onlyIndividual, jobId(original), 'result.json'), JSON.stringify(original));
  assert.equal((await loadCompleted<Saved>(onlyIndividual, jobs)).size, 1, '汇总未提交时丢失单题终态');

  const home = path.join(root, 'home'), sessionDir = path.join(home, '.omp/agent/sessions');
  await fs.mkdir(sessionDir, { recursive: true });
  const privateText = 'fixture-private-prompt-and-output';
  const usage = (input: number, output: number, cached = 0) => ({ input: input - cached, output, cacheRead: cached, cacheWrite: 0, totalTokens: input + output });
  const assistant = (id: string, value: object, content: object[]) => ({ type: 'message', id, message: { role: 'assistant', usage: value, content } });
  const main = [
    { type: 'session', id: 'main' },
    { type: 'message', message: { role: 'user', content: privateText } },
    assistant('read', usage(100, 20, 30), [{ type: 'toolCall', id: 'read-call', name: 'read', arguments: { path: privateText } }]),
    assistant('todo', usage(170, 10, 40), [{ type: 'text', text: privateText }, { type: 'toolCall', name: 'todo', arguments: {} }]),
    assistant('eval', usage(70, 5), [{ type: 'toolCall', name: 'eval', arguments: { code: 'spawnSync(process.execPath, [script]); // ' + privateText } }]),
    { type: 'message', message: { role: 'toolResult', toolName: 'eval', isError: true, content: [{ type: 'text', text: 'TypeError: ' + privateText }] } },
    { type: 'model_usage', purpose: 'skill_description', usage: usage(12, 3) },
    { type: 'model_usage', purpose: 'one', usage: usage(80, 5) },
    { type: 'model_usage', purpose: 'two', usage: usage(80, 5) },
  ];
  const other = [{ type: 'session', id: 'other' }, { type: 'message', message: { role: 'user', content: 'D:/fixture/private-script.mjs' } }, assistant('other', usage(210, 20, 10), [])];
  const primarySessionPath = path.join(sessionDir, 'main.jsonl');
  await fs.writeFile(primarySessionPath, main.map(row => JSON.stringify(row)).join('\n') + '\n', 'utf8');
  await fs.writeFile(path.join(sessionDir, 'other.jsonl'), other.map(row => JSON.stringify(row)).join('\n') + '\n', 'utf8');
  const attempt = (id: string, input: number, output: number, cached: number | null, start: number, end: number): MeterAttempt => ({
    id, runId: 'fixture', kind: 'model', method: 'POST', path: '/v1/chat/completions', startedAtMs: start, endedAtMs: end,
    elapsedMs: end - start, firstByteMs: 5, requestBytes: 1, responseBytes: 1, complete: true, pending: false,
    usage: { inputTokens: input, outputTokens: output, cacheReadTokens: cached, totalTokens: input + output },
  });
  const attempts = [attempt('read', 100, 20, 30, 1000, 1040), attempt('todo', 170, 10, 40, 1020, 1060), attempt('eval', 70, 5, 0, 1070, 1090), attempt('aux', 12, 3, 0, 500, 510), attempt('other', 210, 20, 10, 1100, 1120), attempt('ambiguous', 80, 5, null, 1130, 1140),
    { id: 'unknown', runId: 'fixture', kind: 'model' as const, method: 'POST', path: '/v1/responses', elapsedMs: 0, requestBytes: 0, responseBytes: 0, usage: null, complete: false, pending: false, error: 'interrupted' as const },
    { id: 'metadata', runId: 'fixture', kind: 'metadata' as const, method: 'GET', path: '/v1/models', elapsedMs: 1, requestBytes: 0, responseBytes: 1, usage: null, complete: true, pending: false }];
  const meter: MeterSummary = { attempts, modelAttemptCount: 7, knownTotalTokens: 705, inputTokens: 642, knownInputTokens: 642, outputTokens: 63, cacheReadTokens: 80, knownCacheInputTokens: 562, unknownUsageCount: 1, unknownCacheUsageCount: 2, pendingCount: 0 };
  const observations = await observeRun({ home, primarySessionPath, meter, taskStartedAtMs: 1000, taskEndedAtMs: 1120, events: [
    { elapsedMs: 10, type: 'tool_execution_start', toolName: 'read', toolCallId: '1' },
    { elapsedMs: 20, type: 'tool_execution_start', toolName: 'eval', toolCallId: '2' },
    { elapsedMs: 30, type: 'tool_execution_end', toolName: 'read', toolCallId: '1' },
    { elapsedMs: 40, type: 'tool_execution_end', toolName: 'eval', toolCallId: '2' },
    { elapsedMs: 50, type: 'tool_execution_start', toolName: 'todo', toolCallId: '3' },
    { elapsedMs: 51, type: 'tool_execution_end', toolName: 'todo', toolCallId: '3' },
  ] });
  assert.equal(observations.sources.reduce((sum, source) => sum + source.knownTokens, 0), 705);
  assert.equal(observations.sources.find(source => source.source === 'foreground')?.knownTokens, 375);
  assert.equal(observations.requests.find(row => row.attemptId === 'aux')?.source, 'auxiliary');
  assert.equal(observations.requests.find(row => row.attemptId === 'aux')?.phase, 'startup');
  assert.equal(observations.requests.find(row => row.attemptId === 'ambiguous')?.source, 'unknown');
  assert.equal(observations.requests.find(row => row.attemptId === 'ambiguous')?.matches, 2);
  assert.equal(observations.possibleMislaunchKnownTokens, 230);
  assert.equal(observations.coverage.usageRequests, 6);
  assert.equal(observations.coverage.cacheRequests, 5);
  assert.equal(observations.turns.toolOnlyTurns, 2);
  assert.equal(observations.turns.todoOnlyTurns, 1);
  assert.equal(observations.turns.evalErrors, 1);
  assert.deepEqual(observations.turns.evalErrorKinds, { type: 1 });
  assert.equal(observations.timing.toolBusyWallMs, 31);
  assert.equal(observations.timing.requestBusyWallMs, null);
  assert.equal(observations.timing.timedRequests, 6);
  assert.equal(JSON.stringify(observations).includes(privateText), false);
  assert.equal(JSON.stringify(observations).includes('private-script'), false);
  console.log('Token runner检查通过：1/2并发、同题屏障、双worker错误隔离、终态恢复、串行原子结果、会话归因与隐私元数据。');
} finally {
  const resolved = await fs.realpath(root);
  if (path.dirname(resolved) !== await fs.realpath(cache)) throw new Error('基准检查目录超出缓存范围。');
  await fs.rm(resolved, { recursive: true, force: true });
}
