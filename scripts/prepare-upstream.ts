import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export const projectRoot = path.resolve(import.meta.dir, '..');
export const upstreamRoot = path.resolve(projectRoot, '..', '.references', 'oh-my-pi');
export const lock = await Bun.file(path.join(projectRoot, 'upstream.lock.json')).json();

export async function run(args: string[], cwd = upstreamRoot): Promise<string> {
  const process = Bun.spawn(args, { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([
    new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited,
  ]);
  if (code !== 0) throw new Error(`${args.join(' ')}: ${stderr || stdout}`);
  return stdout;
}

export async function prepareUpstream(): Promise<void> {
  try { await fs.access(path.join(upstreamRoot, '.git')); }
  catch {
    await fs.mkdir(path.dirname(upstreamRoot), { recursive: true });
    await run(['git', 'clone', '--filter=blob:none', '--no-checkout', lock.repository, upstreamRoot], projectRoot);
    await run(['git', 'checkout', '--detach', lock.revision]);
  }
  const revision = (await run(['git', 'rev-parse', 'HEAD'])).trim();
  if (revision !== lock.revision) throw new Error(`Reference checkout is at ${revision}; expected ${lock.revision}. Preserve local changes before switching.`);
  const patches = (await fs.readdir(path.join(projectRoot, 'patches'))).filter(name => name.endsWith('.patch')).sort();
  for (const name of patches) {
    const patch = path.join(projectRoot, 'patches', name);
    try { await run(['git', 'apply', '--reverse', '--check', patch]); continue; } catch {}
    await run(['git', 'apply', '--check', patch]);
    await run(['git', 'apply', patch]);
  }
}

if (import.meta.main) {
  await prepareUpstream();
  console.log(`Prepared OMP ${lock.runtimeVersion} at ${lock.revision}`);
}
