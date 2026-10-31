import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import assert from 'node:assert/strict';

const projectRoot = path.resolve(import.meta.dir, '..');
for (const name of ['.cache', 'build', 'dist', 'public/agent-icons']) {
  const target = path.join(projectRoot, name);
  assert.equal(target, path.resolve(projectRoot, name));
  assert(target.startsWith(projectRoot + path.sep));
  const info = await fs.lstat(target).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (!info) continue;
  const parent = await fs.realpath(path.dirname(target));
  const root = await fs.realpath(projectRoot);
  assert(parent === root || parent.startsWith(root + path.sep), '缓存目录的父级不得指向仓库外');
  // 只清理仓库管理的目录；链接的目标可能属于其他项目。
  if (info.isSymbolicLink()) await fs.unlink(target);
  else await fs.rm(target, { recursive: true, force: true });
  console.log(`已清理 ${target}`);
}
