import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const cache = path.resolve(import.meta.dir, '../.cache');
await fs.mkdir(cache, { recursive: true });
const temporary = await fs.mkdtemp(path.join(cache, 'check-clean-'));
const fixture = path.join(temporary, 'project');
const script = path.join(fixture, 'scripts/clean.ts');
try {
  await fs.mkdir(path.dirname(script), { recursive: true });
  await fs.copyFile(path.join(import.meta.dir, 'clean.ts'), script);
  for (const directory of ['.cache', 'build', 'dist', 'public/agent-icons', '.local-data', 'node_modules']) {
    await fs.mkdir(path.join(fixture, directory), { recursive: true });
    await fs.writeFile(path.join(fixture, directory, 'fixture'), '保留原始数据');
  }
  const run = async () => {
    const child = Bun.spawn([process.execPath, script], { stdout: 'ignore', stderr: 'pipe' });
    return { code: await child.exited, stderr: await new Response(child.stderr).text() };
  };
  assert.equal((await run()).code, 0);
  for (const directory of ['.cache', 'build', 'dist', 'public/agent-icons']) assert.equal(await fs.stat(path.join(fixture, directory)).catch(() => null), null);
  for (const directory of ['.local-data', 'node_modules']) assert.equal(await fs.readFile(path.join(fixture, directory, 'fixture'), 'utf8'), '保留原始数据');
  const outside = path.join(temporary, 'other-project');
  await fs.mkdir(path.join(outside, 'agent-icons'), { recursive: true });
  await fs.writeFile(path.join(outside, 'agent-icons/keep'), '其它项目');
  await fs.rmdir(path.join(fixture, 'public'));
  await fs.symlink(outside, path.join(fixture, 'public'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.notEqual((await run()).code, 0);
  assert.equal(await fs.readFile(path.join(outside, 'agent-icons/keep'), 'utf8'), '其它项目');
  await fs.unlink(path.join(fixture, 'public'));
  console.log('缓存清理、数据保留和链接父目录检查通过');
} finally {
  assert.equal(path.dirname(temporary), cache);
  await fs.rm(temporary, { recursive: true, force: true });
}
