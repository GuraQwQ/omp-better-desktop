import { readdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const scripts = (await readdir(import.meta.dir))
  .filter(name => /^check-.*\.ts$/.test(name) && name !== basename(import.meta.path))
  .sort();
for (const script of scripts) {
  console.log(`检查 ${script}`);
  const result = Bun.spawnSync([process.execPath, resolve(import.meta.dir, script), ...(script === 'check-build-scope.ts' ? ['--self-test'] : [])], {
    cwd: resolve(import.meta.dir, '..'), stdout: 'inherit', stderr: 'inherit',
  });
  if (result.exitCode !== 0) { process.exitCode = result.exitCode || 1; break; }
}
