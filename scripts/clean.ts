import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import assert from 'node:assert/strict';

const projectRoot = path.resolve(import.meta.dir, '..');
for (const name of ['.cache', 'build', 'dist']) {
  const target = path.join(projectRoot, name);
  assert.equal(path.dirname(target), projectRoot);
  const info = await fs.lstat(target).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (!info) continue;
  // 只清理仓库管理的目录；链接的目标可能属于其他项目。
  if (info.isSymbolicLink()) await fs.unlink(target);
  else await fs.rm(target, { recursive: true, force: true });
  console.log(`已清理 ${target}`);
}
