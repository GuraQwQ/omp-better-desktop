import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { lock, prepareUpstream, projectRoot, run } from './prepare-upstream';

const cacheRoot = path.resolve(process.env.OMP_DESKTOP_CACHE ?? path.join(projectRoot, '.cache'));
if (process.platform === 'win32' && /^[cC]:[\\/]/.test(cacheRoot)) throw new Error('Choose a non-C: cache directory.');
const tempRoot = path.join(cacheRoot, 'tmp');
const cargoHome = path.resolve(process.env.CARGO_HOME ?? path.join(cacheRoot, 'cargo'));
if (process.platform === 'win32' && /^[cC]:[\/]/.test(cargoHome)) throw new Error('Choose a non-C: Cargo directory.');
const rustupHome = process.env.RUSTUP_HOME;
const cargoBin = path.join(cargoHome, 'bin');
const bunExecutable = process.env.BUN_EXECUTABLE ?? process.execPath;
const bunEnv = { ...process.env, BUN_EXECUTABLE: bunExecutable };
const bunVersion = (await run(['bun', '--version'], projectRoot, bunEnv)).trim();
const [bunMajor, bunMinor] = bunVersion.split('.').map(Number);
if (bunMajor < 1 || (bunMajor === 1 && bunMinor < 4)) throw new Error(`OMP release builds require Bun 1.4 or newer; found ${bunVersion}.`);
const vswhere = process.env.VSWHERE ?? 'C:/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe';
const visualStudioRoot = process.env.VS_INSTALL_ROOT ?? (process.env.MSVC_ROOT ? '' : (await run([vswhere, '-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], projectRoot)).trim());
if (!process.env.MSVC_ROOT && !visualStudioRoot) throw new Error('Install Visual Studio C++ Build Tools or set MSVC_ROOT.');
const msvcVersions = process.env.MSVC_ROOT ? [] : await fs.readdir(path.join(visualStudioRoot, 'VC/Tools/MSVC'));
const msvcRoot = path.resolve(process.env.MSVC_ROOT ?? path.join(visualStudioRoot, 'VC/Tools/MSVC', msvcVersions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0]));
const sdkRoot = process.env.WINDOWS_SDK_ROOT ?? 'C:/Program Files (x86)/Windows Kits/10';
const sdkVersions = await fs.readdir(path.join(sdkRoot, 'Include'));
const sdkVersion = process.env.WINDOWS_SDK_VERSION ?? sdkVersions.filter(version => /^10\.0\.\d+\.\d+$/.test(version)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
const msvcLinker = path.join(msvcRoot, 'bin/Hostx64/x64/link.exe');
const sdkInclude = path.join(sdkRoot, 'Include', sdkVersion);
const sdkLibrary = path.join(sdkRoot, 'Lib', sdkVersion);
for (const file of [msvcLinker, path.join(sdkInclude, 'um/Windows.h'), path.join(sdkLibrary, 'um/x64/kernel32.lib')]) {
  if (process.platform === 'win32' && !await Bun.file(file).exists()) throw new Error('Required Windows build input is missing: ' + file);
}
await fs.mkdir(tempRoot, { recursive: true });
process.env.BUN_INSTALL_CACHE_DIR = path.join(cacheRoot, 'bun');
process.env.CARGO_HOME = cargoHome;
process.env.TEMP = tempRoot;
process.env.TMP = tempRoot;

const artifactsRoot = path.join(projectRoot, 'artifacts');
await fs.mkdir(artifactsRoot, { recursive: true });
const stageRoot = await fs.mkdtemp(path.join(artifactsRoot, '.staging-runtime-'));
const buildRoot = process.env.OMP_BUILD_ROOT
  ? path.resolve(process.env.OMP_BUILD_ROOT)
  : await fs.mkdtemp(path.join(cacheRoot, 'omp-upstream-' + lock.runtimeVersion + '-'));
const removeBuildRoot = process.env.OMP_BUILD_ROOT === undefined;
const scratchRoot = await fs.mkdtemp(path.join(cacheRoot, 'omp-desktop-build-'));
await fs.mkdir(scratchRoot, { recursive: true });
const generatedRoot = path.join(stageRoot, 'generated');
const buildTemp = path.join(scratchRoot, 'temp');
await fs.mkdir(buildTemp, { recursive: true });
const env = {
  ...process.env,
  BUN_EXECUTABLE: bunExecutable,
  CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR ?? path.join(projectRoot, 'build/desktop-msvc'),
  CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER: msvcLinker,
  INCLUDE: [path.join(msvcRoot, 'include'), path.join(sdkInclude, 'ucrt'), path.join(sdkInclude, 'shared'), path.join(sdkInclude, 'um'), path.join(sdkInclude, 'winrt'), path.join(sdkInclude, 'cppwinrt')].join(path.delimiter),
  LIB: [path.join(msvcRoot, 'lib/x64'), path.join(sdkLibrary, 'ucrt/x64'), path.join(sdkLibrary, 'um/x64')].join(path.delimiter),
  OMP_DESKTOP_CACHE: cacheRoot,
  OMP_DESKTOP_OUTPUT_ROOT: path.join(scratchRoot, 'runtime'),
  OMP_DESKTOP_STAGING_ROOT: generatedRoot,
  OMP_UPSTREAM_ROOT: buildRoot,
  OMP_UPSTREAM_VERSION: lock.runtimeVersion,
  OMP_UPSTREAM_REVISION: lock.revision,
  ...(rustupHome ? { RUSTUP_HOME: rustupHome } : {}),
  RUSTUP_TOOLCHAIN: 'stable-x86_64-pc-windows-msvc',
  PATH: [path.dirname(bunExecutable), path.join(msvcRoot, 'bin/Hostx64/x64'), cargoBin, process.env.PATH ?? ''].join(path.delimiter),
  BUN_INSTALL_CACHE_DIR: path.join(cacheRoot, 'bun'),
  TAURI_BUNDLER_CACHE_DIR: path.join(cacheRoot, 'tauri'),
  TEMP: buildTemp,
  TMP: buildTemp,
};
const installed: { target: string; backup?: string; directory: boolean }[] = [];
const lockPath = path.join(projectRoot, 'upstream.lock.json');
const beforeBuild = await Promise.all(['upstream.lock.json', 'docs/feature-map.md', 'patches/0001-desktop-runtime.patch'].map(file => Bun.file(path.join(projectRoot, file)).bytes()));

async function renameWithRetry(source: string, target: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try { await fs.rename(source, target); return; }
    catch (error) {
      if (process.platform !== 'win32' || !['EPERM', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '') || attempt >= 6) throw error;
      console.warn(`Windows 文件暂被占用，重试重命名 ${path.basename(source)}（${attempt + 1}/6）`);
      await new Promise(resolve => setTimeout(resolve, 100 * 2 ** attempt));
    }
  }
}

async function install(staged: string, target: string, directory = false): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  let backup: string | undefined;
  try {
    await fs.access(target);
    backup = path.join(stageRoot, 'rollback-' + installed.length);
    await renameWithRetry(target, backup);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  try {
    await renameWithRetry(staged, target);
    installed.push({ target, backup, directory });
  } catch (error) {
    if (backup) await renameWithRetry(backup, target);
    throw error;
  }
}

async function rollback(): Promise<void> {
  for (const item of installed.reverse()) {
    await fs.rm(item.target, { recursive: item.directory, force: true });
    if (item.backup) await renameWithRetry(item.backup, item.target);
  }
}

try {
  console.log('Checking out locked OMP source ' + lock.revision + '...');
  const sourceRoot = process.env.OMP_SOURCE_ROOT ?? process.env.OMP_UPSTREAM_ROOT ?? lock.repository;
  await prepareUpstream(buildRoot, sourceRoot, projectRoot);
  console.log('Installing pinned OMP build dependencies...');
  await run(['bun', 'install', '--ignore-scripts', '--frozen-lockfile'], buildRoot, env);
  await run(['bun', 'run', 'gen:rpc'], buildRoot, env);

  const nativeCache = path.join(cacheRoot, `natives-${lock.runtimeVersion}-win32-x64`);
  await fs.mkdir(nativeCache, { recursive: true });
  if (!await Bun.file(path.join(nativeCache, 'package.json')).exists()) await Bun.write(path.join(nativeCache, 'package.json'), '{"name":"omp-desktop-native-build","private":true}\n');
  const nativePackage = path.join(nativeCache, 'node_modules/@oh-my-pi/pi-natives-win32-x64');
  const nativeManifest = await Bun.file(path.join(nativePackage, 'package.json')).json().catch(() => null) as { version?: string } | null;
  if (nativeManifest?.version !== lock.runtimeVersion) await run(['bun', 'add', '--ignore-scripts', '--registry=https://registry.npmjs.org', '@oh-my-pi/pi-natives-win32-x64@' + lock.runtimeVersion], nativeCache, env);
  const verifiedNativeManifest = await Bun.file(path.join(nativePackage, 'package.json')).json() as { version?: string };
  if (verifiedNativeManifest.version !== lock.runtimeVersion) throw new Error('OMP native addon version does not match the runtime.');
  const nativeFiles = (await fs.readdir(nativePackage)).filter(name => name.endsWith('.node'));
  if (!nativeFiles.length) throw new Error('OMP native package has no Windows binary.');
  const nativeDestination = path.join(buildRoot, 'packages/natives/native');
  await fs.mkdir(nativeDestination, { recursive: true });
  for (const name of nativeFiles) await fs.copyFile(path.join(nativePackage, name), path.join(nativeDestination, name));

  console.log('Building the OMP executable...');
  await run(['bun', 'scripts/ci-release-build-binaries.ts', '--targets', 'win32-x64'], buildRoot, env);
  await run(['bun', path.join(projectRoot, 'scripts/package-runtime.ts')], projectRoot, env);
  const runtimePackage = path.join(scratchRoot, 'runtime', 'runtime-windows-x64');
  const manifest = await Bun.file(path.join(runtimePackage, 'runtime-manifest.json')).json() as { version: string; revision: string; files: { path: string; sha256: string }[] };
  if (manifest.version !== lock.runtimeVersion || manifest.revision !== lock.revision) throw new Error('Packaged OMP version does not match the locked source.');
  for (const file of manifest.files) {
    const actual = createHash('sha256').update(await Bun.file(path.join(runtimePackage, file.path)).bytes()).digest('hex');
    if (actual !== file.sha256) throw new Error('Runtime checksum mismatch: ' + file.path);
  }
  await run(['bun', path.join(projectRoot, 'scripts/smoke-runtime.ts'), path.join(runtimePackage, 'omp.exe')], projectRoot, env);
  await run(['bun', path.join(projectRoot, 'scripts/generate-catalog.ts')], projectRoot, env);
  for (const file of ['client.rs', 'wire.rs']) await fs.copyFile(path.join(buildRoot, 'sdk/rust/omp-rpc/src', file), path.join(generatedRoot, file));
  const localClient = await Bun.file(path.join(buildRoot, 'sdk/rust/omp-rpc/src/client.rs')).text();
  if (!localClient.includes('pub fn call_raw(')) throw new Error('The desktop RPC raw-call adapter patch did not apply.');
  await Bun.write(path.join(generatedRoot, 'client.rs'), localClient);
  const wire = await Bun.file(path.join(generatedRoot, 'wire.rs')).text();
  if (!wire.includes('pub secret: Option<bool>')) throw new Error('Generated RPC contract omitted the desktop input secret field.');
  await Bun.write(path.join(generatedRoot, 'upstream.lock.json'), JSON.stringify({ ...lock, runtimeVersion: manifest.version, revision: manifest.revision }, null, 2) + '\n');

  const files: [string, string][] = [
    ['src/generated/catalog.json', 'src/generated/catalog.json'],
    ['src/generated/rpc-wire.schema.json', 'src/generated/rpc-wire.schema.json'],
    ['src/generated/rpc-wire.ts', 'src/generated/rpc-wire.ts'],
    ['docs/feature-map.md', 'docs/feature-map.md'],
    ['client.rs', 'vendor/omp-rpc/src/client.rs'],
    ['wire.rs', 'vendor/omp-rpc/src/wire.rs'],
  ];
  for (const [source, target] of files) {
    const staged = path.join(generatedRoot, source);
    const destination = path.join(projectRoot, target);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await install(staged, destination);
  }
  await install(runtimePackage, path.join(artifactsRoot, 'runtime-windows-x64'), true);
  await install(path.join(generatedRoot, 'upstream.lock.json'), lockPath);
  await run(['cargo', 'check', '--manifest-path', path.join(projectRoot, 'src-tauri/Cargo.toml')], projectRoot, env);
  await run(['bun', 'run', 'check'], projectRoot, env);
  if (process.argv.includes('--bundle-desktop')) await run([bunExecutable, 'run', 'desktop', 'build', '--bundles', 'nsis'], projectRoot, env);
  console.log('OMP ' + manifest.version + ' built, RPC-smoke tested, and synchronized.');
} catch (error) {
  await rollback();
  for (const [index, file] of ['upstream.lock.json', 'docs/feature-map.md', 'patches/0001-desktop-runtime.patch'].entries()) {
    const target = path.join(projectRoot, file);
    const original = beforeBuild[index];
    if (!Buffer.from(await Bun.file(target).bytes()).equals(Buffer.from(original))) await Bun.write(target, original);
  }
  throw error;
} finally {
  if (removeBuildRoot) {
    await fs.rm(buildRoot, { recursive: true, force: true });
  }
  await fs.rm(scratchRoot, { recursive: true, force: true });
  await fs.rm(stageRoot, { recursive: true, force: true });
}
