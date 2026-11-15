import { readdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const listed = Bun.spawnSync(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ':(glob)scripts/check-*.ts'], { cwd: root, stdout: 'pipe', stderr: 'inherit' });
if (listed.exitCode !== 0) process.exit(listed.exitCode || 1);
const included = new Set(listed.stdout.toString().split('\0').map(name => basename(name)));
const scripts = (await readdir(import.meta.dir))
  .filter(name => /^check-.*\.ts$/.test(name) && name !== basename(import.meta.path) && included.has(name))
  .sort();
for (const script of scripts) {
  console.log(`检查 ${script}`);
  const result = Bun.spawnSync([process.execPath, resolve(import.meta.dir, script), ...(script === 'check-build-scope.ts' ? ['--self-test'] : [])], {
    cwd: root, stdout: 'inherit', stderr: 'inherit',
  });
  if (result.exitCode !== 0) { process.exitCode = result.exitCode || 1; break; }
}
