import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parseArgs } from 'node:util';
import { benchmarkEnvironment } from './token-bench/run';
import { openRpc, type Frame } from './token-bench/rpc';

// 固定响应只驱动真实工具链；这里不连接真实模型，也不修改正式对照题。
const { values } = parseArgs({ options: {
  runtime: { type: 'string' }, source: { type: 'string' }, bun: { type: 'string' },
  baseline: { type: 'boolean', default: false }, python: { type: 'boolean', default: false },
}, strict: true });
if (!values.runtime && !values.source) {
  console.log('真实 OMP 合同检查需显式传入 --runtime 或 --source；本次跳过 RPC 验收。');
  process.exit(0);
}
assert(Boolean(values.runtime) !== Boolean(values.source), '指定 --runtime <OMP可执行文件> 或 --source <OMP源码目录>');
const repository = path.resolve(import.meta.dir, '..');
const cacheRoot = path.join(repository, '.cache/token-bench');
assert(!/^[cC]:[\\/]/.test(cacheRoot), '合同测试缓存应位于非 C 盘');
await fs.mkdir(cacheRoot, { recursive: true });
const root = await fs.mkdtemp(path.join(cacheRoot, 'harness-'));
const workspace = path.join(root, 'workspace');
const home = path.join(root, 'home');
const cache = path.join(root, 'cache');
const agent = path.join(home, '.omp/agent');
const executable = path.resolve(values.runtime ?? values.bun ?? process.execPath);
const executableHash = createHash('sha256');
for await (const chunk of createReadStream(executable)) executableHash.update(chunk);
const targetSha256 = executableHash.digest('hex');
const prefix = values.source ? [path.join(path.resolve(values.source), 'packages/coding-agent/src/cli.ts')] : [];
const marker = '__TOKEN_HARNESS_RESULT__';
const markerEnd = '__TOKEN_HARNESS_END__';
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const record = (value: unknown): Frame => value && typeof value === 'object' ? value as Frame : {};
const textContent = (value: unknown): string => typeof value === 'string' ? value : Array.isArray(value)
  ? value.map(textContent).join('') : String(record(value).text ?? '');
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
interface Plan { code: string; language: 'js' | 'py'; called: boolean }
const plans = new Map<string, Plan>();
const requests: { plan: string; tool: boolean }[] = [];
const readCounts = new Map<string, number>();
let activeReads = 0;
let peakReads = 0;
let sequence = 0;
let serverError: string | undefined;
const server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/files/')) {
    readCounts.set(url.pathname, (readCounts.get(url.pathname) ?? 0) + 1);
    activeReads++;
    peakReads = Math.max(peakReads, activeReads);
    try {
      if (url.pathname.includes('slow-')) await pause(150);
      if (url.pathname.includes('cancel-')) await pause(1200);
      return new Response('原生读取证据 ' + url.pathname + '\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    } finally { activeReads--; }
  }
  if (!url.pathname.endsWith('/chat/completions')) return new Response('not found', { status: 404 });
  const body = record(await request.json());
  const messages = Array.isArray(body.messages) ? body.messages.map(record) : [];
  const id = messages.filter(message => message.role === 'user')
    .map(message => /TOKEN-HARNESS:(\d+)/.exec(textContent(message.content))?.[1]).findLast(Boolean) ?? '';
  const plan = plans.get(id);
  if (!plan) { serverError = '出现未登记的模型请求'; return new Response(serverError, { status: 400 }); }
  const first = !plan.called;
  plan.called = true;
  requests.push({ plan: id, tool: first });
  const delta = first ? { role: 'assistant', tool_calls: [{ index: 0, id: 'harness-' + id, type: 'function', function: {
    name: 'eval', arguments: JSON.stringify({ language: plan.language, code: plan.code, title: '离线合同检查', timeout: 30 }),
  } }] } : { role: 'assistant', content: '合同步骤结束。' };
  const base = { id: 'harness-' + requests.length, object: 'chat.completion.chunk', created: 0, model: 'harness-model' };
  const chunks = [
    { ...base, choices: [{ index: 0, delta, finish_reason: null }] },
    { ...base, choices: [{ index: 0, delta: {}, finish_reason: first ? 'tool_calls' : 'stop' }] },
    { ...base, choices: [], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } },
  ];
  return new Response(chunks.map(chunk => 'data: ' + JSON.stringify(chunk) + '\n\n').join('') + 'data: [DONE]\n\n', {
    headers: { 'content-type': 'text/event-stream' },
  });
} });
const baseUrl = 'http://127.0.0.1:' + server.port;
const frames: Frame[] = [];
let stderr = '';
let rpc: ReturnType<typeof openRpc> | undefined;
const checks: string[] = [];
const evidence: Record<string, unknown> = {};
const launchArgs = ['--mode', 'rpc-ui', '--model', 'harness/harness-model', '--thinking', 'off',
  '--no-extensions', '--no-rules', '--no-context-files', '--no-skills', '--auto-approve', '--tools', 'eval,read,bash,todo,write,edit'];

function launch(session?: string, tools?: string) {
  const args = [...launchArgs];
  if (tools) args[args.indexOf('--tools') + 1] = tools;
  return openRpc(executable, [...prefix, ...args, ...(session ? ['--session', session] : [])], workspace,
    benchmarkEnvironment(home, cache, 'offline-unused'), frame => frames.push(frame), chunk => { stderr = (stderr + chunk).slice(-16000); });
}

function planned(code: string, language: 'js' | 'py' = 'js') {
  const id = String(++sequence);
  plans.set(id, { code, language, called: false });
  return 'TOKEN-HARNESS:' + id;
}

async function evaluate(code: string, language: 'js' | 'py' = 'js'): Promise<unknown> {
  assert(rpc);
  const start = frames.length;
  const terminal = await rpc.prompt(planned(code, language), 60000);
  assert.equal(terminal.status, 'completed', JSON.stringify(terminal));
  const results = frames.slice(start).filter(frame => frame.type === 'tool_execution_end' && frame.toolName === 'eval');
  assert.equal(results.length, 1, '每个固定响应应且只应执行一次 eval');
  const result = record(results[0].result);
  const output = textContent(result.content);
  assert(!results[0].isError && !result.isError, output || JSON.stringify(results[0]));
  const startAt = output.indexOf(marker);
  const endAt = output.indexOf(markerEnd, startAt + marker.length);
  assert(startAt >= 0 && endAt > startAt, 'eval 合同证据缺失或被截断：' + output.slice(-1500));
  assert.equal(serverError, undefined);
  return JSON.parse(output.slice(startAt + marker.length, endAt).trim());
}

const print = (expression: string) => 'console.log(' + JSON.stringify(marker) + ' + JSON.stringify(' + expression + ', null, 2) + ' + JSON.stringify('\n' + markerEnd) + ');';
const pythonPrint = (expression: string) => 'import json\nprint(' + JSON.stringify(marker) + ' + json.dumps(' + expression + ', ensure_ascii=False, indent=2) + ' + JSON.stringify('\n' + markerEnd) + ')';
const evaluateExpression = (expression: string) => evaluate(print(expression));
const setProgrammatic = async (value: boolean) => {
  assert(rpc);
  await rpc.request('desktop_settings', { operation: 'set', key: 'tokenOptimization.programmatic', value });
};
const state = async () => { assert(rpc); return record((await rpc.request('get_state')).data); };
const sessionFiles = async () => (await fs.readdir(path.join(agent, 'sessions'), { recursive: true })).filter(file => file.endsWith('.jsonl'));
const hasReadBatch = (value: Frame) => [textContent(value.systemPrompt),
  ...(Array.isArray(value.dumpTools) ? value.dumpTools.map(tool => String(record(tool).description ?? '')) : [])]
  .some(text => text.includes('<read_batch>'));

try {
  for (const directory of [workspace, agent, path.join(cache, 'tmp'), path.join(home, 'AppData/Roaming'), path.join(home, 'AppData/Local')]) await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(agent, 'models.yml'), json({ providers: { harness: {
    api: 'openai-completions', auth: 'none', baseUrl: baseUrl + '/v1',
    models: [{ id: 'harness-model', name: '本地合同响应器', reasoning: false, input: ['text'], contextWindow: 200000, maxTokens: 4096,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
  } } }), 'utf8');
  await fs.writeFile(path.join(agent, 'config.yml'), json({
    modelRoles: { default: 'harness/harness-model', smol: 'harness/harness-model' },
    provider: { appendOnlyContext: 'off' }, mcp: { enableProjectConfig: false }, edit: { mode: 'hashline' },
    eval: { autoProvision: false, autoBackground: { enabled: false }, py: values.python },
    compaction: { enabled: false }, ...(values.baseline ? {} : { tokenOptimization: { programmatic: false, skillCacheReuse: false } }),
  }), 'utf8');
  await fs.writeFile(path.join(workspace, 'a.txt'), 'alpha-v1\n第二行\n', 'utf8');
  await fs.writeFile(path.join(workspace, 'b.txt'), 'beta-v1\n', 'utf8');
  await fs.writeFile(path.join(workspace, 'module.mjs'), 'export const records = [{ id: "alpha", cents: 100 }];\n', 'utf8');
  await fs.writeFile(path.join(workspace, 'test.mjs'), [
    "import assert from 'node:assert/strict';", "import fs from 'node:fs';", "import { records } from './module.mjs';",
    "assert.deepEqual(records, [{ id: 'alpha', cents: 100 }]);",
    "fs.writeFileSync('node-result.json', JSON.stringify({ execPath: process.execPath, version: process.version, node: !!process.versions.node, bun: process.versions.bun ?? null }));",
    "console.log('NODE_CONTRACT_OK');", '',
  ].join('\n'), 'utf8');
  rpc = launch();
  await rpc.ready();
  const initial = await state();
  const session = String(initial.sessionFile);
  assert(session && session !== 'undefined');
  assert.equal(hasReadBatch(initial), false, '关闭优化时仍宣告 readBatch');
  assert.equal(await evaluateExpression('typeof readBatch'), 'undefined');
  checks.push('关闭优化时 readBatch 不可见');
  const direct = record(await evaluateExpression('await tool.read({path:"a.txt"})'));
  assert(String(direct.text).includes('alpha-v1'));
  assert(record(direct.details).meta, '原生 read 来源元数据未保留');
  evidence.directRead = direct;
  checks.push('真实 eval 调用原生 read 并返回来源信息');
  const nodeResult = record(await evaluateExpression('await tool.bash({command:"node test.mjs",cwd:"."})'));
  assert(!nodeResult.hasError && String(nodeResult.text).includes('NODE_CONTRACT_OK'), JSON.stringify(nodeResult));
  const node = JSON.parse(await fs.readFile(path.join(workspace, 'node-result.json'), 'utf8')) as Frame;
  assert.equal(node.node, true);
  assert.equal(node.bun, null, '项目测试被 Bun/OMP 当作 Node 执行');
  assert.notEqual(path.resolve(String(node.execPath)), executable);
  assert.equal((await sessionFiles()).length, 1, '项目测试误启动了额外 OMP 会话');
  evidence.node = node;
  checks.push('项目入口通过真实 Node 验证且没有额外 OMP 会话');

  if (!values.baseline) {
    await setProgrammatic(true);
    assert(hasReadBatch(await state()), '启用后未宣告 readBatch');
    assert.equal(await evaluateExpression('typeof readBatch'), 'function');
    assert.deepEqual(await evaluateExpression('await readBatch([])'), []);
    const batch = await evaluate('var batchEvidence = await readBatch(["a.txt", "missing.txt", "b.txt"]);\n' + print('batchEvidence')) as Frame[];
    assert.deepEqual(batch.map(item => item.path), ['a.txt', 'missing.txt', 'b.txt']);
    assert(!batch[0].error && batch[1].error && !batch[2].error, json(batch));
    assert(String(record(batch[0].result).text).includes('alpha-v1'));
    assert(record(record(batch[0].result).details).meta, '批处理丢失原生 read 元数据');
    assert(/\[a\.txt#[A-Fa-f0-9]+\]/.test(String(record(batch[0].result).text)), '批处理丢失文件版本标识');
    evidence.batch = batch;
    await fs.writeFile(path.join(workspace, 'missing.txt'), 'recovered\n', 'utf8');
    const retry = await evaluateExpression('await readBatch(batchEvidence.filter(item => item.error).map(item => item.path))') as Frame[];
    assert.equal(retry.length, 1);
    assert.equal(retry[0].path, 'missing.txt');
    assert(!retry[0].error && String(record(retry[0].result).text).includes('recovered'));
    await fs.writeFile(path.join(workspace, 'a.txt'), 'alpha-v2\n第二行\n', 'utf8');
    const changed = await evaluateExpression('await readBatch(["a.txt"])') as Frame[];
    const previousTag = /\[a\.txt#([^\]]+)\]/.exec(String(record(batch[0].result).text))?.[1];
    const nextTag = /\[a\.txt#([^\]]+)\]/.exec(String(record(changed[0].result).text))?.[1];
    assert(nextTag && nextTag !== previousTag, '文件变化后仍使用旧版本标识');
    checks.push('空批次、逐项错误、仅失败项重试及文件版本更新');

    const invalidPath = baseUrl + '/files/invalid-should-not-run.txt';
    const invalid = record(await evaluate('var invalidError; try { await readBatch([' + JSON.stringify(invalidPath) + ', 42]); } catch (error) { invalidError = String(error); }\n' + print('{error:invalidError}')));
    assert(invalid.error, '非法路径输入未报错');
    assert.equal(readCounts.get('/files/invalid-should-not-run.txt') ?? 0, 0, '路径校验前已开始部分读取');
    const urls = Array.from({ length: 7 }, (_, index) => baseUrl + '/files/slow-' + index + '.txt');
    peakReads = 0;
    const parallel = await evaluateExpression('(await readBatch(' + JSON.stringify(urls) + ')).map(item => ({path:item.path,error:item.error}))') as Frame[];
    assert.equal(parallel.length, urls.length);
    assert(parallel.every(item => !item.error), json(parallel));
    assert(peakReads > 1 && peakReads <= 4, '原生读取并发不在 2–4：' + peakReads);
    for (let index = 0; index < urls.length; index++) assert.equal(readCounts.get('/files/slow-' + index + '.txt'), 1);
    evidence.readConcurrency = peakReads;
    checks.push('开始前完整校验及最多四个原生 read 并发');

    const cancellationUrls = Array.from({ length: 9 }, (_, index) => baseUrl + '/files/cancel-' + index + '.txt');
    const cancellation = rpc.prompt(planned('await readBatch(' + JSON.stringify(cancellationUrls) + ');\n' + print('true')), 60000);
    const deadline = Date.now() + 5000;
    while (![...readCounts.keys()].some(key => key.includes('/cancel-')) && Date.now() < deadline) await pause(20);
    assert([...readCounts.keys()].some(key => key.includes('/cancel-')), '取消合同未启动真实读取');
    await rpc.request('abort');
    const cancelled = await cancellation;
    assert.equal(cancelled.status, 'aborted', JSON.stringify(cancelled));
    await pause(1400);
    const cancelledReads = [...readCounts.entries()].filter(([key]) => key.includes('/cancel-')).reduce((sum, [, count]) => sum + count, 0);
    assert(cancelledReads > 0 && cancelledReads <= 4, '取消后仍启动排队中的读取：' + cancelledReads);
    evidence.cancelledReads = cancelledReads;
    checks.push('真实 RPC 取消通过原生 signal 停止余下读取');

    if (values.python) {
      const python = await evaluate(pythonPrint('await readBatch(["a.txt", "absent-python.txt"])'), 'py') as Frame[];
      assert(!python[0].error && python[1].error, json(python));
      checks.push('Python 同名 readBatch 调用真实原生工具');
    }
    await setProgrammatic(false);
    const disabled = await state();
    assert.equal(hasReadBatch(disabled), false, '关闭后提示未撤回');
    assert.deepEqual(disabled.dumpTools, initial.dumpTools, '关闭后原生工具定义未恢复');
    assert.equal(await evaluateExpression('typeof readBatch'), 'undefined', '已启动的 JS 内核仍暴露 readBatch');
    if (values.python) assert.equal(await evaluate(pythonPrint('"readBatch" in globals()'), 'py'), false);
    await setProgrammatic(true);
    assert.equal(await evaluateExpression('typeof readBatch'), 'function', '重新启用后内核不可调用');
    checks.push('运行中关闭、撤回与重新启用');
  }

  await evaluate('await tool.todo({op:"init",list:[{phase:"读取",items:["核对甲","核对乙"]},{phase:"交付",items:["等待交付"]}]});\n'
    + 'await tool.todo({op:"done",task:"核对甲"});\n' + print('true'));
  const partial = (await state()).todoPhases as { name: string; tasks: { content: string; status: string }[] }[];
  assert.equal(partial[0].tasks[0].status, 'completed');
  assert.notEqual(partial[0].tasks[1].status, 'completed');
  assert.notEqual(partial[1].tasks[0].status, 'completed');
  await evaluate('await tool.todo({op:"done",phase:"读取"});\n' + print('true'));
  const todos = (await state()).todoPhases;
  await rpc.stop();
  rpc = launch(session);
  await rpc.ready();
  assert.deepEqual((await state()).todoPhases, todos, '同 eval 的 TODO 更新未持久化');
  assert.equal((await sessionFiles()).length, 1, '恢复时出现额外会话');
  checks.push('同 eval 顺序 TODO、阶段完成及恢复后状态一致');

  if (!values.baseline) {
    await rpc.stop();
    rpc = launch(session, 'eval,bash,todo');
    await rpc.ready();
    const restrictedState = await state();
    const restrictedHelper = await evaluateExpression('typeof readBatch');
    evidence.restricted = { tools: (restrictedState.dumpTools as Frame[]).map(tool => tool.name), helper: restrictedHelper, advertisesHelper: hasReadBatch(restrictedState) };
    assert.equal(hasReadBatch(restrictedState), false, '缺少 read 工具时仍宣告 readBatch');
    assert.equal(restrictedHelper, 'undefined');
    const unavailable = record(await evaluate('var unavailableError; try { await tool.read({path:"a.txt"}); } catch(error) { unavailableError=String(error); }\n' + print('{error:unavailableError}')));
    assert(unavailable.error, 'eval 绕过了原生工具可用范围');
    checks.push('缺少 read 时撤回 helper，直接桥接仍遵守工具可用范围');
  }
  assert.equal(serverError, undefined);
  evidence.modelRequests = requests.length;
  evidence.offline = { externalModelCalls: 0, providerBaseUrl: baseUrl + '/v1', provider: '本地固定 SSE 响应',
    credentials: '隔离环境仅含 offline-unused 占位值', skills: 0, mcp: 0, extensions: 0,
    evidence: '所有模型步骤均由本地 plans 驱动并记录；工具网络目标仅为本机 HTTP 夹具' };
  await fs.writeFile(path.join(root, 'result.json'), json({ passed: true, target: executable, targetSha256, source: values.source, baseline: values.baseline, python: values.python, checks, evidence }), 'utf8');
  console.log(json({ passed: true, checks, report: path.join(root, 'result.json') }).trim());
} catch (error) {
  await fs.writeFile(path.join(root, 'result.json'), json({ passed: false, target: executable, targetSha256, checks, error: String(error), evidence }), 'utf8');
  throw new Error(String(error) + '\n证据：' + root + '\n' + stderr.slice(-3000));
} finally {
  await rpc?.stop();
  server.stop(true);
  await fs.writeFile(path.join(root, 'model-requests.json'), json({ providerBaseUrl: baseUrl + '/v1', scriptedRequests: requests, unexpectedRequest: serverError ?? null }), 'utf8');
  await fs.writeFile(path.join(root, 'events.json'), json(frames.filter(frame => ['tool_execution_start', 'tool_execution_end', 'prompt_result', 'session_settled'].includes(String(frame.type)))), 'utf8');
  await fs.writeFile(path.join(root, 'stderr.log'), stderr, 'utf8');
}
