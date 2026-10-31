import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { startMeter, type MeterSummary } from './token-bench/meter';

const cache = path.resolve(import.meta.dir, '../.cache');
await fs.mkdir(cache, { recursive: true });
const outputDir = await fs.mkdtemp(path.join(cache, 'token-meter-check-'));
const credential = 'meter-fixture-private-credential';
const prompt = '测试私密输入🙂：{"model":"不可作为顶层模型"}';
const generated = '测试私密输出🙂';
const seen: { method: string; path: string; auth: string | null; body: string }[] = [];

function chunks(text: string) {
  const bytes = new TextEncoder().encode(text);
  const widths = [1, 2, 5, 19, 257, 8192];
  let offset = 0;
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset === bytes.length) { controller.close(); return; }
      const end = Math.min(bytes.length, offset + widths[index++ % widths.length]);
      controller.enqueue(bytes.slice(offset, end)); offset = end;
    },
  });
}

const jsonBody = JSON.stringify({ choices: [{ message: { content: generated + 'x'.repeat(2 * 1024 * 1024) } }], model: 'response-model', usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130, prompt_tokens_details: { cached_tokens: 60 }, completion_tokens_details: { reasoning_tokens: 10 } } });
const chatSse = 'data: {"choices":[{"delta":{"content":"' + generated + '"}}],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}\r\n\r\n'
  + 'data: {"choices":[],\ndata: "usage":{"prompt_tokens":120,"completion_tokens":40,"total_tokens":160,"prompt_tokens_details":{"cached_tokens":80},"completion_tokens_details":{"reasoning_tokens":15}}}\n\n'
  + 'data: {"choices":[],"usage":{"prompt_tokens":120,"completion_tokens":40,"total_tokens":160,"prompt_tokens_details":{"cached_tokens":80}}}\r\r'
  + 'data: [DONE]\n\n';
const responsesSse = 'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"' + generated + '"}\n\n'
  + 'event: response.completed\ndata: {"type":"response.completed","response":{"model":"response-model","usage":{"input_tokens":40,"output_tokens":10,"total_tokens":50,"input_tokens_details":{"cached_tokens":0},"output_tokens_details":{"reasoning_tokens":4}}}}\n\n';
let cancelledAtUpstream = false;
const mock = Bun.serve({
  hostname: '127.0.0.1', port: 0, idleTimeout: 0,
  async fetch(request) {
    seen.push({ method: request.method, path: new URL(request.url).pathname + new URL(request.url).search, auth: request.headers.get('authorization'), body: await request.text() });
    const fixture = request.headers.get('x-fixture');
    if (fixture === 'json') {
      const journal = await fs.readFile(path.join(outputDir, 'attempts.jsonl'), 'utf8');
      assert.equal(JSON.parse(journal.trim().split('\n').at(-1)!).pending, true, '连接上游前未持久化 attempt 开始记录');
    }
    if (request.method === 'GET') return Response.json({ data: [{ id: 'model' }] });
    if (fixture === 'error') return Response.json({ error: { message: generated } }, { status: 503 });
    if (fixture === 'cancel') {
      let timer: ReturnType<typeof setInterval>;
      request.signal.addEventListener('abort', () => { cancelledAtUpstream = true; clearInterval(timer); }, { once: true });
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"first"}}]}\n\n'));
          timer = setInterval(() => controller.enqueue(new TextEncoder().encode(': heartbeat\n\n')), 10);
        },
        cancel() { cancelledAtUpstream = true; clearInterval(timer); },
      }), { headers: { 'content-type': 'text/event-stream' } });
    }
    if (fixture === 'chat-sse') return new Response(chunks(chatSse), { headers: { 'content-type': 'text/event-stream', 'x-preserved': 'yes' } });
    if (fixture === 'responses-sse') return new Response(chunks(responsesSse), { headers: { 'content-type': 'text/event-stream' } });
    if (fixture === 'responses-json') return Response.json({ output: [{ content: [{ text: generated }] }], usage: { input_tokens: 20, output_tokens: 5 } });
    if (fixture === 'gzip') return new Response(Bun.gzipSync(new TextEncoder().encode(jsonBody)), { headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' } });
    return new Response(chunks(jsonBody), { headers: { 'content-type': 'application/json' } });
  },
});
const meter = await startMeter({ targetBaseUrl: `http://127.0.0.1:${mock.port}/custom/v1`, outputDir });
const body = JSON.stringify({ messages: [{ role: 'user', content: prompt + 'x'.repeat(150000) }], model: 'request-model', stream: false });
const requestOptions = (fixture: string, signal?: AbortSignal): RequestInit => ({ method: 'POST', headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json', 'x-fixture': fixture }, body, signal });
async function settled(runId: string): Promise<MeterSummary> {
  const deadline = Date.now() + 3000;
  while (true) {
    const summary = await meter.snapshot(runId);
    if (!summary.pendingCount) return summary;
    assert.ok(Date.now() < deadline, '已结束请求的计量没有收敛');
    await Bun.sleep(10);
  }
}

try {
  const first = await fetch(meter.baseUrlFor('json/中文') + '/chat/completions?x=a%2Bb', requestOptions('json'));
  assert.equal(await first.text(), jsonBody);
  assert.deepEqual(seen[0], { method: 'POST', path: '/custom/v1/chat/completions?x=a%2Bb', auth: `Bearer ${credential}`, body });
  const json = await settled('json/中文');
  assert.equal(json.modelAttemptCount, 1);
  assert.equal(json.knownTotalTokens, 130);
  assert.equal(json.inputTokens, 100);
  assert.equal(json.outputTokens, 30);
  assert.equal(json.cacheReadTokens, 60);
  assert.equal(json.knownCacheInputTokens, 100);
  assert.equal(json.attempts[0].usage?.reasoningTokens, 10);
  assert.equal(json.attempts[0].model, 'request-model');
  assert.equal(json.attempts[0].requestBytes, Buffer.byteLength(body));
  assert.equal(json.attempts[0].responseBytes, Buffer.byteLength(jsonBody));
  assert.ok(json.attempts[0].firstByteMs! <= json.attempts[0].elapsedMs);
  assert.ok(json.attempts[0].startedAtMs! <= json.attempts[0].endedAtMs!);
  assert.ok(json.attempts[0].journalWaitMs! >= 0);

  const streamed = await fetch(meter.baseUrlFor('sse') + '/chat/completions', requestOptions('chat-sse'));
  assert.equal(streamed.headers.get('x-preserved'), 'yes');
  assert.equal(await streamed.text(), chatSse);
  assert.equal((await settled('sse')).knownTotalTokens, 160);
  assert.equal((await settled('sse')).cacheReadTokens, 80);

  const responses = await fetch(meter.baseUrlFor('responses') + '/responses', requestOptions('responses-sse'));
  assert.equal(await responses.text(), responsesSse);
  const compact = await fetch(meter.baseUrlFor('responses') + '/responses/compact', requestOptions('responses-json'));
  assert.equal(compact.status, 200);
  await compact.text();
  const responseSummary = await settled('responses');
  assert.equal(responseSummary.knownTotalTokens, 75);
  assert.equal(responseSummary.modelAttemptCount, 2);
  assert.equal(responseSummary.unknownUsageCount, 0);
  assert.equal(responseSummary.unknownCacheUsageCount, 1);
  assert.equal(responseSummary.knownCacheInputTokens, 40);
  assert.equal(new Set(responseSummary.attempts.map(attempt => attempt.id)).size, 2);

  const metadata = await fetch(meter.baseUrlFor('other') + '/models', { headers: { authorization: `Bearer ${credential}` } });
  await metadata.text();
  const failure = await fetch(meter.baseUrlFor('other') + '/completions', requestOptions('error'));
  assert.equal(failure.status, 503);
  assert.deepEqual(await failure.json(), { error: { message: generated } });
  const other = await settled('other');
  assert.equal(other.attempts.length, 2);
  assert.equal(other.modelAttemptCount, 1);
  assert.equal(other.unknownUsageCount, 1);
  assert.equal(other.unknownCacheUsageCount, 1);
  assert.equal(other.knownTotalTokens, 0);

  const zipped = await fetch(meter.baseUrlFor('gzip') + '/chat/completions', requestOptions('gzip'));
  assert.equal(await zipped.text(), jsonBody);
  assert.equal((await settled('gzip')).knownTotalTokens, 130);

  const abort = new AbortController();
  const cancellation = await fetch(meter.baseUrlFor('cancel') + '/chat/completions', requestOptions('cancel', abort.signal));
  const streamReader = cancellation.body!.getReader();
  assert.equal((await streamReader.read()).done, false);
  abort.abort();
  await streamReader.cancel().catch(() => {});
  const cancelled = await settled('cancel');
  assert.equal(cancelled.unknownUsageCount, 1);
  assert.equal(cancelled.attempts[0].complete, false);
  assert.equal(cancelled.attempts[0].error, 'cancelled');
  const abortDeadline = Date.now() + 3000;
  while (!cancelledAtUpstream && Date.now() < abortDeadline) await Bun.sleep(10);
  assert.ok(cancelledAtUpstream, '下游取消未传递到上游');

  const stopMeter = await startMeter({ targetBaseUrl: `http://127.0.0.1:${mock.port}/custom/v1`, outputDir: path.join(outputDir, 'stop') });
  try {
    const pending = await fetch(stopMeter.baseUrlFor('pending-stop') + '/responses', requestOptions('cancel'));
    const pendingReader = pending.body!.getReader();
    await pendingReader.read();
    await Promise.race([stopMeter.stop(), Bun.sleep(3000).then(() => { throw new Error('关闭计量器时取消死锁'); })]);
    await pendingReader.cancel().catch(() => {});
    const stopped = await stopMeter.snapshot('pending-stop');
    assert.equal(stopped.pendingCount, 0);
    assert.equal(stopped.unknownUsageCount, 1);
  } finally { await stopMeter.stop(); }

  const recoveryDir = path.join(outputDir, 'recovery');
  const recoveryMeters: Awaited<ReturnType<typeof startMeter>>[] = [];
  const recover = async (directory = recoveryDir) => {
    const resumed = await startMeter({ targetBaseUrl: `http://127.0.0.1:${mock.port}/custom/v1`, outputDir: directory });
    recoveryMeters.push(resumed);
    return resumed;
  };
  try {
    const originalMeter = await recover();
    await (await fetch(originalMeter.baseUrlFor('resume') + '/responses', requestOptions('responses-json'))).text();
    await (await fetch(originalMeter.baseUrlFor('resume') + '/models')).text();
    await originalMeter.snapshot('resume');
    await originalMeter.stop();
    const recoveryFile = path.join(recoveryDir, 'attempts.jsonl');
    const before = await fs.readFile(recoveryFile, 'utf8');

    const resumed = await recover();
    const previous = await resumed.snapshot('resume');
    assert.equal(previous.knownTotalTokens, 25);
    assert.equal(previous.modelAttemptCount, 1);
    assert.equal(previous.attempts.length, 2);
    assert.equal(previous.unknownCacheUsageCount, 1);
    await (await fetch(resumed.baseUrlFor('resume') + '/responses', requestOptions('responses-sse'))).text();
    const combined = await resumed.snapshot('resume');
    assert.equal(combined.knownTotalTokens, 75);
    assert.equal(combined.modelAttemptCount, 2);
    assert.equal(combined.unknownUsageCount, 0);
    assert.equal(combined.unknownCacheUsageCount, 1);
    await resumed.stop();
    const after = await fs.readFile(recoveryFile, 'utf8');
    assert.ok(after.startsWith(before), '恢复追加覆写了旧计量证据');
    const again = await recover();
    assert.equal((await again.snapshot('resume')).knownTotalTokens, 75);
    await again.stop();

    // 重复行不重复计费，完整末行缺换行时下一次追加必须补上分隔。
    const dedupDir = path.join(outputDir, 'dedup');
    await fs.mkdir(dedupDir);
    const firstRow = before.trim().split('\n').map(line => JSON.parse(line)).find(row => row.pending === false);
    const duplicateText = after + JSON.stringify({ ...firstRow, body: prompt });
    const dedupFile = path.join(dedupDir, 'attempts.jsonl');
    await fs.writeFile(dedupFile, duplicateText, 'utf8');
    const dedup = await recover(dedupDir);
    const dedupBefore = await dedup.snapshot('resume');
    assert.equal(dedupBefore.knownTotalTokens, 75);
    assert.equal(dedupBefore.attempts.length, 3);
    assert.equal(dedupBefore.attempts.some(attempt => 'body' in attempt), false);
    assert.equal(await fs.readFile(dedupFile, 'utf8'), duplicateText);
    await (await fetch(dedup.baseUrlFor('resume') + '/responses', requestOptions('responses-sse'))).text();
    assert.equal((await dedup.snapshot('resume')).knownTotalTokens, 125);
    await dedup.stop();
    const appended = await fs.readFile(dedupFile, 'utf8');
    assert.ok(appended.startsWith(duplicateText + '\n'));
    assert.equal(appended.trim().split('\n').map(line => JSON.parse(line)).length, 9);

    const interruptedDir = path.join(outputDir, 'interrupted');
    await fs.mkdir(interruptedDir);
    const interruptedFile = path.join(interruptedDir, 'attempts.jsonl');
    const completedStart = { ...firstRow, elapsedMs: 0, requestBytes: 0, responseBytes: 0, usage: null, complete: false, pending: true };
    const abandoned = { ...completedStart, id: 'interrupted-model' };
    const metadataStart = { ...abandoned, id: 'interrupted-metadata', kind: 'metadata', method: 'GET', path: '/custom/v1/models' };
    const interruptedEvidence = [completedStart, firstRow, abandoned, metadataStart].map(row => JSON.stringify(row)).join('\n') + '\n';
    await fs.writeFile(interruptedFile, interruptedEvidence, 'utf8');
    const interruptedMeter = await recover(interruptedDir);
    const interrupted = await interruptedMeter.snapshot('resume');
    assert.equal(interrupted.attempts.length, 3);
    assert.equal(interrupted.modelAttemptCount, 2);
    assert.equal(interrupted.knownTotalTokens, 25);
    assert.equal(interrupted.pendingCount, 0);
    assert.equal(interrupted.unknownUsageCount, 1);
    assert.equal(interrupted.unknownCacheUsageCount, 2);
    assert.equal(interrupted.attempts.find(row => row.id === abandoned.id)?.error, 'interrupted');
    assert.equal(interrupted.attempts.find(row => row.id === abandoned.id)?.usage, null);
    assert.equal(interrupted.attempts.find(row => row.id === abandoned.id)?.endedAtMs, undefined);
    assert.equal(await fs.readFile(interruptedFile, 'utf8'), interruptedEvidence);
    await interruptedMeter.stop();
    const interruptedAgain = await recover(interruptedDir);
    assert.equal((await interruptedAgain.snapshot('resume')).unknownUsageCount, 1);
    await (await fetch(interruptedAgain.baseUrlFor('resume') + '/responses', requestOptions('responses-sse'))).text();
    const resumedUnknown = await interruptedAgain.snapshot('resume');
    assert.equal(resumedUnknown.knownTotalTokens, 75);
    assert.equal(resumedUnknown.unknownUsageCount, 1);
    await interruptedAgain.stop();

    const incompleteDir = path.join(outputDir, 'incomplete');
    await fs.mkdir(incompleteDir);
    const incompleteFile = path.join(incompleteDir, 'attempts.jsonl');
    const incomplete = before + '{"id":"interrupted","runId":"resume",';
    await fs.writeFile(incompleteFile, incomplete, 'utf8');
    await assert.rejects(recover(incompleteDir), /不完整或无效.*原文件已保留/);
    assert.equal(await fs.readFile(incompleteFile, 'utf8'), incomplete);
    const conflicting = before + JSON.stringify({ ...firstRow, usage: { ...firstRow.usage, totalTokens: 999 } }) + '\n';
    await fs.writeFile(incompleteFile, conflicting, 'utf8');
    await assert.rejects(recover(incompleteDir), /同一 attempt 冲突/);
    assert.equal(await fs.readFile(incompleteFile, 'utf8'), conflicting);
  } finally { for (const resumed of recoveryMeters) await resumed.stop(); }

  await mock.stop(true);
  const disconnected = await fetch(meter.baseUrlFor('network') + '/responses', requestOptions('json'));
  assert.equal(disconnected.status, 502);
  await disconnected.text();
  const network = await settled('network');
  assert.equal(network.unknownUsageCount, 1);
  assert.equal(network.attempts[0].error, 'upstream');
  assert.equal((await meter.snapshot('absent')).attempts.length, 0);
  await meter.stop();
  const log = await fs.readFile(path.join(outputDir, 'attempts.jsonl'), 'utf8');
  const records = log.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(records.length, 18);
  assert.equal(new Set(records.map(record => record.id)).size, 9);
  assert.equal(records.filter(record => record.pending === true).length, 9);
  assert.equal(records.filter(record => record.pending === false).length, 9);
  for (const id of new Set(records.map(record => record.id))) assert.deepEqual(records.filter(record => record.id === id).map(record => record.pending), [true, false]);
  for (const secret of [credential, prompt, generated, '不可作为顶层模型']) assert.equal(log.includes(secret), false, '日志保存了正文或凭据');
  assert.equal(records.some(record => 'headers' in record || 'body' in record || 'authorization' in record), false);
  console.log('Token 计量检查通过：保真转发、分片 JSON/SSE、缓存未知、开始日志与恢复归并、运行隔离、失败与取消、日志最小化。');
} finally {
  await meter.stop();
  await mock.stop(true);
  const resolved = await fs.realpath(outputDir);
  if (path.dirname(resolved) !== await fs.realpath(cache)) throw new Error('测试缓存路径超出预期范围。');
  await fs.rm(resolved, { recursive: true, force: true });
}
