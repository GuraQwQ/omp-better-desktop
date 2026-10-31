import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parseArgs } from 'node:util';
import { cases, prepareCase, verifyCase, type BenchCase, type BenchResult } from './fixtures';
import { startMeter, type MeterSummary } from './meter';
import { openRpc, type Frame } from './rpc';

interface Provider { baseUrl: string; apiKey: string; modelId: string; thinking: string }
interface State {
  model?: { id: string; provider: string };
  thinkingLevel?: string;
  systemPrompt?: string[];
  dumpTools?: { name: string; description: string; parameters: unknown }[];
}
interface Result {
  caseId: string; title: string; complexity: BenchCase['complexity']; variant: 'original' | 'experimental';
  status: string; error?: string; quality: BenchResult; promptSha256: string; startupMs: number;
  executionMs: number; totalMs: number; toolCalls: Record<string, number>; meter: MeterSummary;
  cacheHitRate: number | null; knownCacheHitRate: number | null;
  measurementComplete: boolean;
  resumed?: boolean;
  timingComplete?: boolean;
}

const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const record = (value: unknown): Frame => value && typeof value === 'object' ? value as Frame : {};

/** 用户目录、应用目录和缓存均属于该次基准；密钥只通过子进程环境传递。 */
export function benchmarkEnvironment(home: string, cache: string, apiKey: string): NodeJS.ProcessEnv {
  const inherited: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'ComSpec', 'COMSPEC', 'PATHEXT', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE']) {
    if (process.env[key] !== undefined) inherited[key] = process.env[key];
  }
  return {
    ...inherited, USERPROFILE: home, HOMEDRIVE: path.parse(home).root.replace(/[\\/]+$/, ''), HOMEPATH: home.slice(path.parse(home).root.length - 1),
    APPDATA: path.join(home, 'AppData/Roaming'), LOCALAPPDATA: path.join(home, 'AppData/Local'),
    PI_CONFIG_DIR: '.omp', PI_CODING_AGENT_DIR: path.join(home, '.omp/agent'), PI_NATIVES_DIR: path.join(cache, 'natives'),
    TEMP: path.join(cache, 'tmp'), TMP: path.join(cache, 'tmp'),
    BUN_INSTALL_CACHE_DIR: path.join(cache, 'bun'), BUN_RUNTIME_TRANSPILER_CACHE_PATH: path.join(cache, 'transpiler'),
    npm_config_cache: path.join(cache, 'npm'), PYTHONPYCACHEPREFIX: path.join(cache, 'python'),
    OMP_BENCH_API_KEY: apiKey,
  };
}

async function configure(home: string, baseUrl: string, provider: Provider, optimized: boolean, skill?: Awaited<ReturnType<typeof prepareCase>>['skill']) {
  const agent = path.join(home, '.omp/agent');
  await fs.mkdir(agent, { recursive: true });
  await fs.writeFile(path.join(agent, 'models.yml'), json({ providers: { bench: {
    api: 'openai-completions', apiKey: 'OMP_BENCH_API_KEY', baseUrl,
    models: [{ id: provider.modelId }],
  } } }), 'utf8');
  const settings = {
    modelRoles: { default: 'bench/' + provider.modelId, smol: 'bench/' + provider.modelId },
    mcp: { enableProjectConfig: false },
    // 当前外部 bench 提供商直连时为 off；固定有效值，避免本机计量地址触发 auto 的本地模型策略。
    provider: { appendOnlyContext: 'off' },
    skills: { enableClaudeUser: false, enableClaudeProject: false, enableCodexUser: false, enableAgentsUser: false, enableAgentsProject: false, enablePiProject: false, includeSkills: skill ? [skill.name] : [] },
    ...(optimized ? { tokenOptimization: { skillCacheReuse: true, programmatic: true } } : {}),
  };
  await fs.writeFile(path.join(agent, 'config.yml'), json(settings), 'utf8');
  if (skill) {
    const directory = path.join(agent, 'skills', skill.name);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'SKILL.md'), '---\nname: ' + JSON.stringify(skill.name) + '\ndescription: ' + JSON.stringify(skill.description) + '\n---\n\n' + skill.body + '\n', 'utf8');
  }
}

function argumentsFor(provider: Provider, skill: boolean): string[] {
  return ['--mode', 'rpc-ui', '--model', 'bench/' + provider.modelId, '--thinking', provider.thinking, '--no-extensions', '--no-rules', '--no-context-files', '--auto-approve', ...(!skill ? ['--no-skills'] : [])];
}

async function initialized(root: string, home: string, cache: string) {
  for (const folder of [root, home, path.join(cache, 'tmp'), path.join(home, 'AppData/Roaming'), path.join(home, 'AppData/Local')]) await fs.mkdir(folder, { recursive: true });
}

export async function preflight(executables: { original: string; experimental: string }, output: string) {
  const provider: Provider = { baseUrl: 'http://127.0.0.1:9/v1', apiKey: 'offline-unused', modelId: 'gpt-6.1-sol', thinking: 'high' };
  const workspace = path.join(output, 'preflight/workspace');
  const home = path.join(output, 'preflight/home');
  const cache = path.join(output, 'cache');
  await initialized(workspace, home, cache);
  const states: Record<string, State> = {};
  for (const mode of ['original', 'off', 'on'] as const) {
    await configure(home, provider.baseUrl, provider, mode === 'on');
    let stderr = '';
    const rpc = openRpc(mode === 'original' ? executables.original : executables.experimental, argumentsFor(provider, false), workspace, benchmarkEnvironment(home, cache, provider.apiKey), () => {}, text => { stderr += text; });
    try {
      await rpc.ready();
      states[mode] = (await rpc.request('get_state')).data as State;
      assert.equal(states[mode].model?.id, provider.modelId);
      assert.equal(states[mode].thinkingLevel, provider.thinking);
      assert(!(states[mode].dumpTools ?? []).some(tool => tool.name.startsWith('mcp_')), '离线空环境不应有 MCP 工具');
      const commands = (await rpc.request('get_available_commands')).data as { commands: { source?: string }[] };
      assert(!(commands.commands ?? []).some(command => command.source === 'skill'), '离线空环境不应加载技能');
    } catch (error) {
      throw new Error(String(error) + '\n' + stderr.slice(-3000));
    } finally { await rpc.stop(); }
  }
  assert.deepEqual(states.off.systemPrompt, states.original.systemPrompt, '关闭实验后，系统提示词必须与官方原版相同');
  assert.deepEqual(states.off.dumpTools, states.original.dumpTools, '关闭实验后，工具定义必须与官方原版相同');
  assert((states.on.systemPrompt ?? []).some(text => text.includes('# Programmatic tool use')), '组合开关未进入实际系统提示词');
  assert.equal((states.on.systemPrompt ?? []).filter(text => text.includes('# Programmatic tool use')).length, 1);
  const report = { defaultPromptEqual: true, defaultToolsEqual: true, programmaticBlockEnabled: true, model: provider.modelId, thinking: provider.thinking };
  await fs.writeFile(path.join(output, 'preflight.json'), json(report), 'utf8');
  return report;
}

function cacheRate(meter: MeterSummary): { cacheHitRate: number | null; knownCacheHitRate: number | null } {
  return {
    cacheHitRate: meter.pendingCount === 0 && meter.unknownUsageCount === 0 && meter.unknownCacheUsageCount === 0 && meter.knownInputTokens > 0 ? meter.cacheReadTokens / meter.knownInputTokens : null,
    knownCacheHitRate: meter.knownCacheInputTokens > 0 ? meter.cacheReadTokens / meter.knownCacheInputTokens : null,
  };
}

async function runCase(test: BenchCase, variant: Result['variant'], executable: string, provider: Provider, output: string, meter: Awaited<ReturnType<typeof startMeter>>, timeoutMs: number, resume = false): Promise<Result> {
  const runId = test.id + '-' + (variant === 'original' ? 'A' : 'B');
  const directory = path.join(output, runId);
  const workspace = path.join(directory, 'workspace');
  const home = path.join(directory, 'home');
  const cache = path.join(output, 'cache');
  let sessionPath: string | undefined;
  let prepared: Awaited<ReturnType<typeof prepareCase>>;
  if (resume && await fs.stat(workspace).catch(() => null)) {
    // 重建原始题面，保留已执行任务的工作区与会话，不把中断后的重试冒充全新样本。
    const seed = await fs.mkdtemp(path.join(output, '.resume-seed-'));
    try { prepared = await prepareCase(test.id, path.join(seed, 'workspace')); }
    finally { assert.equal(path.dirname(seed), output); await fs.rm(seed, { recursive: true, force: true }); }
    const sessions = path.join(home, '.omp/agent/sessions');
    const files = (await fs.readdir(sessions, { recursive: true }).catch(() => [] as string[])).filter(file => file.endsWith('.jsonl')).sort();
    if (files.length) sessionPath = path.join(sessions, files.at(-1)!);
  } else prepared = await prepareCase(test.id, workspace);
  const git = Bun.spawn(['git', 'init', '--quiet', workspace], { stdout: 'ignore', stderr: 'pipe' });
  assert.equal(await git.exited, 0, '建立独立任务仓库失败');
  await initialized(directory, home, cache);
  await configure(home, meter.baseUrlFor(runId), provider, variant === 'experimental', prepared.skill);
  const clean = (text: string) => text.split(provider.apiKey).join('[redacted]');
  const toolCalls: Record<string, number> = {};
  const events: Frame[] = [];
  let stderr = '';
  let lastAnswer = '';
  const started = performance.now();
  let taskStart = started;
  let taskEnd = started;
  let status = 'error';
  let error: string | undefined;
  const rpcArgs = [...argumentsFor(provider, !!prepared.skill), ...(sessionPath ? ['--session', sessionPath] : [])];
  const rpc = openRpc(executable, rpcArgs, workspace, benchmarkEnvironment(home, cache, provider.apiKey), frame => {
    if (frame.type === 'tool_execution_start' && typeof frame.toolName === 'string') toolCalls[frame.toolName] = (toolCalls[frame.toolName] ?? 0) + 1;
    if (frame.type === 'message_end') {
      const message = record(frame.message);
      if (message.role === 'assistant' && Array.isArray(message.content)) lastAnswer = message.content.map(record).filter(part => part.type === 'text').map(part => String(part.text ?? '')).join('\n');
    }
    if (['tool_execution_start', 'tool_execution_end', 'prompt_result', 'session_settled', 'agent_start', 'agent_end'].includes(String(frame.type))) {
      events.push({ elapsedMs: performance.now() - started, type: frame.type, ...(typeof frame.toolName === 'string' ? { toolName: frame.toolName } : {}), ...(typeof frame.status === 'string' ? { status: frame.status } : {}) });
    }
  }, text => { stderr = (stderr + clean(text)).slice(-12000); });
  try {
    await rpc.ready();
    const state = (await rpc.request('get_state')).data as State;
    assert.equal(state.model?.id, provider.modelId, '模型不匹配');
    assert.equal(state.thinkingLevel, provider.thinking, '思考档位不匹配');
    const guidance = (state.systemPrompt ?? []).some(text => text.includes('# Programmatic tool use'));
    assert.equal(guidance, variant === 'experimental', '实际系统提示词中的优化开关不匹配');
    assert(!(state.dumpTools ?? []).some(tool => tool.name.startsWith('mcp_')), '本轮不加载 MCP');
    await fs.writeFile(path.join(directory, 'run-state.json'), json({ caseId: test.id, variant, sessionPath: record(state).sessionFile, startedAt: new Date().toISOString(), resumed: !!sessionPath, promptSha256: hash(prepared.prompt) }), 'utf8');
    taskStart = performance.now();
    const terminal = await rpc.prompt(sessionPath ? '继续完成保存会话中的同一项任务。先核实工作区现状，保留已经完成的修改，按原始要求完成剩余工作与验证。' : prepared.prompt, timeoutMs);
    taskEnd = performance.now();
    status = String(terminal.status);
    if (terminal.error) error = clean(JSON.stringify(terminal.error));
    // 等待后台辅助请求；主回答结束不等于整条任务已经停止消耗。
    const drainDeadline = Date.now() + 40_000;
    let quietSince = 0;
    while (Date.now() < drainDeadline) {
      const current = await meter.snapshot(runId);
      if (current.pendingCount === 0) {
        quietSince ||= Date.now();
        if (Date.now() - quietSince >= 1500) break;
      } else quietSince = 0;
      await delay(250);
    }
  } catch (failure) {
    taskEnd = performance.now();
    error = clean(String(failure));
    status = error.includes('超时') ? 'timeout' : 'error';
    await rpc.request('abort', {}, 5_000).catch(() => {});
  } finally { await rpc.stop(); }
  const totalMs = performance.now() - started;
  const finalDeadline = Date.now() + 10_000;
  while ((await meter.snapshot(runId)).pendingCount > 0 && Date.now() < finalDeadline) await delay(100);
  const summary = await meter.snapshot(runId);
  const quality = await verifyCase(test.id, workspace);
  if (status !== 'completed') quality.passed = false;
  const result: Result = { caseId: test.id, title: test.title, complexity: test.complexity, variant, status, ...(error ? { error } : {}), quality, promptSha256: hash(prepared.prompt), startupMs: taskStart - started, executionMs: taskEnd - taskStart, totalMs, toolCalls, meter: summary, resumed: !!sessionPath, timingComplete: !sessionPath, measurementComplete: !sessionPath && summary.pendingCount === 0 && summary.unknownUsageCount === 0, ...cacheRate(summary), ...(sessionPath ? { cacheHitRate: null } : {}) };
  await fs.writeFile(path.join(directory, 'result.json'), json(result), 'utf8');
  await fs.writeFile(path.join(directory, 'events.json'), json(events), 'utf8');
  await fs.writeFile(path.join(directory, 'answer.txt'), clean(lastAnswer), 'utf8');
  await fs.writeFile(path.join(directory, 'stderr.log'), stderr, 'utf8');
  console.log(json({ caseId: test.id, variant, complexity: test.complexity, status, passed: quality.passed, seconds: Math.round(result.executionMs / 1000), tokens: summary.knownTotalTokens, cacheHitRate: result.cacheHitRate, unknownUsage: summary.unknownUsageCount, tools: toolCalls }).trim());
  return result;
}

function markdown(results: Result[]) {
  const lines = ['# 官方原版与实验组合：本机首轮对照', '', '实验组同时开启技能缓存复用和程序化编排。每题只有一对样本，复杂度是本夹具内部的相对分级，不代表大型项目结论。', '', '| 任务 | 复杂度 | 版本 | 质量 | 执行秒 | 全程秒 | 总 token（已知） | 输入缓存命中率 | 未知用量请求 |', '|---|---|---|---|---:|---:|---:|---:|---:|'];
  for (const result of results) lines.push('| ' + [result.title, result.complexity, result.variant + (result.resumed ? '（中断续跑）' : ''), result.quality.passed ? '通过' : '未通过', (result.executionMs / 1000).toFixed(1) + (result.resumed ? '（续跑段）' : ''), (result.totalMs / 1000).toFixed(1), result.meter.knownTotalTokens, result.cacheHitRate === null ? '未知' : (result.cacheHitRate * 100).toFixed(1) + '%', result.meter.unknownUsageCount].join(' | ') + ' |');
  lines.push('', '缓存率使用整项任务的缓存读取 token 之和 / 供应商报告的总输入 token 之和，不平均各次请求百分比。输入已包含缓存子集；输出已包含思考，均不重复加总。未知用量或未知缓存使完整缓存率不可确定。', '', '“执行秒”从提交任务到代理及其派生工作终态；“全程秒”另含启动、后台请求收尾与进程关闭。质量由独立 oracle 与隐藏输入验收，未使用模型自评分。失败任务消耗仍保留，但不能作为省 token 的成功案例。', '', '本轮不单独归因某个开关；候选实际使用 eval 的次数见各 result.json。真实供应商缓存无法由本机完全控制，任务顺序交替 A/B，仍需更多配对验证稳定性。');
  return lines.join('\n') + '\n';
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { original: { type: 'string' }, experimental: { type: 'string' }, provider: { type: 'string' }, output: { type: 'string' }, preflight: { type: 'boolean', default: false }, resume: { type: 'boolean', default: false }, 'timeout-ms': { type: 'string', default: '600000' } }, strict: true });
  assert(values.original && values.experimental && values.output, '需要 --original、--experimental、--output');
  const executables = { original: path.resolve(values.original), experimental: path.resolve(values.experimental) };
  const output = path.resolve(values.output);
  assert(!/^[cC]:[\\/]/.test(output), '基准目录应位于非 C 盘');
  await fs.mkdir(output, { recursive: true });
  for (const executable of Object.values(executables)) assert((await fs.stat(executable)).isFile());
  if (values.preflight) {
    console.log(json(await preflight(executables, output)));
  } else {
    assert(values.provider, '需要指向本机隔离凭据文件的 --provider');
    const provider = JSON.parse(await fs.readFile(path.resolve(values.provider), 'utf8')) as Provider;
    assert(provider.baseUrl && provider.apiKey && provider.modelId && provider.thinking, '测试供应商配置不完整');
    const timeoutMs = Number(values['timeout-ms']);
    assert(Number.isFinite(timeoutMs) && timeoutMs > 0);
    if (!values.resume) assert.equal((await fs.readdir(output)).length, 0, '真实对照需要全新的输出目录，避免混入旧记录');
    if (!values.resume) await preflight(executables, output);
    const metadata = { startedAt: new Date().toISOString(), model: provider.modelId, thinking: provider.thinking, binaries: await Promise.all(Object.entries(executables).map(async ([variant, executable]) => ({ variant, sha256: hash(await fs.readFile(executable)), bytes: (await fs.stat(executable)).size }))), cases, taskCount: cases.length * 2, timeoutMs, nativeCache: 'warmed by offline preflight; per-task skill caches start empty', providerAppendOnlyContext: 'off: matches direct external bench provider; prevents loopback auto policy', optimized: { skillCacheReuse: true, programmatic: true } };
    if (values.resume) {
      const previous = JSON.parse(await fs.readFile(path.join(output, 'metadata.json'), 'utf8'));
      assert.equal(previous.model, provider.modelId);
      assert.equal(previous.thinking, provider.thinking);
      assert.deepEqual(previous.binaries, metadata.binaries, '续跑必须使用原样本的两份内核');
      await fs.writeFile(path.join(output, 'resume-' + Date.now() + '.json'), json({ resumedAt: new Date().toISOString(), metadata }), 'utf8');
    } else await fs.writeFile(path.join(output, 'metadata.json'), json(metadata), 'utf8');
    const meter = await startMeter({ targetBaseUrl: provider.baseUrl, outputDir: path.join(output, 'meter') });
    const results: Result[] = values.resume ? JSON.parse(await fs.readFile(path.join(output, 'results.json'), 'utf8')) : [];
    try {
      for (const [index, test] of cases.entries()) {
        const order: Result['variant'][] = index % 2 === 0 ? ['original', 'experimental'] : ['experimental', 'original'];
        for (const variant of order) {
          if (results.some(result => result.caseId === test.id && result.variant === variant)) continue;
          const started = performance.now();
          try {
            results.push(await runCase(test, variant, executables[variant], provider, output, meter, timeoutMs, values.resume));
          } catch (error) {
            const summary = await meter.snapshot(test.id + '-' + (variant === 'original' ? 'A' : 'B'));
            results.push({ caseId: test.id, title: test.title, complexity: test.complexity, variant, status: 'harness_error', error: String(error).split(provider.apiKey).join('[redacted]'), quality: { passed: false, checks: [{ name: '基准准备或验收', passed: false }] }, promptSha256: '', startupMs: 0, executionMs: performance.now() - started, totalMs: performance.now() - started, toolCalls: {}, meter: summary, measurementComplete: false, ...cacheRate(summary) });
          }
          await fs.writeFile(path.join(output, 'results.json'), json(results), 'utf8');
          await fs.writeFile(path.join(output, 'report.md'), markdown(results), 'utf8');
        }
      }
      for (const test of cases) {
        const pair = results.filter(result => result.caseId === test.id);
        if (pair.every(result => result.promptSha256)) assert.equal(pair[0].promptSha256, pair[1].promptSha256);
      }
    } finally { await meter.stop(); }
    console.log('本机对照完成：' + path.join(output, 'report.md'));
  }
}
