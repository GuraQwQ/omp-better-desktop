import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { openRpc, type Frame } from './token-bench/rpc';

const cacheRoot = path.resolve(import.meta.dir, '../.cache');
await fs.mkdir(cacheRoot, { recursive: true });
const root = await fs.mkdtemp(path.join(cacheRoot, 'token-rpc-check-'));
const fixture = path.join(root, 'mock-omp.mjs');
await fs.writeFile(fixture, `
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
const sticky = process.argv.includes('--sticky');
const grandchild = sticky && process.platform === 'win32' ? spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { windowsHide: true, stdio: 'ignore' }) : undefined;
const emit = frames => process.stdout.write(frames.map(frame => JSON.stringify(frame)).join('\\n') + '\\n');
const lines = createInterface({ input: process.stdin });
process.stderr.write('fixture-stderr\\n');
emit([{ type: 'ready' }]);
lines.on('line', line => {
  const command = JSON.parse(line);
  if (command.type === 'never') return;
  if (command.type === 'exit') process.exit(7);
  if (command.type === 'reject') { emit([{ type: 'response', id: command.id, success: false, error: 'fixture-rejected' }]); return; }
  if (command.type === 'prompt') {
    if (command.message === 'reject') { emit([{ type: 'response', id: command.id, success: false, error: 'fixture-rejected' }]); return; }
    if (command.message === 'never') return;
    const ending = [{ type: 'prompt_result', status: 'completed', sessionSettled: command.message === 'inline-settled' }];
    if (command.message === 'late-settled') {
      emit([{ type: 'response', id: command.id, success: true }, { type: 'agent_start' }, ...ending]);
      setTimeout(() => emit([{ type: 'session_settled' }]), 25);
      return;
    }
    if (command.message === 'no-settled') {
      setTimeout(() => emit([{ type: 'response', id: command.id, success: true }, ...ending]), 250);
      return;
    }
    // 单次 stdout.write 覆盖 ACK 与两个终态在同一数据块的情况。
    emit([{ type: 'response', id: command.id, success: true }, { type: 'agent_start' }, ...ending, ...(command.message === 'inline-settled' ? [] : [{ type: 'session_settled' }])]);
    return;
  }
  if (command.type === 'slow') {
    setTimeout(() => emit([{ type: 'response', id: command.id, success: true, data: 'slow-result' }]), 35);
    return;
  }
  if (command.type === 'fast') {
    emit([{ type: 'response', id: 'unrelated-id', success: true, data: 'wrong-result' }, { type: 'response', id: command.id, success: true, data: 'fast-result' }]);
    return;
  }
  emit([{ type: 'response', id: command.id, success: true, data: { type: command.type, value: command.value, pid: process.pid, grandchildPid: grandchild?.pid } }]);
});
lines.on('close', () => { if (!sticky) process.exit(0); });
if (sticky) setInterval(() => {}, 1000);
`, 'utf8');

function within<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer!));
}

function running(pid: number) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error; }
}

const children: ReturnType<typeof openRpc>[] = [];
const open = (args: string[] = [], executable = process.execPath) => {
  const frames: Frame[] = [];
  const stderr: string[] = [];
  const rpc = openRpc(executable, [fixture, ...args], root, { ...process.env, TEMP: root, TMP: root }, frame => frames.push(frame), text => stderr.push(text));
  children.push(rpc);
  return { rpc, frames, stderr };
};

try {
  const { rpc, frames, stderr } = open();
  await within(rpc.ready(), 3000, 'ready 未到达');
  assert.ok(frames.some(frame => frame.type === 'ready'));
  await within(rpc.ready(), 100, '已收到 ready 后仍继续等待');
  const [slow, fast] = await Promise.all([rpc.request('slow'), rpc.request('fast')]);
  assert.equal(slow.data, 'slow-result');
  assert.equal(fast.data, 'fast-result');
  assert.notEqual(slow.id, fast.id);
  await assert.rejects(rpc.request('reject'), /fixture-rejected/);
  await assert.rejects(rpc.request('never', {}, 30), /超时/);
  await assert.rejects(rpc.wait(frame => frame.type === 'absent', 30), /超时/);
  const reserved = await rpc.request('echo', { id: 'caller-id', type: 'wrong-type', value: 'kept' });
  assert.equal((reserved.data as { type: string }).type, 'echo');
  assert.notEqual(reserved.id, 'caller-id');
  const sibling = open().rpc;
  await within(sibling.ready(), 3000, '并行RPC未ready');
  const [one, two] = await Promise.all([rpc.request('get_state'), sibling.request('get_state')]);
  assert.notEqual((one.data as { pid: number }).pid, (two.data as { pid: number }).pid);
  await sibling.stop();

  for (const message of ['same-chunk', 'inline-settled', 'late-settled']) {
    const result = await within(rpc.prompt(message, 500), 1000, 'prompt 快终态丢失：' + message);
    assert.equal(result.status, 'completed');
  }
  await assert.rejects(rpc.prompt('reject', 500), /fixture-rejected/);
  assert.equal((await within(rpc.prompt('same-chunk', 500), 1000, 'ACK 错误后无法继续 prompt')).status, 'completed');
  await assert.rejects(rpc.prompt('never', 40), /超时/);
  assert.equal((await within(rpc.prompt('same-chunk', 500), 1000, '超时后无法继续 prompt')).status, 'completed');
  const timeoutStarted = performance.now();
  await assert.rejects(rpc.prompt('no-settled', 350), /超时/);
  assert.ok(performance.now() - timeoutStarted < 500, '等待 session_settled 重新启动了完整超时预算');
  assert.ok(stderr.join('').includes('fixture-stderr'));
  const processInfo = (await rpc.request('get_state')).data as { pid: number };
  await within(rpc.stop(), 2000, '正常子进程未关闭');
  assert.equal(running(processInfo.pid), false);
  await assert.rejects(rpc.request('after-close'), /退出|关闭/);
  await assert.rejects(rpc.wait(() => true, 50), /退出|关闭|结束/);

  const exiting = open().rpc;
  await within(exiting.ready(), 3000, '退出夹具未 ready');
  const exitWait = exiting.wait(frame => frame.type === 'unreachable', 2000);
  const exitRequest = exiting.request('exit');
  await Promise.all([assert.rejects(exitRequest, /退出|关闭/), assert.rejects(exitWait, /退出|关闭/)]);
  await assert.rejects(within(exiting.request('after-exit'), 300, 'exit 后请求未及时失败'), /退出|关闭/);
  await within(exiting.stop(), 2000, '已退出子进程关闭挂起');

  const missing = open([], path.join(root, 'missing-omp.exe')).rpc;
  await assert.rejects(within(missing.ready(), 1000, 'spawn 失败未及时通知 ready'), /ENOENT|退出|关闭|启动|spawn/);
  await within(missing.stop(), 2000, 'spawn 失败后 stop 挂起');

  const stubborn = open(['--sticky']).rpc;
  await within(stubborn.ready(), 3000, '强制关闭夹具未 ready');
  const stubbornInfo = (await stubborn.request('get_state')).data as { pid: number; grandchildPid?: number };
  assert.ok(running(stubbornInfo.pid));
  await within(stubborn.stop(), 8000, '忽略 stdin EOF 的子进程无法停止');
  assert.equal(running(stubbornInfo.pid), false);
  if (stubbornInfo.grandchildPid !== undefined) assert.equal(running(stubbornInfo.grandchildPid), false, 'Windows 子进程树未完整停止');
  console.log('Token RPC 检查通过：ready、请求 ID、同块快终态、错误/总超时预算、退出与子进程关闭。');
} finally {
  for (const child of children) await child.stop();
  const resolved = await fs.realpath(root);
  if (path.dirname(resolved) !== await fs.realpath(cacheRoot)) throw new Error('RPC 夹具路径超出测试缓存目录。');
  await fs.rm(resolved, { recursive: true, force: true });
}
