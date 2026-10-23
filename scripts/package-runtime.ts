import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { lock, projectRoot, upstreamRoot } from './prepare-upstream';

export async function packageRuntime(): Promise<string> {
  const output = path.resolve(process.env.OMP_DESKTOP_ARTIFACTS ?? path.join(projectRoot, 'artifacts'), 'runtime-windows-x64');
  await fs.mkdir(output, { recursive: true });
  const executable = 'omp.exe';
  await fs.copyFile(path.join(upstreamRoot, 'packages/coding-agent/dist/omp-windows-x64.exe'), path.join(output, executable));
  await fs.copyFile(path.join(upstreamRoot, 'LICENSE'), path.join(output, 'LICENSE.omp'));
  await fs.copyFile(path.join(upstreamRoot, 'THIRD-PARTY-NOTICES.txt'), path.join(output, 'THIRD-PARTY-NOTICES.txt'));
  const files = [];
  for (const name of [executable, 'LICENSE.omp', 'THIRD-PARTY-NOTICES.txt']) {
    const data = await Bun.file(path.join(output, name)).bytes();
    files.push({ path: name, sha256: createHash('sha256').update(data).digest('hex') });
  }
  const patchHash = createHash('sha256');
  for (const name of (await fs.readdir(path.join(projectRoot, 'patches'))).filter(name => name.endsWith('.patch')).sort()) {
    patchHash.update(name).update('\0').update(await Bun.file(path.join(projectRoot, 'patches', name)).bytes());
  }
  await Bun.write(path.join(output, 'runtime-manifest.json'), JSON.stringify({
    version: lock.runtimeVersion, revision: lock.revision, protocolVersion: lock.protocolVersion,
    patchDigest: patchHash.digest('hex'), executable, files,
  }, null, 2) + '\n');
  return output;
}

if (import.meta.main) console.log(`Runtime package: ${await packageRuntime()}`);
