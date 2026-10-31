import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import assert from 'node:assert/strict';

const executable = path.resolve(process.argv[2] ?? 'artifacts/runtime-windows-x64/omp.exe');
const tempRoot = path.resolve(process.env.OMP_DESKTOP_CACHE ?? path.join(import.meta.dir, '..', '.cache'));
if (process.platform === 'win32' && /^[cC]:[\/]/.test(tempRoot)) throw new Error('Choose a non-C: smoke-test directory.');
await fs.mkdir(tempRoot, { recursive: true });
const root = await fs.mkdtemp(path.join(tempRoot, 'omp-desktop-smoke-'));
await fs.mkdir(path.join(root, 'agent'), { recursive: true });
await fs.writeFile(path.join(root, 'agent/models.yml'), JSON.stringify({ providers: {
  'desktop-smoke': { api: 'openai-completions', apiKey: 'local-fixture-unused', baseUrl: 'http://127.0.0.1:9/v1', models: [{ id: 'fixture-model' }] },
} }));
const child = spawn(executable, ['--mode', 'rpc-ui', '--no-session', '--no-extensions', '--no-skills'], {
  cwd: root,
  env: { ...process.env, OMP_USER_ROOT: root, OMP_DESKTOP_MANAGED_RESOURCES: '1', PI_NO_PTY: '1', PI_NOTIFICATIONS: 'off' },
  stdio: ['pipe', 'pipe', 'pipe'],
});
const timeout = setTimeout(() => child.kill(), 60_000);
const spawnError = new Promise<Error>(resolve => child.once('error', resolve));
const lines = createInterface({ input: child.stdout });
const stderr: string[] = [];
child.stderr.on('data', chunk => { stderr.push(chunk.toString()); });
const frames = (async function* () {
  for await (const line of lines) {
    try { yield JSON.parse(line); } catch {}
  }
})();
const nextFrame = async () => {
  const result = await Promise.race([frames.next(), spawnError.then(error => { throw error; })]);
  if (result.done) throw new Error(`OMP exited before completing RPC smoke: ${stderr.join('').slice(-2000)}`);
  return result.value;
};
const request = async (id: string, type: string, params = {}) => {
  child.stdin.write(`${JSON.stringify({ id, type, ...params })}\n`);
  while (true) {
    const frame = await nextFrame();
    if (frame.type === 'response' && frame.id === id) {
      if (!frame.success) throw new Error(`OMP ${type} failed: ${JSON.stringify(frame.error)}`);
      return frame.data;
    }
  }
};

try {
  while ((await nextFrame()).type !== 'ready') {}
  await request('smoke-negotiate', 'negotiate_protocol', { protocolVersion: 2 });
  await request('smoke-state', 'get_state');
  const rate = await request('smoke-token-rate', 'get_token_rate');
  assert.deepEqual(rate, { tokensPerSecond: null }, '空会话的原生生成速率应为空，且不附带完整状态');
  const providers = await request('smoke-login-providers', 'get_login_providers');
  assert(Array.isArray(providers.providers), 'OMP 未返回登录提供商目录');
  const settings = await request('smoke-desktop-settings', 'desktop_settings', { operation: 'list' });
  assert(Array.isArray(settings.settings), 'OMP 未返回桌面设置目录');
  let sequence = 0;
  const manage = (resource: string, action: string, args = {}) => request(`manage-${sequence++}`, 'desktop_manage', { resource, action, args });
  assert.deepEqual((await manage('skills', 'list')).items, [], '隔离测试不得载入本机技能');
  assert.deepEqual((await manage('mcp', 'list')).items, [], '隔离测试不得载入本机 MCP');
  for (const resource of ['models', 'mcp', 'skills', 'plugins', 'marketplaces', 'agents', 'ssh']) {
    assert(Array.isArray((await manage(resource, 'list')).items), `OMP 未返回 ${resource} 管理目录`);
  }
  for (const kind of ['hooks', 'commands', 'templates', 'memory']) {
    assert(Array.isArray((await manage('resources', 'list', { kind })).items), `OMP 未返回 ${kind} 来源目录`);
  }
  await manage('ssh', 'create', { name: 'desktop-smoke', scope: 'user', host: { host: '127.0.0.1', port: 2222 } });
  assert((await manage('ssh', 'list')).items.some((item: any) => item.name === 'desktop-smoke' && item.port === 2222));
  await manage('ssh', 'delete', { id: 'desktop-smoke', scope: 'user' });
  await manage('ssh', 'delete', { id: 'desktop-smoke', scope: 'user' });
  assert(!(await manage('ssh', 'list')).items.some((item: any) => item.name === 'desktop-smoke'));
  await manage('skills', 'create', { name: 'desktop-smoke', description: '桌面配置验证', body: '只验证本地配置写入。' });
  const skill = (await manage('skills', 'list')).items.find((item: any) => item.name === 'desktop-smoke');
  assert(skill?.managed, '创建的技能应由 OMP 托管');
  await manage('skills', 'update', { name: 'desktop-smoke', description: '更新后的说明', body: '更新后的正文。' });
  assert((await manage('skills', 'detail', { id: skill.id })).item.body.includes('更新后的正文'));
  await manage('skills', 'delete', { id: skill.id });
  assert(!(await manage('skills', 'list')).items.some((item: any) => item.name === 'desktop-smoke'));
  const roles = await manage('models', 'list');
  const candidate = roles.models.find((model: any) => model.provider === 'desktop-smoke');
  assert(candidate, '本地模型夹具未被运行时加载');
  await request('smoke-role-storage', 'desktop_settings', { operation: 'set', key: 'modelRoleStorage', value: 'project' });
  await manage('models', 'set', { role: 'plan', modelId: candidate.value });
  assert((await manage('models', 'list')).items.find((item: any) => item.id === 'plan').source === 'project');
  await manage('models', 'set', { role: 'plan', modelId: null });
  console.log('OMP RPC 协议、设置与全部管理目录、SSH/技能持久化和项目模型角色检查通过（未调用模型）。');
} finally {
  clearTimeout(timeout);
  lines.close();
  if (child.exitCode === null && child.signalCode === null) {
    const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
    child.kill();
    await exited;
  }
  await fs.rm(root, { recursive: true, force: true });
}
