import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { lock, prepareUpstream, projectRoot, upstreamRoot, run } from './prepare-upstream';
import { packageRuntime } from './package-runtime';

await prepareUpstream();
const cacheRoot = process.env.OMP_DESKTOP_CACHE ?? 'F:/omp-better-desktop/cache';
if (process.platform === 'win32' && /^[cC]:[\\/]/.test(cacheRoot)) throw new Error('Choose a non-C: cache directory.');
process.env.BUN_INSTALL_CACHE_DIR = path.join(cacheRoot, 'bun');
process.env.TEMP = path.join(cacheRoot, 'tmp');
process.env.TMP = process.env.TEMP;
await fs.mkdir(process.env.TEMP, { recursive: true });

console.log('Installing locked upstream build dependencies...');
await run(['bun', 'install', '--ignore-scripts', '--frozen-lockfile']);
console.log('Building runtime and generated wire contracts...');
await run(['bun', 'run', 'gen:rpc']);
await run(['bun', path.join(projectRoot, 'scripts', 'generate-catalog.ts')], projectRoot);
const nativeCache = path.join(cacheRoot, `natives-${lock.runtimeVersion}-win32-x64`);
await fs.mkdir(nativeCache, { recursive: true });
if (!await Bun.file(path.join(nativeCache, 'package.json')).exists()) {
  await Bun.write(path.join(nativeCache, 'package.json'), '{"name":"omp-desktop-native-build","private":true}\n');
}
await run(['bun', 'add', '--ignore-scripts', '--registry=https://registry.npmjs.org', `@oh-my-pi/pi-natives-win32-x64@${lock.runtimeVersion}`], nativeCache);
const nativePackage = path.join(nativeCache, 'node_modules/@oh-my-pi/pi-natives-win32-x64');
for (const name of await fs.readdir(nativePackage)) {
  if (name.endsWith('.node')) await fs.copyFile(path.join(nativePackage, name), path.join(upstreamRoot, 'packages/natives/native', name));
}
process.env.CROSS_TARGET = 'windows-x64';
await run(['bun', 'packages/coding-agent/scripts/build-binary.ts']);
console.log(`Runtime package: ${await packageRuntime()}`);
