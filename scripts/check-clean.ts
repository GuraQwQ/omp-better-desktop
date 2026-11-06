import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const cache = path.resolve(import.meta.dir, '../.cache/test-prune');
await fs.mkdir(cache, { recursive: true });
const temporary = await fs.mkdtemp(path.join(cache, 'clean-'));
const fixture = path.join(temporary, 'project');
const script = path.join(fixture, 'scripts/clean.ts');
await fs.mkdir(path.dirname(script), { recursive: true });
await fs.copyFile(path.join(import.meta.dir, 'clean.ts'), script);
for (const name of ['.cache', '.local-data']) {
  await fs.mkdir(path.join(fixture, name));
  await fs.writeFile(path.join(fixture, name, 'keep'), '用户数据');
}
const run = () => Bun.spawn([process.execPath, script], { stdout: 'ignore', stderr: 'ignore' }).exited;
assert.equal(await run(), 0);
assert.equal(await fs.stat(path.join(fixture, '.cache')).catch(() => null), null);
assert.equal(await fs.readFile(path.join(fixture, '.local-data/keep'), 'utf8'), '用户数据');
const outside = path.join(temporary, 'other-project');
await fs.mkdir(path.join(outside, 'agent-icons'), { recursive: true });
await fs.writeFile(path.join(outside, 'agent-icons/keep'), '其它项目');
await fs.symlink(outside, path.join(fixture, 'public'), process.platform === 'win32' ? 'junction' : 'dir');
assert.notEqual(await run(), 0);
assert.equal(await fs.readFile(path.join(outside, 'agent-icons/keep'), 'utf8'), '其它项目');
await fs.unlink(path.join(fixture, 'public'));
console.log('清理保留用户数据和仓库外链接目标检查通过');
