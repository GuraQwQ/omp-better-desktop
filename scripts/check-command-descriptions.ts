import assert from 'node:assert/strict';
import catalog from '../src/generated/catalog.json';
import { describeCommand } from '../src/lib/command-descriptions';
import type { CatalogEntry } from '../src/lib/types';

const commands = catalog.filter(entry => ['cli', 'slash', 'rpc'].includes(entry.kind));
for (const entry of commands) {
  const original = JSON.stringify(entry);
  const chinese = describeCommand(entry, 'zh');
  assert.match(chinese, /[\u3400-\u9fff]/u, `${entry.kind}:${entry.name} 缺少中文描述`);
  assert.ok(describeCommand(entry, 'en'), `${entry.kind}:${entry.name} 缺少英文描述`);
  assert.equal(JSON.stringify(entry), original, '翻译不得修改命令名称、参数或目录元数据');
}

for (const source of ['skill', 'extension', 'custom', 'mcp_prompt', 'file']) {
  const entry = { name: 'usage', source, description: `${source} supplied description` };
  assert.equal(describeCommand(entry, 'zh'), entry.description, '动态命令应保留来源提供的描述');
  assert.equal(describeCommand({ ...entry, descriptions: { zh: '来源提供的中文描述' } }, 'zh'), '来源提供的中文描述');
}

assert.equal(describeCommand({ name: 'usage', source: 'builtin', description: 'Show token usage' }, 'zh'), '查看提供商的使用量和额度');
assert.notEqual(describeCommand({ name: 'agents', kind: 'cli' }, 'zh'), describeCommand({ name: 'agents', kind: 'slash' }, 'zh'));
assert.equal(describeCommand({ name: 'future-command', description: 'Future metadata' }, 'zh'), 'Future metadata');
assert.equal(describeCommand({ name: 'plan', kind: 'slash', description: 'Original upstream description' }, 'en'), 'Original upstream description');
assert.equal(describeCommand({ name: '/plan', kind: 'slash' }, 'zh'), describeCommand({ name: 'plan', kind: 'slash' }, 'zh'));
assert.equal(describeCommand({ name: 'skill:fixture', source: 'skill' } as CatalogEntry, 'zh'), '');
console.log(`命令描述检查通过：${commands.length} 项 CLI、slash 和 RPC 命令，动态描述与命令标识保持正确。`);
