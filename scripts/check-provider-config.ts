import assert from 'node:assert/strict';
import { deleteProvider, mergeProvider, summary } from '../src-tauri/src/provider-config.mjs';

const input = { id: 'custom', api: 'openai-completions', baseUrl: 'https://example.invalid', apiKey: 'fixture', modelIds: ['one'] };
const original = { providers: { other: { apiKey: 'other' }, custom: { apiKey: 'kept', unknownSetting: true, models: [{ id: 'one', maxTokens: 8192, headers: { 'X-Model': 'kept' } }] } } };
const snapshot = JSON.stringify(original);
const updated = mergeProvider(original, { ...input, apiKey: '', modelSettings: { one: { maxTokens: null, contextWindow: 200000 } } });
assert.equal(JSON.stringify(original), snapshot);
assert.deepEqual([updated.providers.other, updated.providers.custom.apiKey, updated.providers.custom.unknownSetting], [original.providers.other, 'kept', true]);
assert.deepEqual(updated.providers.custom.models, [{ id: 'one', headers: { 'X-Model': 'kept' }, contextWindow: 200000 }]);
assert.deepEqual(mergeProvider({}, input).providers.custom.models, [{ id: 'one' }]);
assert.equal(JSON.stringify(summary(updated)).includes('"apiKey"'), false);
assert.throws(() => mergeProvider({}, { ...input, baseUrl: 'file:///tmp/model' }), /HTTP or HTTPS/);
assert.throws(() => mergeProvider({}, { ...input, modelSettings: { one: { contextWindow: 0 } } }), /positive integer/);
assert.deepEqual(deleteProvider(deleteProvider(original, { id: 'custom' }), { id: 'custom' }), { providers: { other: original.providers.other } });
console.log('提供商合并保留数据、输入边界和幂等删除检查通过');
