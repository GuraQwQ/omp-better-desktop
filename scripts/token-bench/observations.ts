import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { MeterAttempt, MeterSummary } from './meter';

export interface BenchEvent { elapsedMs: number; type: string; toolName?: string; toolCallId?: string; sessionId?: string; isError?: boolean }
type Source = 'foreground' | 'auxiliary' | 'other_session' | 'unknown';
interface Turn {
  signature: string;
  file: string;
  sessionId?: string;
  source: Source;
  purpose?: string;
  tools: string[];
  toolOnly: boolean;
  todoOnly: boolean;
}
export interface RequestObservation {
  attemptId: string;
  source: Source;
  sessionFile?: string;
  sessionId?: string;
  purpose?: string;
  possibleMislaunch?: boolean;
  matches: number;
  phase: 'startup' | 'task' | 'drain' | 'unknown';
  tools?: string[];
  toolOnly?: boolean;
  todoOnly?: boolean;
}
export interface RunObservations {
  requests: RequestObservation[];
  sources: { source: Source; requests: number; knownTokens: number; unknownUsage: number }[];
  possibleMislaunchRequests: number;
  possibleMislaunchKnownTokens: number;
  coverage: { usageRequests: number; cacheRequests: number; modelRequests: number; knownInputCacheCoverage: number | null };
  timing: { requestElapsedMs: number; firstBodyByteMs: number; firstBodyByteCount: number; afterFirstBodyByteMs: number; timedRequests: number; requestBusyWallMs: number | null; toolBusyWallMs: number | null };
  turns: { primaryAssistantTurns: number; toolOnlyTurns: number; todoOnlyTurns: number; matchedToolOnlyRequests: number; matchedTodoOnlyRequests: number; evalCalls: number; evalErrors: number; evalErrorKinds: Record<string, number> };
  warnings: string[];
}

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const signature = (total: unknown, output: unknown, input: unknown) => [total, output, input].every(value => number(value) !== undefined) ? [total, output, input].join(':') : undefined;
const canonical = (file: string) => process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file);
const sum = <T>(values: readonly T[], pick: (value: T) => number) => values.reduce((value, item) => value + pick(item), 0);

function union(intervals: { start: number; end: number }[]) {
  let result = 0, previous = { start: 0, end: 0 };
  for (const current of intervals.sort((a, b) => a.start - b.start)) {
    if (current.start > previous.end) { result += previous.end - previous.start; previous = { ...current }; }
    else previous.end = Math.max(previous.end, current.end);
  }
  return result + previous.end - previous.start;
}

function toolWall(events: readonly BenchEvent[]): number | null {
  let active = 0, start = 0, duration = 0;
  for (const event of events) {
    if (event.type === 'tool_execution_start') { if (active++ === 0) start = event.elapsedMs; }
    else if (event.type === 'tool_execution_end') {
      if (--active < 0) return null;
      if (active === 0) duration += event.elapsedMs - start;
    }
  }
  return active === 0 ? duration : null;
}

/** 只保存归属和计量元数据；消息正文仅在内存判断工具/输入形态，不写入观测报告。 */
export async function observeRun({ home, primarySessionPath, meter, events, taskStartedAtMs, taskEndedAtMs }: {
  home: string; primarySessionPath?: string; meter: MeterSummary; events: readonly BenchEvent[]; taskStartedAtMs?: number; taskEndedAtMs?: number;
}): Promise<RunObservations> {
  const warnings: string[] = [];
  const turns: Turn[] = [];
  const scriptSessions = new Set<string>();
  let usesOwnExecutable = false, evalCalls = 0, evalErrors = 0;
  const evalErrorKinds: Record<string, number> = {};
  const sessions = path.join(home, '.omp/agent/sessions');
  const files = await fs.readdir(sessions, { recursive: true }).catch(error => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') warnings.push('部分会话目录无法读取，相关归属保持未知。');
    return [] as string[];
  });
  for (const file of files.filter(file => file.endsWith('.jsonl')).sort()) {
    const absolute = path.join(sessions, file);
    const primary = primarySessionPath !== undefined && canonical(absolute) === canonical(primarySessionPath);
    const relative = path.relative(home, absolute).replace(/\\/g, '/');
    let sessionId: string | undefined;
    let firstUserSeen = false;
    let lines: string[];
    try { lines = (await fs.readFile(absolute, 'utf8')).split('\n'); }
    catch { warnings.push('部分会话文件无法读取，相关归属保持未知。'); continue; }
    for (const line of lines) {
      if (!line.trim()) continue;
      let entry: Record<string, unknown>;
      try { entry = object(JSON.parse(line)); }
      catch { warnings.push('会话包含未完整保存的条目，相关归属保持未知。'); continue; }
      if (entry.type === 'session' && typeof entry.id === 'string') sessionId = entry.id;
      const message = object(entry.message);
      const content = Array.isArray(message.content) ? message.content.map(object) : [];
      if (message.role === 'user' && !firstUserSeen) {
        firstUserSeen = true;
        const text = typeof message.content === 'string' ? message.content.trim() : content.filter(part => part.type === 'text').map(part => String(part.text ?? '')).join('\n').trim();
        if (!primary && text.length < 512 && !/[\r\n]/.test(text) && /\.(?:mjs|cjs|js|ts)$/i.test(text)) scriptSessions.add(relative);
      }
      const calls = content.filter(part => part.type === 'toolCall');
      if (primary) {
        for (const call of calls) {
          const args = object(call.arguments);
          if (call.name === 'eval') {
            evalCalls++;
            if (typeof args.code === 'string' && /\b(?:spawnSync|spawn|execFileSync|execFile)\s*\(\s*process\.execPath\b/.test(args.code)) usesOwnExecutable = true;
          }
        }
        if (message.role === 'toolResult' && message.toolName === 'eval' && message.isError === true) {
          evalErrors++;
          const text = content.filter(part => part.type === 'text').map(part => String(part.text ?? '')).join('\n');
          const kind = /^Command timed out/.test(text) ? 'timeout' : /^ReferenceError/.test(text) ? 'reference' : /^TypeError/.test(text) ? 'type' : /^AssertionError/.test(text) ? 'assertion' : /^SyntaxError/.test(text) ? 'syntax' : 'other';
          evalErrorKinds[kind] = (evalErrorKinds[kind] ?? 0) + 1;
        }
      }
      const auxiliary = entry.type === 'model_usage';
      if (!auxiliary && message.role !== 'assistant') continue;
      const usage = object(auxiliary ? entry.usage : message.usage);
      const input = number(usage.input);
      const stamp = signature(usage.totalTokens, usage.output, input === undefined ? undefined : input + (number(usage.cacheRead) ?? 0) + (number(usage.cacheWrite) ?? 0));
      if (!stamp) continue;
      const tools = calls.filter(call => typeof call.name === 'string').map(call => call.name as string);
      turns.push({ signature: stamp, file: relative, sessionId, source: auxiliary ? 'auxiliary' : primary ? 'foreground' : 'other_session',
        ...(auxiliary && typeof entry.purpose === 'string' ? { purpose: entry.purpose } : {}), tools,
        toolOnly: tools.length > 0 && !content.some(part => part.type === 'text' && typeof part.text === 'string' && part.text.trim()),
        todoOnly: tools.length > 0 && tools.every(tool => tool === 'todo'),
      });
    }
  }
  const models = meter.attempts.filter(attempt => attempt.kind === 'model');
  const requests = models.map((attempt): RequestObservation => {
    const stamp = attempt.usage && signature(attempt.usage.totalTokens, attempt.usage.outputTokens, attempt.usage.inputTokens);
    const matches = stamp ? turns.filter(turn => turn.signature === stamp) : [];
    const match = matches.length === 1 ? matches[0] : undefined;
    const phase = attempt.startedAtMs === undefined || taskStartedAtMs === undefined ? 'unknown' : attempt.startedAtMs < taskStartedAtMs ? 'startup' : taskEndedAtMs !== undefined && attempt.startedAtMs > taskEndedAtMs ? 'drain' : 'task';
    return { attemptId: attempt.id, source: match?.source ?? 'unknown', matches: matches.length, phase,
      ...(match ? { sessionFile: match.file, sessionId: match.sessionId, purpose: match.purpose, tools: match.tools, toolOnly: match.toolOnly, todoOnly: match.todoOnly,
        possibleMislaunch: match.source === 'other_session' && usesOwnExecutable && scriptSessions.has(match.file) } : {}),
    };
  });
  const requestMap = new Map(models.map(attempt => [attempt.id, attempt]));
  const primaryTurns = turns.filter(turn => turn.source === 'foreground');
  const timed = models.filter((attempt): attempt is MeterAttempt & { startedAtMs: number; endedAtMs: number } => attempt.startedAtMs !== undefined && attempt.endedAtMs !== undefined && attempt.endedAtMs >= attempt.startedAtMs);
  const sources = (['foreground', 'auxiliary', 'other_session', 'unknown'] as Source[]).map(source => {
    const selected = requests.filter(request => request.source === source).map(request => requestMap.get(request.attemptId)!);
    return { source, requests: selected.length, knownTokens: sum(selected, attempt => attempt.usage?.totalTokens ?? 0), unknownUsage: selected.filter(attempt => !attempt.usage).length };
  });
  const possible = requests.filter(request => request.possibleMislaunch).map(request => requestMap.get(request.attemptId)!);
  const firstBytes = models.filter(attempt => attempt.firstByteMs !== undefined);
  return {
    requests, sources, possibleMislaunchRequests: possible.length, possibleMislaunchKnownTokens: sum(possible, attempt => attempt.usage?.totalTokens ?? 0),
    coverage: { usageRequests: models.filter(attempt => attempt.usage).length, cacheRequests: models.filter(attempt => attempt.usage && attempt.usage.cacheReadTokens !== null).length, modelRequests: models.length,
      knownInputCacheCoverage: meter.knownInputTokens > 0 ? meter.knownCacheInputTokens / meter.knownInputTokens : null },
    timing: { requestElapsedMs: sum(models, attempt => attempt.elapsedMs), firstBodyByteMs: sum(firstBytes, attempt => attempt.firstByteMs!), firstBodyByteCount: firstBytes.length,
      afterFirstBodyByteMs: sum(firstBytes, attempt => Math.max(0, attempt.elapsedMs - attempt.firstByteMs!)), timedRequests: timed.length,
      requestBusyWallMs: timed.length === models.length ? union(timed.map(attempt => ({ start: attempt.startedAtMs, end: attempt.endedAtMs }))) : null,
      toolBusyWallMs: toolWall(events) },
    turns: { primaryAssistantTurns: primaryTurns.length, toolOnlyTurns: primaryTurns.filter(turn => turn.toolOnly).length, todoOnlyTurns: primaryTurns.filter(turn => turn.todoOnly).length,
      matchedToolOnlyRequests: requests.filter(request => request.source === 'foreground' && request.toolOnly).length,
      matchedTodoOnlyRequests: requests.filter(request => request.source === 'foreground' && request.todoOnly).length,
      evalCalls, evalErrors, evalErrorKinds },
    warnings: [...new Set(warnings)],
  };
}
