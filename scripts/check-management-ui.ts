import assert from 'node:assert/strict';
import { agentModelOptions, keyValueLines, lineValues, settingInput } from '../src/lib/management';

assert.deepEqual(lineValues(' one\r\n\n two '), ['one', 'two']);
assert.deepEqual(keyValueLines('TOKEN=a=b\n EMPTY= \n'), { TOKEN: 'a=b', EMPTY: '' });
assert.throws(() => keyValueLines('missing-value'));
assert.throws(() => keyValueLines(' =value'));
assert.equal(settingInput('12', 'integer'), 12);
assert.throws(() => settingInput('1.5', 'integer'));
assert.throws(() => settingInput('', 'number'));
assert.deepEqual(settingInput('["read"]', 'array'), ['read']);
assert.throws(() => settingInput('[]', 'object'));
const models = [{ value: 'openai/chat', id: 'chat', name: 'Chat', provider: 'openai', kind: 'chat' }, { value: 'vendor/image', id: 'image', provider: 'vendor', kind: 'image' }];
assert.deepEqual(agentModelOptions(models, '', 'OPENAI').map(option => option.value), ['openai/chat']);
assert.deepEqual(agentModelOptions(models, '@slow', 'missing').map(option => option.value), ['@slow']);
assert.deepEqual(agentModelOptions(models, 'openai/chat', 'missing').map(option => option.value), ['openai/chat']);
console.log('资源管理输入检查通过');
