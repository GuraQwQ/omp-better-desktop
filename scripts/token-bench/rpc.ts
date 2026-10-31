import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export type Frame = Record<string, unknown>;

/** 基准只驱动真实 stdio RPC，不替代理执行工具或作答。 */
export function openRpc(executable: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, onFrame: (frame: Frame) => void, onStderr: (text: string) => void) {
  const child = spawn(executable, args, { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout });
  const pending = new Map<string, { resolve: (frame: Frame) => void; reject: (error: Error) => void }>();
  const listeners = new Set<(frame: Frame) => void>();
  let sequence = 0;
  let exited = false;
  let readySeen = false;
  let sessionSettledSeen = false;
  let terminalError: Error | undefined;
  const exit = new Promise<void>(resolve => child.once('close', () => { exited = true; resolve(); }));
  const rejectPending = (error: Error) => { for (const entry of pending.values()) entry.reject(error); pending.clear(); };
  child.once('error', error => { terminalError = error; rejectPending(error); });
  child.stdin.on('error', error => { terminalError = error; rejectPending(error); });
  child.once('exit', (code, signal) => { exited = true; terminalError ??= new Error('OMP 已退出：' + (signal ?? code)); rejectPending(terminalError); });
  child.stderr.on('data', chunk => onStderr(chunk.toString()));
  lines.on('line', line => {
    let frame: Frame;
    try { frame = JSON.parse(line); } catch { return; }
    if (frame.type === 'ready') readySeen = true;
    if (frame.type === 'agent_start') sessionSettledSeen = false;
    if (frame.type === 'session_settled') sessionSettledSeen = true;
    onFrame(frame);
    if (frame.type === 'response' && typeof frame.id === 'string') {
      const entry = pending.get(frame.id);
      if (entry) {
        pending.delete(frame.id);
        if (frame.success === false) entry.reject(new Error(JSON.stringify(frame.error ?? frame)));
        else entry.resolve(frame);
      }
    }
    for (const listener of listeners) listener(frame);
  });
  const request = async (type: string, params: Frame = {}, timeoutMs = 30_000): Promise<Frame> => {
    if (terminalError) throw terminalError;
    if (exited) throw new Error('OMP 已退出');
    const id = 'bench-' + ++sequence;
    let timer: ReturnType<typeof setTimeout>;
    const result = new Promise<Frame>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      timer = setTimeout(() => { pending.delete(id); reject(new Error('RPC 超时：' + type)); }, timeoutMs);
      child.stdin.write(JSON.stringify({ ...params, id, type }) + '\n');
    });
    try { return await result; } finally { clearTimeout(timer!); }
  };
  const wait = (predicate: (frame: Frame) => boolean, timeoutMs: number, signal?: AbortSignal): Promise<Frame> => new Promise((resolve, reject) => {
    if (terminalError || exited || signal?.aborted) { reject(terminalError ?? new Error('等待 OMP 事件已结束')); return; }
    const done = () => { clearTimeout(timer); listeners.delete(listener); child.off('close', stopped); child.off('error', failed); child.stdin.off('error', failed); signal?.removeEventListener('abort', cancelled); };
    const listener = (frame: Frame) => { if (predicate(frame)) { done(); resolve(frame); } };
    const stopped = () => { done(); reject(new Error('OMP 在预期事件前退出')); };
    const failed = (error: Error) => { done(); reject(error); };
    const cancelled = () => { done(); reject(new Error('等待 OMP 事件已取消')); };
    const timer = setTimeout(() => { done(); reject(new Error('等待 OMP 事件超时')); }, timeoutMs);
    listeners.add(listener);
    child.once('close', stopped);
    child.once('error', failed);
    child.stdin.once('error', failed);
    signal?.addEventListener('abort', cancelled, { once: true });
  });
  return {
    pid: child.pid,
    request,
    wait,
    ready: async () => { if (!readySeen) await wait(frame => frame.type === 'ready', 60_000); },
    async prompt(message: string, timeoutMs: number): Promise<Frame> {
      sessionSettledSeen = false;
      const controller = new AbortController();
      const deadline = Date.now() + timeoutMs;
      const settled = wait(frame => frame.type === 'prompt_result', timeoutMs, controller.signal);
      // prompt 的 ACK 与终态可能并发到达；先订阅终态，避免漏掉快速结束的任务。
      const ack = request('prompt', { message }, timeoutMs);
      try {
        const [result] = await Promise.all([settled, ack]);
        if (result.sessionSettled !== true && !sessionSettledSeen) await wait(frame => frame.type === 'session_settled', Math.max(1, deadline - Date.now()), controller.signal);
        return result;
      } finally { controller.abort(); }
    },
    async stop() {
      if (!exited) {
        child.stdin.end();
        let timer: ReturnType<typeof setTimeout>;
        try { await Promise.race([exit, new Promise(resolve => { timer = setTimeout(resolve, 5_000); })]); }
        finally { clearTimeout(timer!); }
      }
      if (!exited && child.pid) {
        if (process.platform === 'win32') {
          const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
          await new Promise<void>(resolve => { killer.once('exit', () => resolve()); killer.once('error', () => resolve()); });
        } else child.kill('SIGKILL');
        await exit;
      }
      lines.close();
    },
  };
}
