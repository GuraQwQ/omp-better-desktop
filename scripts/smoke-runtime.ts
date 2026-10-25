import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const executable = path.resolve(process.argv[2] ?? 'artifacts/runtime-windows-x64/omp.exe');
const tempRoot = path.resolve(process.env.OMP_DESKTOP_CACHE ?? path.join(import.meta.dir, '..', '.cache'));
if (process.platform === 'win32' && /^[cC]:[\/]/.test(tempRoot)) throw new Error('Choose a non-C: smoke-test directory.');
await fs.mkdir(tempRoot, { recursive: true });
const root = await fs.mkdtemp(path.join(tempRoot, 'omp-desktop-smoke-'));
const child = spawn(executable, ['--mode', 'rpc-ui', '--no-session', '--no-extensions', '--no-skills', '--model', 'openai-codex/gpt-5.6-luna'], {
  cwd: root,
  env: { ...process.env, OMP_USER_ROOT: root, PI_NO_PTY: '1', PI_NOTIFICATIONS: 'off' },
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
  console.log('OMP RPC ready, protocol v2 negotiated, get_state passed.');
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
