import assert from 'node:assert/strict';
import { agentModelOptions, keyValueLines, settingInput } from '../src/lib/management';

assert.deepEqual(keyValueLines('TOKEN=a=b\n EMPTY= \n'), { TOKEN: 'a=b', EMPTY: '' });
assert.throws(() => keyValueLines(' =value'));
assert.throws(() => settingInput('1.5', 'integer'));
assert.throws(() => settingInput('[]', 'object'));
assert.deepEqual(agentModelOptions([], '@slow', 'missing').map(option => option.value), ['@slow']);
console.log('资源管理输入检查通过');
