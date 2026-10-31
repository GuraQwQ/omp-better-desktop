import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface MeterUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number | null;
  reasoningTokens?: number;
  totalTokens: number;
}

export interface MeterAttempt {
  id: string;
  runId: string;
  kind: 'model' | 'metadata';
  model?: string;
  method: string;
  path: string;
  status?: number;
  elapsedMs: number;
  /** 转发层收到响应正文首字节的时间，不是模型 TTFT。 */
  firstByteMs?: number;
  requestBytes: number;
  responseBytes: number;
  usage: MeterUsage | null;
  complete: boolean;
  pending: boolean;
  error?: 'upstream' | 'cancelled' | 'stream' | 'usage_missing' | 'interrupted';
}

export interface MeterSummary {
  attempts: MeterAttempt[];
  modelAttemptCount: number;
  knownTotalTokens: number;
  inputTokens: number;
  knownInputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  /** 只包含明确报告缓存桶的请求，可用作已知部分缓存命中率的分母。 */
  knownCacheInputTokens: number;
  unknownUsageCount: number;
  unknownCacheUsageCount: number;
  pendingCount: number;
}

const object = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const count = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

function usageOf(value: unknown): MeterUsage | null {
  const usage = object(value);
  if (!usage) return null;
  const inputTokens = count(usage.input_tokens) ?? count(usage.prompt_tokens);
  const outputTokens = count(usage.output_tokens) ?? count(usage.completion_tokens);
  if (inputTokens === undefined || outputTokens === undefined) return null;
  const inputDetails = object(usage.input_tokens_details) ?? object(usage.prompt_tokens_details);
  const outputDetails = object(usage.output_tokens_details) ?? object(usage.completion_tokens_details);
  const reasoningTokens = count(outputDetails?.reasoning_tokens);
  return {
    inputTokens, outputTokens,
    cacheReadTokens: count(inputDetails?.cached_tokens) ?? count(usage.prompt_cache_hit_tokens) ?? null,
    ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
    totalTokens: count(usage.total_tokens) ?? inputTokens + outputTokens,
  };
}

function restoredAttempt(value: unknown): MeterAttempt {
  const row = object(value);
  if (!row || typeof row.id !== 'string' || !row.id || typeof row.runId !== 'string' || !row.runId ||
      (row.kind !== 'model' && row.kind !== 'metadata') || typeof row.method !== 'string' || typeof row.path !== 'string' ||
      typeof row.complete !== 'boolean' || typeof row.pending !== 'boolean') throw new Error('记录状态或字段无效');
  for (const key of ['elapsedMs', 'requestBytes', 'responseBytes'] as const) if (count(row[key]) === undefined) throw new Error('计量字段无效');
  if (row.status !== undefined && count(row.status) === undefined) throw new Error('状态字段无效');
  if (row.firstByteMs !== undefined && count(row.firstByteMs) === undefined) throw new Error('首字节字段无效');
  if (row.model !== undefined && typeof row.model !== 'string') throw new Error('模型字段无效');
  if (row.error !== undefined && !['upstream', 'cancelled', 'stream', 'usage_missing', 'interrupted'].includes(String(row.error))) throw new Error('错误字段无效');
  if (row.pending && (row.complete || row.usage !== null)) throw new Error('开始记录不能包含终态用量');
  let usage: MeterUsage | null = null;
  if (row.usage !== null) {
    const saved = object(row.usage);
    if (!saved || count(saved.inputTokens) === undefined || count(saved.outputTokens) === undefined || count(saved.totalTokens) === undefined ||
        (saved.cacheReadTokens !== null && count(saved.cacheReadTokens) === undefined) ||
        (saved.reasoningTokens !== undefined && count(saved.reasoningTokens) === undefined)) throw new Error('用量字段无效');
    usage = {
      inputTokens: saved.inputTokens as number, outputTokens: saved.outputTokens as number,
      cacheReadTokens: saved.cacheReadTokens as number | null, totalTokens: saved.totalTokens as number,
      ...(saved.reasoningTokens === undefined ? {} : { reasoningTokens: saved.reasoningTokens as number }),
    };
  }
  // 只恢复计量白名单；旧文件里出现的正文或额外字段不会进入 snapshot。
  return {
    id: row.id, runId: row.runId, kind: row.kind, method: row.method, path: row.path,
    ...(row.model === undefined ? {} : { model: row.model as string }),
    ...(row.status === undefined ? {} : { status: row.status as number }),
    elapsedMs: row.elapsedMs as number,
    ...(row.firstByteMs === undefined ? {} : { firstByteMs: row.firstByteMs as number }),
    requestBytes: row.requestBytes as number, responseBytes: row.responseBytes as number,
    usage, complete: row.complete, pending: row.pending,
    ...(row.error === undefined ? {} : { error: row.error as MeterAttempt['error'] }),
  };
}

async function recoverAttempts(file: string): Promise<{ attempts: MeterAttempt[]; separator: string }> {
  let bytes: Uint8Array;
  try { bytes = await fs.readFile(file); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { attempts: [], separator: '' }; throw error; }
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('已有计量日志的 UTF-8 不完整，原文件已保留；请核对并修复计量证据后继续。'); }
  const unique = new Map<string, MeterAttempt>();
  for (const [index, line] of text.split('\n').entries()) {
    if (!line.trim()) continue;
    let row: MeterAttempt;
    try { row = restoredAttempt(JSON.parse(line)); }
    catch { throw new Error(`已有计量日志第 ${index + 1} 行不完整或无效，原文件已保留；请修复计量证据后继续，不能将缺失用量记为零。`); }
    const previous = unique.get(row.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(row)) {
      const finishesPending = previous.pending && !row.pending && previous.runId === row.runId && previous.kind === row.kind && previous.method === row.method && previous.path === row.path;
      if (!finishesPending) throw new Error(`已有计量日志第 ${index + 1} 行与同一 attempt 冲突，原文件已保留；请核对计量证据后继续。`);
    }
    unique.set(row.id, row);
  }
  // 遗留开始行可能已经产生费用，恢复为未知而不是永久运行中或零消耗。
  const attempts = [...unique.values()].map(row => row.pending ? { ...row, pending: false, complete: false, usage: null, error: 'interrupted' as const } : row);
  return { attempts, separator: text.length > 0 && !text.endsWith('\n') ? '\n' : '' };
}

/** 只截取顶层白名单字段，跳过提示词和生成正文，内存不随 JSON 正文增长。 */
class JsonFields {
  depth = 0;
  quoted = false;
  escaped = false;
  readingKey = false;
  key = '';
  field = '';
  expectsKey = true;
  expectsValue = false;
  capture?: { field: string; text: string; kind: 'string' | 'container' | 'primitive'; oversized: boolean };
  constructor(readonly fields: Set<string>, readonly receive: (field: string, value: unknown) => void) {}

  finish() {
    const capture = this.capture;
    this.capture = undefined;
    if (!capture || capture.oversized) return;
    try { this.receive(capture.field, JSON.parse(capture.text)); } catch { /* 不完整字段不作为用量证据。 */ }
  }

  push(text: string) {
    for (const char of text) {
      if (this.capture?.kind === 'primitive' && !this.quoted && this.depth === 1 && (char === ',' || char === '}')) this.finish();
      if (this.expectsValue && !this.quoted && this.depth === 1 && !/\s/.test(char)) {
        this.expectsValue = false;
        if (this.fields.has(this.field)) this.capture = { field: this.field, text: '', kind: char === '"' ? 'string' : char === '{' || char === '[' ? 'container' : 'primitive', oversized: false };
      }
      if (this.capture) {
        if (this.capture.text.length < 65536) this.capture.text += char;
        else this.capture.oversized = true;
      }
      if (this.quoted) {
        if (this.readingKey && this.key.length < 256) this.key += char;
        if (this.escaped) { this.escaped = false; continue; }
        if (char === '\\') { this.escaped = true; continue; }
        if (char !== '"') continue;
        this.quoted = false;
        if (this.readingKey) {
          this.readingKey = false;
          this.expectsKey = false;
          try { this.field = JSON.parse(this.key); } catch { this.field = ''; }
        } else if (this.capture?.kind === 'string' && this.depth === 1) this.finish();
        continue;
      }
      if (char === '"') {
        this.quoted = true;
        if (this.depth === 1 && this.expectsKey) { this.readingKey = true; this.key = '"'; }
      } else if (char === '{' || char === '[') this.depth++;
      else if (char === '}' || char === ']') {
        this.depth--;
        if (this.capture?.kind === 'container' && this.depth === 1) this.finish();
      } else if (char === ':' && this.depth === 1) this.expectsValue = true;
      else if (char === ',' && this.depth === 1) { this.expectsKey = true; this.field = ''; }
    }
  }
}

class ResponseUsage {
  candidate: MeterUsage | null = null;
  terminal = false;
  readonly decoder = new TextDecoder();
  readonly json: JsonFields;
  line = '';
  data: string[] = [];
  eventBytes = 0;
  oversized = false;
  lastCr = false;
  constructor(readonly sse: boolean, readonly setModel: (model: string) => void) {
    this.json = new JsonFields(new Set(['usage', 'model']), (field, value) => {
      if (field === 'usage') this.candidate = usageOf(value) ?? this.candidate;
      else if (typeof value === 'string') this.setModel(value);
    });
  }
  event() {
    if (!this.terminal && !this.oversized && this.data.length) {
      const data = this.data.join('\n');
      if (data === '[DONE]') this.terminal = true;
      else {
        try {
          const frame = object(JSON.parse(data));
          const response = object(frame?.response);
          if (typeof frame?.model === 'string') this.setModel(frame.model);
          if (typeof response?.model === 'string') this.setModel(response.model);
          if (typeof frame?.type === 'string' && /^response\.(completed|incomplete|failed)$/.test(frame.type)) {
            this.terminal = true;
            this.candidate = usageOf(response?.usage) ?? this.candidate;
          } else this.candidate = usageOf(frame?.usage) ?? this.candidate;
        } catch { /* 非 JSON 的 SSE 事件原样转发，不猜测用量。 */ }
      }
    }
    this.data = []; this.eventBytes = 0; this.oversized = false;
  }
  push(chunk: Uint8Array, end = false) {
    const text = this.decoder.decode(chunk, { stream: !end });
    if (!this.sse) {
      this.json.push(text);
      if (end && (this.json.depth !== 0 || this.json.quoted)) this.candidate = null;
      return;
    }
    for (const char of text) {
      if (char === '\n' && this.lastCr) { this.lastCr = false; continue; }
      this.lastCr = char === '\r';
      if (char === '\n' || char === '\r') {
        const line = this.line;
        this.line = '';
        if (!line) this.event();
        else if (line.startsWith('data:') && !this.oversized) {
          const value = line.slice(5).replace(/^ /, '');
          this.eventBytes += value.length;
          if (this.eventBytes <= 1024 * 1024) this.data.push(value);
          else this.oversized = true;
        }
      } else if (this.line.length < 1024 * 1024) this.line += char;
      else this.oversized = true;
    }
    // 超大单事件只跳过解析；后续小型终态 usage 仍可正常读取。
    if (end && this.line) {
      if (this.line.startsWith('data:') && !this.oversized) this.data.push(this.line.slice(5).replace(/^ /, ''));
      this.line = '';
    }
    if (end) this.event();
  }
}

export async function startMeter({ targetBaseUrl, outputDir }: { targetBaseUrl: string; outputDir: string }) {
  const target = new URL(targetBaseUrl);
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('计量目标必须使用 HTTP 或 HTTPS。');
  const directory = path.resolve(outputDir);
  if (process.platform === 'win32' && /^[cC]:[\\/]/.test(directory)) throw new Error('计量日志目录请选择非 C 盘位置。');
  await fs.mkdir(directory, { recursive: true });
  const logFile = path.join(directory, 'attempts.jsonl');
  const recovered = await recoverAttempts(logFile);
  const attempts = recovered.attempts;
  let separator = recovered.separator;
  const active = new Set<AbortController>();
  let writes = Promise.resolve();
  const appendAttempt = (attempt: MeterAttempt) => {
    const record = separator + JSON.stringify(attempt) + '\n';
    separator = '';
    writes = writes.then(() => fs.appendFile(logFile, record, 'utf8'));
    // 失败仍由 fetch/snapshot/stop 抛出，事件回调不产生未处理拒绝。
    void writes.catch(() => {});
    return writes;
  };
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0, idleTimeout: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const route = /^\/_meter\/([^/]+)(\/.*)?$/.exec(url.pathname);
      if (!route) return new Response('未找到计量运行。', { status: 404 });
      let runId: string;
      try { runId = decodeURIComponent(route[1]); } catch { return new Response('运行标识无效。', { status: 400 }); }
      const suffix = route[2] ?? '';
      const endpoint = new URL(target);
      endpoint.pathname = target.pathname.replace(/\/$/, '') + suffix;
      endpoint.search = url.search;
      const started = performance.now();
      const attempt: MeterAttempt = { id: crypto.randomUUID(), runId, kind: request.method === 'POST' && /\/(?:chat\/completions|completions|responses(?:\/compact)?)\/?$/.test(suffix) ? 'model' : 'metadata', method: request.method, path: endpoint.pathname, elapsedMs: 0, requestBytes: 0, responseBytes: 0, usage: null, complete: false, pending: true };
      attempts.push(attempt);
      const startedWrite = appendAttempt(attempt);
      const abort = new AbortController();
      active.add(abort);
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let parsed: ResponseUsage | undefined;
      const setModel = (model: string) => { attempt.model ??= model; };
      const finish = (complete: boolean, error?: MeterAttempt['error']) => {
        if (!attempt.pending) return;
        attempt.pending = false; attempt.complete = complete; attempt.elapsedMs = performance.now() - started;
        attempt.usage = complete || parsed?.terminal ? parsed?.candidate ?? null : null;
        attempt.error = error ?? (attempt.kind === 'model' && !attempt.usage ? 'usage_missing' : undefined);
        active.delete(abort);
        request.signal.removeEventListener('abort', cancelled);
        appendAttempt(attempt);
      };
      const cancelled = () => { abort.abort(); void reader?.cancel().catch(() => {}); finish(false, 'cancelled'); };
      request.signal.addEventListener('abort', cancelled, { once: true });
      if (request.signal.aborted) cancelled();
      const modelDecoder = new TextDecoder();
      const requestFields = new JsonFields(new Set(['model']), (_field, value) => { if (typeof value === 'string') setModel(value); });
      const body = request.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) { attempt.requestBytes += chunk.byteLength; requestFields.push(modelDecoder.decode(chunk, { stream: true })); controller.enqueue(chunk); },
        flush() { requestFields.push(modelDecoder.decode()); },
      }));
      const headers = new Headers(request.headers);
      headers.delete('host'); headers.delete('connection'); headers.delete('transfer-encoding');
      try {
        await startedWrite;
        const response = await fetch(endpoint, { method: request.method, headers, body, signal: abort.signal, redirect: 'manual' });
        attempt.status = response.status;
        parsed = new ResponseUsage(response.headers.get('content-type')?.includes('text/event-stream') ?? false, setModel);
        const responseHeaders = new Headers(response.headers);
        // fetch 解压正文后同步移除传输编码与原长度，保持下游内容可读。
        if (responseHeaders.has('content-encoding')) { responseHeaders.delete('content-encoding'); responseHeaders.delete('content-length'); }
        responseHeaders.delete('transfer-encoding'); responseHeaders.delete('connection');
        if (!response.body || request.method === 'HEAD') { finish(true); return new Response(null, { status: response.status, statusText: response.statusText, headers: responseHeaders }); }
        reader = response.body.getReader();
        const stream = new ReadableStream<Uint8Array>({
          async pull(controller) {
            try {
              const chunk = await reader!.read();
              if (chunk.done) { parsed!.push(new Uint8Array(), true); finish(true); controller.close(); return; }
              attempt.firstByteMs ??= performance.now() - started;
              attempt.responseBytes += chunk.value.byteLength;
              parsed!.push(chunk.value);
              controller.enqueue(chunk.value);
            } catch {
              finish(false, abort.signal.aborted ? 'cancelled' : 'stream');
              controller.error(new Error('上游响应流中断。'));
            }
          },
          async cancel() { cancelled(); },
        });
        return new Response(stream, { status: response.status, statusText: response.statusText, headers: responseHeaders });
      } catch {
        finish(false, abort.signal.aborted ? 'cancelled' : 'upstream');
        return new Response('模型请求转发失败。', { status: 502 });
      }
    },
  });
  return {
    baseUrlFor(runId: string) {
      if (!runId) throw new Error('运行标识不能为空。');
      return `http://127.0.0.1:${server.port}/_meter/${encodeURIComponent(runId)}`;
    },
    async snapshot(runId: string): Promise<MeterSummary> {
      await writes;
      const rows = attempts.filter(attempt => attempt.runId === runId).map(attempt => ({ ...attempt, usage: attempt.usage ? { ...attempt.usage } : null }));
      const models = rows.filter(attempt => attempt.kind === 'model');
      const known = models.flatMap(attempt => attempt.usage ? [attempt.usage] : []);
      const inputTokens = known.reduce((sum, usage) => sum + usage.inputTokens, 0);
      return {
        attempts: rows, modelAttemptCount: models.length,
        knownTotalTokens: known.reduce((sum, usage) => sum + usage.totalTokens, 0),
        inputTokens, knownInputTokens: inputTokens,
        outputTokens: known.reduce((sum, usage) => sum + usage.outputTokens, 0),
        cacheReadTokens: known.reduce((sum, usage) => sum + (usage.cacheReadTokens ?? 0), 0),
        knownCacheInputTokens: known.filter(usage => usage.cacheReadTokens !== null).reduce((sum, usage) => sum + usage.inputTokens, 0),
        unknownUsageCount: models.filter(attempt => !attempt.pending && !attempt.usage).length,
        unknownCacheUsageCount: models.filter(attempt => !attempt.pending && (!attempt.usage || attempt.usage.cacheReadTokens === null)).length,
        pendingCount: rows.filter(attempt => attempt.pending).length,
      };
    },
    async stop() {
      for (const abort of active) abort.abort();
      await server.stop(true);
      await writes;
    },
  };
}
