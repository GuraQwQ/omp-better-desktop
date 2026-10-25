import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export const projectRoot = path.resolve(import.meta.dir, '..');
const pinnedLock = await Bun.file(path.join(projectRoot, 'upstream.lock.json')).json();
export const lock = {
  ...pinnedLock,
  runtimeVersion: process.env.OMP_UPSTREAM_VERSION ?? pinnedLock.runtimeVersion,
  revision: process.env.OMP_UPSTREAM_REVISION ?? pinnedLock.revision,
};
const refs = path.resolve(projectRoot, '..', '.references');
const versioned = path.join(refs, 'oh-my-pi-' + lock.runtimeVersion);
const pinned = path.join(refs, 'oh-my-pi');
export const upstreamRoot = process.env.OMP_UPSTREAM_ROOT
  ? path.resolve(process.env.OMP_UPSTREAM_ROOT)
  : await Bun.file(path.join(versioned, '.git', 'HEAD')).exists() ? versioned : pinned;

export async function run(args: string[], cwd = upstreamRoot, env?: NodeJS.ProcessEnv): Promise<string> {
  const command = args[0] === 'bun' ? [env?.BUN_EXECUTABLE ?? process.env.BUN_EXECUTABLE ?? process.execPath, ...args.slice(1)] : args;
  const child = Bun.spawn(command, { cwd, env, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ]);
  if (code !== 0) throw new Error(`${args.join(' ')}: ${stderr || stdout}`);
  return stdout;
}

export async function prepareUpstream(root = upstreamRoot, sourceRoot = root === upstreamRoot ? lock.repository : upstreamRoot, outputRoot = projectRoot): Promise<void> {
  try { await fs.access(path.join(root, '.git')); }
  catch {
    await fs.mkdir(path.dirname(root), { recursive: true });
    await run(['git', 'clone', ...(/^(https?|ssh):|^git@/.test(sourceRoot) ? [] : ['--shared']), '--filter=blob:none', '--no-checkout', sourceRoot, root], projectRoot);
    await run(['git', 'checkout', '--detach', lock.revision], root);
  }
  const revision = (await run(['git', 'rev-parse', 'HEAD'], root)).trim();
  if (revision !== lock.revision) throw new Error(`Reference checkout is at ${revision}; expected ${lock.revision}. Preserve local changes before switching.`);
  const patches = (await fs.readdir(path.join(outputRoot, 'patches'))).filter(name => name.endsWith('.patch')).sort();
  if (!patches.length) return;
  await fs.mkdir(path.join(projectRoot, '.cache'), { recursive: true });
  const parent = await fs.realpath(path.join(projectRoot, '.cache'));
  const temporary = await fs.mkdtemp(path.join(parent, 'upstream-patches-'));
  const git = (args: string[], index = 'expected') => run(['git', ...args], root, { ...process.env, GIT_INDEX_FILE: path.join(temporary, index) });
  const splitPaths = (value: string) => value.split('\0').filter(Boolean);
  const patchArgs = (name: string) => [path.resolve(outputRoot, 'patches', name), ...(name.includes('rpc-raw-call') ? ['--ignore-space-change'] : [])];
  try {
    // 后续补丁可能覆盖前序补丁；按整套补丁的前缀树识别进度，不逐份反向试应用。
    await git(['read-tree', 'HEAD']);
    const trees = [(await git(['write-tree'])).trim()];
    const paths = new Set<string>();
    for (const name of patches) {
      await git(['apply', '--cached', ...patchArgs(name)]);
      trees.push((await git(['write-tree'])).trim());
      for (const file of splitPaths(await git(['diff', '--cached', '--name-only', '--no-renames', '-z', 'HEAD', '--']))) paths.add(file);
    }
    await git(['read-tree', 'HEAD'], 'observed');
    const tracked = new Set(splitPaths(await git(['ls-files', '-z'], 'observed')));
    const present = [];
    for (const file of paths) {
      if (tracked.has(file) || await fs.lstat(path.join(root, file)).then(() => true, error => {
        if (error.code === 'ENOENT') return false;
        throw error;
      })) present.push(file);
    }
    if (present.length) await git(['--literal-pathspecs', 'add', '-f', '-A', '--', ...present], 'observed');
    const current = (await git(['write-tree'], 'observed')).trim();
    const applied = trees.lastIndexOf(current);
    if (applied < 0) {
      const differences = await Promise.all(trees.map(tree => git(['diff-tree', '--name-only', '--no-renames', '-r', '-z', tree, current]).then(splitPaths)));
      const conflicts = differences.reduce((best, files) => files.length < best.length ? files : best);
      throw new Error(`Patch-related local changes do not match an applied prefix. Preserve these files before retrying: ${conflicts.join(', ')}`);
    }
    for (const name of patches.slice(applied)) {
      await run(['git', 'apply', '--check', ...patchArgs(name)], root);
      await run(['git', 'apply', ...patchArgs(name)], root);
    }
  } finally {
    const directory = await fs.realpath(temporary);
    if (path.dirname(directory) !== parent) throw new Error(`Temporary patch index escaped its cache directory: ${directory}`);
    await fs.rm(directory, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  await prepareUpstream();
  console.log(`Prepared OMP ${lock.runtimeVersion} at ${lock.revision}`);
}
