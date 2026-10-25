import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const projectRoot = path.resolve(import.meta.dir, '..');
const lockPath = path.join(projectRoot, 'upstream.lock.json');
const lock = await Bun.file(lockPath).json();
const release = await fetch(`https://api.github.com/repos/can1357/oh-my-pi/releases/latest`, {
  headers: { accept: 'application/vnd.github+json', 'user-agent': 'omp-better-desktop-updater' },
});
if (!release.ok) throw new Error(`Read latest OMP release: ${release.status} ${release.statusText}`);
const latest = await release.json() as { tag_name?: string };
const version = latest.tag_name?.replace(/^v/, '');
if (!version || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) throw new Error('Latest OMP release has an invalid version tag.');
if (version === lock.runtimeVersion) {
  console.log(`OMP ${version} is already pinned.`);
  if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, 'changed=false\n', 'utf8');
  process.exit(0);
}

const upstreamRoot = path.resolve(process.env.OMP_UPSTREAM_ROOT ?? path.join(process.env.OMP_DESKTOP_CACHE ?? path.join(projectRoot, '.cache'), 'upstream-release-' + version));
const legacyRoot = path.join(projectRoot, '..', '.references', 'oh-my-pi');
await fs.mkdir(path.dirname(upstreamRoot), { recursive: true });
if (!await Bun.file(path.join(upstreamRoot, '.git', 'HEAD')).exists()) {
  if (await fs.stat(upstreamRoot).then(() => true).catch(() => false)) throw new Error(`Reference target exists but is not a Git checkout: ${upstreamRoot}`);
  const source = await Bun.file(path.join(legacyRoot, '.git', 'HEAD')).exists() ? legacyRoot : lock.repository;
  const clone = Bun.spawn(['git', 'clone', ...(source === legacyRoot ? ['--shared'] : []), '--filter=blob:none', '--no-checkout', source, upstreamRoot], { stdout: 'inherit', stderr: 'inherit' });
  if (await clone.exited !== 0) throw new Error('Create an isolated OMP release checkout failed.');
}
const targetRoot = upstreamRoot;
const fetchProcess = Bun.spawn(['git', 'fetch', '--depth=1', lock.repository, `refs/tags/v${version}`], { cwd: targetRoot, stdout: 'inherit', stderr: 'inherit' });
if (await fetchProcess.exited !== 0) throw new Error(`Fetch OMP release v${version} failed.`);
const checkout = Bun.spawn(['git', 'checkout', '--detach', 'FETCH_HEAD'], { cwd: targetRoot, stdout: 'inherit', stderr: 'inherit' });
if (await checkout.exited !== 0) throw new Error(`Checkout OMP release v${version} failed.`);
const revisionProcess = Bun.spawn(['git', 'rev-parse', 'HEAD'], { cwd: targetRoot, stdout: 'pipe', stderr: 'pipe' });
const revision = (await new Response(revisionProcess.stdout).text()).trim();
if (await revisionProcess.exited !== 0 || !/^[0-9a-f]{40}$/i.test(revision)) throw new Error('Resolve the OMP release commit failed.');
const packageVersion = (await Bun.file(path.join(targetRoot, 'packages/coding-agent/package.json')).json()).version;
if (packageVersion !== version) throw new Error(`Release tag v${version} resolves to package version ${packageVersion}.`);
const output = process.env.GITHUB_OUTPUT;
if (output) await fs.appendFile(output, ['changed=true', 'version=' + version, 'revision=' + revision, 'upstreamRoot<<EOF', targetRoot, 'EOF', ''].join(String.fromCharCode(10)), 'utf8');
console.log(`OMP ${version} at ${revision} is ready for a verified build.`);
