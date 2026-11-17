import * as fs from 'node:fs/promises';
import path from 'node:path';

const plugins = {
  ponytail: { source: 'npm:@dietrichgebert/ponytail' },
  'grill-me': { marketplace: 'https://github.com/mattpocock/skills', source: 'mattpocock-skills@mattpocock' },
};
const exists = file => fs.lstat(file).then(info => info.isFile() && !info.isSymbolicLink(), error => { if (error.code === 'ENOENT') return false; throw error; });
const readJson = file => fs.readFile(file, 'utf8').then(JSON.parse, error => { if (error.code === 'ENOENT') return undefined; throw error; });
const inside = (directory, relative) => {
  const target = path.resolve(directory, relative);
  const tail = path.relative(directory, target);
  if (!tail || path.isAbsolute(tail) || tail.split(path.sep).includes('..')) throw Error('社区安装文件路径无效。');
  return target;
};
async function atomicWrite(file, bytes) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.pending`;
  const handle = await fs.open(temporary, 'w');
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  await fs.rename(temporary, file);
}
async function download(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Better-OMP-Desktop community installer' }, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw Error(`下载社区能力失败（HTTP ${response.status}）：${url}`);
  return response;
}

async function installMattSource(root, complete) {
  const directory = path.join(root, complete ? 'community/grill-me-marketplace' : 'community/grill-me');
  const receiptPath = path.join(directory, 'installation.json');
  let receipt = await readJson(receiptPath);
  const main = complete ? '.claude-plugin/marketplace.json' : 'skills/grilling/SKILL.md';
  if (receipt && (!/^[a-f0-9]{40}$/.test(receipt.revision) || !Array.isArray(receipt.files) || !receipt.files.includes(main) || !receipt.files.includes('LICENSE'))) throw Error('grilling 安装记录不完整，请保留本地修改后移开 installation.json 再重试。');
  if (receipt && (await Promise.all(receipt.files.map(file => exists(inside(directory, file))))).every(Boolean)) return directory;

  const revision = receipt?.revision ?? (await (await download('https://api.github.com/repos/mattpocock/skills/commits/main')).json()).sha;
  if (!/^[a-f0-9]{40}$/.test(revision)) throw Error('无法确认 grilling 的上游版本，请重试。');
  const archive = await (await download(`https://codeload.github.com/mattpocock/skills/tar.gz/${revision}`)).arrayBuffer();
  const entries = await new Bun.Archive(archive).files();
  const files = new Map();
  for (const [name, file] of entries) {
    const relative = name.slice(name.indexOf('/') + 1);
    if (complete || relative === 'LICENSE' || relative.startsWith('skills/productivity/grilling/')) {
      const target = complete ? relative : relative.replace('skills/productivity/grilling/', 'skills/grilling/');
      inside(directory, target);
      files.set(target, file);
    }
  }
  if (!files.has(main) || !files.has('LICENSE')) throw Error('上游包缺少 grilling 技能、市场描述或许可证，请重试。');
  if (!receipt) {
    receipt = { revision, files: [...files.keys()] };
    // 先记录本次上游身份，中断后继续补齐同一版本的缺失文件。
    await atomicWrite(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  }
  for (const relative of receipt.files) {
    const target = inside(directory, relative);
    if (await exists(target)) continue;
    const file = files.get(relative);
    if (!file) throw Error(`上游包缺少已记录的文件：${relative}`);
    await atomicWrite(target, new Uint8Array(await file.arrayBuffer()));
  }
  return directory;
}

function environment(root, directory) {
  const cache = path.join(root, 'cache/community');
  return {
    BUN_BE_BUN: '1',
    BUN_INSTALL_CACHE_DIR: path.join(cache, 'npm/bun'),
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: path.join(cache, 'npm/transpiler'),
    npm_config_cache: path.join(cache, 'npm'),
    npm_config_userconfig: path.join(cache, 'npm/npmrc'),
    PI_NATIVES_DIR: path.join(cache, 'npm/natives'),
    HOME: path.join(cache, 'npm/home'), USERPROFILE: path.join(cache, 'npm/home'),
    APPDATA: path.join(cache, 'npm/home/AppData/Roaming'), LOCALAPPDATA: path.join(cache, 'npm/home/AppData/Local'),
    TEMP: path.join(cache, 'temp'), TMP: path.join(cache, 'temp'), TMPDIR: path.join(cache, 'temp'),
    CODEGRAPH_INSTALL_DIR: directory,
    XDG_CACHE_HOME: path.join(cache, 'npm/xdg'),
  };
}
async function run(executable, args, directory, env, label = '社区能力') {
  const child = Bun.spawn([executable, ...args], { cwd: directory, env: { ...process.env, ...env }, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', windowsHide: true });
  const [stdout, stderr, status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (status !== 0) throw Error(`${label}安装或检查失败，可重试：${(stderr || stdout).trim().slice(-4000) || `退出码 ${status}`}`);
  return stdout.trim();
}
async function installPlugin(root, runtime, id) {
  const definition = plugins[id];
  const directory = path.join(root, 'community', id);
  await fs.mkdir(directory, { recursive: true });
  const env = { ...environment(root, directory), OMP_USER_ROOT: path.join(root, 'omp') };
  for (const folder of [env.TEMP, env.BUN_INSTALL_CACHE_DIR, env.HOME, env.APPDATA, env.LOCALAPPDATA]) await fs.mkdir(folder, { recursive: true });
  // OMP 命令使用编译入口，只有其 npm 子进程再切换到随包 Bun。
  env.BUN_BE_BUN = '0';
  const invoke = args => run(runtime, ['plugin', ...args], directory, env);
  const listed = () => invoke(['list', '--json']).then(JSON.parse);
  const select = value => id === 'ponytail'
    ? value.npm?.find(plugin => plugin.name === '@dietrichgebert/ponytail')
    : value.marketplace?.find(plugin => plugin.id === definition.source && plugin.scope === 'user');
  let plugin = select(await listed());
  if (!plugin) {
    if (definition.marketplace) {
      const name = (process.env.OMP_PROFILE !== undefined ? process.env.OMP_PROFILE : process.env.PI_PROFILE)?.trim();
      const profile = name && name !== 'default' ? name : undefined;
      const registry = await readJson(path.join(root, 'omp', ...(profile ? ['profiles', profile] : []), 'marketplaces.json'));
      if (!registry?.marketplaces?.some(market => market.name === 'mattpocock')) await invoke(['marketplace', 'add', await installMattSource(root, true)]);
    }
    await invoke(['install', definition.source, ...(definition.marketplace ? ['--scope', 'user'] : [])]);
    plugin = select(await listed());
  }
  const installed = id === 'ponytail' ? plugin?.path : plugin?.entries?.find(entry => entry.scope === 'user')?.installPath ?? plugin?.entries?.[0]?.installPath;
  if (!installed || !path.isAbsolute(installed)) throw Error('插件安装记录尚未完成，请重试安装。');
  const managed = path.join(root, 'omp');
  const relative = path.relative(managed, await fs.realpath(installed));
  if (path.isAbsolute(relative) || relative.split(path.sep).includes('..')) throw Error('现有插件位于外部目录，请先在插件管理中处理该安装。');
  if (id === 'grill-me') {
    const canonical = path.join(installed, 'skills/productivity/grilling/SKILL.md');
    const alias = path.join(installed, 'skills/productivity/grill-me/SKILL.md');
    const skill = await fs.readFile(canonical, 'utf8');
    if (!/^name:\s*grilling\s*$/m.test(skill) || !await exists(path.join(installed, 'LICENSE'))) throw Error('插件中的 grilling 技能或许可证不完整，请保留本地修改后修复安装。');
    const original = 'Call the Skill tool with "grilling".';
    const replacement = 'Read skill://grilling with the read tool, then follow its instructions.';
    const content = await fs.readFile(alias, 'utf8');
    if (content.includes(original)) await atomicWrite(alias, content.replace(original, replacement));
  }
  if (id === 'grill-me' || plugin.enabled === false) await invoke(['enable', id === 'ponytail' ? '@dietrichgebert/ponytail' : definition.source, ...(definition.marketplace ? ['--scope', 'user'] : [])]);
  return { ...definition, installed: true };
}
async function codegraphConfiguration(root, directory) {
  const platform = path.join(directory, 'node_modules/@colbymchenry', `codegraph-${process.platform}-${process.arch}`);
  const command = path.join(platform, process.platform === 'win32' ? 'node.exe' : 'node');
  const entry = path.join(platform, 'lib/dist/bin/codegraph.js');
  if (!await exists(command) || !await exists(entry)) return undefined;
  const args = ['--liftoff-only', '--disable-warning=ExperimentalWarning', '--max-semi-space-size=16', entry];
  const env = environment(root, directory);
  // 平台包内的 Node 与官方启动参数保持一致，避免 Bun 对 SQLite、Worker 的差异。
  const version = await run(command, [...args, '--version'], directory, env);
  if (!/\d+\.\d+\.\d+/.test(version)) throw Error('CodeGraph 未返回有效版本，请重试安装。');
  delete env.BUN_BE_BUN;
  return { name: 'codegraph', config: { type: 'stdio', command, args: [...args, 'serve', '--mcp'], env }, installed: true };
}
async function installCodegraph(root, runtime) {
  const directory = path.join(root, 'community/codegraph');
  const env = environment(root, directory);
  for (const folder of [directory, env.BUN_INSTALL_CACHE_DIR, env.TEMP, env.HOME, env.APPDATA, env.LOCALAPPDATA]) await fs.mkdir(folder, { recursive: true });
  const current = await codegraphConfiguration(root, directory);
  if (current) return current;
  const packagePath = path.join(directory, 'package.json');
  let manifest = await readJson(packagePath);
  if (!manifest) {
    const metadata = await (await download('https://registry.npmjs.org/@colbymchenry%2fcodegraph/latest')).json();
    if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(metadata.version)) throw Error('无法确认 CodeGraph 的 npm 版本，请重试。');
    // 主包和平台包必须匹配；固定本次解析版本以支持中断重试。
    manifest = { private: true, dependencies: { '@colbymchenry/codegraph': metadata.version, [`@colbymchenry/codegraph-${process.platform}-${process.arch}`]: metadata.version } };
    await atomicWrite(packagePath, JSON.stringify(manifest, null, 2) + '\n');
  }
  const mainVersion = manifest.dependencies?.['@colbymchenry/codegraph'];
  if (!mainVersion || manifest.dependencies?.[`@colbymchenry/codegraph-${process.platform}-${process.arch}`] !== mainVersion) throw Error('CodeGraph 的主包与平台包版本不一致，请保留本地修改后修正 package.json 再重试。');
  await run(runtime, ['install', '--backend=copyfile', '--ignore-scripts', '--no-progress', '--force'], directory, env);
  const result = await codegraphConfiguration(root, directory);
  if (!result) throw Error('CodeGraph 平台包未安装完整，请重试安装。');
  return result;
}

export async function installCommunity({ root, runtime = process.execPath, id, format }) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw Error('社区安装数据目录必须是绝对路径。');
  if (process.platform === 'win32' && /^C:\\$/i.test(path.parse(root).root)) throw Error('请先选择非 C 盘的数据目录，再安装社区能力。');
  if (format === 'plugin' && Object.hasOwn(plugins, id)) return installPlugin(root, runtime, id);
  if (id === 'grill-me' && format === 'skill') return { paths: [path.join(await installMattSource(root, false), 'skills/grilling/SKILL.md')], installed: true };
  if (id === 'codegraph' && format === 'mcp') return installCodegraph(root, runtime);
  throw Error('未知的社区能力或安装格式。');
}

if (import.meta.main) {
  try {
    const value = await installCommunity(JSON.parse(await Bun.stdin.text()));
    process.stdout.write(JSON.stringify({ ok: true, value }) + '\n');
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }) + '\n');
    process.exitCode = 1;
  }
}
