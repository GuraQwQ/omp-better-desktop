import assert from 'node:assert/strict';
import { describeCommand } from '../src/lib/command-descriptions';

const entry = { name: 'usage', source: 'extension', description: 'Extension help' };
assert.equal(describeCommand(entry, 'zh'), entry.description);
assert.equal(describeCommand({ ...entry, descriptions: { zh: '扩展说明' } }, 'zh'), '扩展说明');
assert.notEqual(describeCommand({ name: 'agents', kind: 'cli' }, 'zh'), describeCommand({ name: 'agents', kind: 'slash' }, 'zh'));
console.log('动态来源描述与同名命令检查通过');
