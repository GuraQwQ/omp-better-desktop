import * as fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

type Entry = { target: string; directory: boolean; candidate: string; original?: string };
const journalName = 'recovery.json';
const exists = (file: string) => fs.lstat(file).then(() => true, error => {
  if (error.code === 'ENOENT') return false;
  throw error;
});

async function digest(file: string): Promise<string> {
  const hash = createHash('sha256');
  if ((await fs.stat(file)).isDirectory()) {
    hash.update('directory\0');
    for (const name of (await fs.readdir(file)).sort()) hash.update(name).update('\0').update(await digest(path.join(file, name))).update('\0');
  } else {
    hash.update('file\0');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
  }
  return hash.digest('hex');
}

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

export async function rollbackBuildInstall(projectRoot: string, stageRoot: string): Promise<void> {
  const journal = path.join(stageRoot, journalName);
  if (!await exists(journal)) return;
  const entries = JSON.parse(await fs.readFile(journal, 'utf8')) as Entry[];
  if (!Array.isArray(entries) || entries.some(entry => !entry || typeof entry.target !== 'string' || !entry.target || path.isAbsolute(entry.target) || entry.target.split(/[\\/]/).includes('..') || typeof entry.directory !== 'boolean' || !/^[0-9a-f]{64}$/.test(entry.candidate) || entry.original !== undefined && !/^[0-9a-f]{64}$/.test(entry.original))) throw new Error(`构建恢复记录无效，保留 ${stageRoot}`);
  const errors: Error[] = [];
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    const target = path.join(projectRoot, entry.target);
    const backup = path.join(stageRoot, 'rollback-' + index);
    try {
      const current = await exists(target) ? await digest(target) : undefined;
      if (current !== undefined && current !== entry.candidate && current !== entry.original) throw new Error(`目标出现构建以外的修改，保留 ${target} 与 ${backup}；请先保存修改或移开该目标再重试`);
      if (entry.original) {
        if (current !== entry.original) {
          if (await digest(backup) !== entry.original) throw new Error('原文件备份校验失败');
          const restored = path.join(stageRoot, 'restore-' + index);
          await fs.rm(restored, { recursive: entry.directory, force: true });
          await fs.cp(backup, restored, { recursive: entry.directory });
          if (await digest(restored) !== entry.original) throw new Error('还原副本校验失败');
          await fs.rm(target, { recursive: entry.directory, force: true });
          await renameWithRetry(restored, target);
        }
        if (await digest(target) !== entry.original) throw new Error('恢复后的文件校验失败');
      } else {
        await fs.rm(target, { recursive: entry.directory, force: true });
      }
    } catch (error) {
      errors.push(new Error(`${entry.target}: ${error}`));
    }
  }
  if (errors.length) throw new AggregateError(errors, `构建文件尚未全部恢复。备份和校验记录保留在 ${stageRoot}；解除文件占用后重新运行原构建命令恢复。`);
  await fs.rm(journal);
}

export async function recoverBuildInstalls(projectRoot: string, artifactsRoot: string): Promise<void> {
  for (const entry of await fs.readdir(artifactsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('.staging-runtime-')) continue;
    const stageRoot = path.join(artifactsRoot, entry.name);
    if (!await exists(path.join(stageRoot, journalName))) continue;
    await rollbackBuildInstall(projectRoot, stageRoot);
    await fs.rm(stageRoot, { recursive: true, force: true });
    console.log(`已校验并恢复上次中断的构建：${stageRoot}`);
  }
}

export function buildInstall(projectRoot: string, stageRoot: string) {
  const entries: Entry[] = [];
  const journal = path.join(stageRoot, journalName);
  return {
    async install(staged: string, target: string, directory = false): Promise<void> {
      await fs.mkdir(path.dirname(target), { recursive: true });
      const relative = path.relative(projectRoot, target);
      if (!relative || path.isAbsolute(relative) || relative.split(path.sep).includes('..')) throw new Error(`构建目标不在项目内：${target}`);
      const original = await exists(target) ? await digest(target) : undefined;
      const candidate = await digest(staged);
      const backup = path.join(stageRoot, 'rollback-' + entries.length);
      entries.push({ target: relative, directory, candidate, original });
      // 在第一个文件移动前记录恢复信息，覆盖替换失败和进程中断的窗口。
      const pending = journal + '.pending';
      await fs.writeFile(pending, JSON.stringify(entries, null, 2) + '\n', 'utf8');
      await renameWithRetry(pending, journal);
      if (original) await renameWithRetry(target, backup);
      await renameWithRetry(staged, target);
    },
    rollback: () => rollbackBuildInstall(projectRoot, stageRoot),
    commit: () => fs.rm(journal, { force: true }),
  };
}
