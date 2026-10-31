import assert from 'node:assert/strict';
import { deleteProvider, mergeProvider, modelRows, summary } from '../src-tauri/src/provider-config.mjs';

const input = { id: 'custom', api: 'openai-completions', baseUrl: 'https://example.invalid', apiKey: 'fixture', modelIds: ['one'] };
const original = { providers: { other: { apiKey: 'other-fixture' }, custom: { apiKey: 'kept-fixture', unknownSetting: 'kept', compat: { supportsStore: false }, models: [{ id: 'one', maxTokens: 8192, tokenizer: 'o200k', headers: { 'X-Model': 'kept' } }] } } };
const updated = mergeProvider(original, { ...input, apiKey: '', options: { discovery: { type: 'openai-models-list' } }, modelSettings: { one: { maxTokens: null, contextWindow: 200000, reasoning: true } } });
assert.equal(updated.providers.custom.apiKey, 'kept-fixture');
assert.deepEqual(updated.providers.other, original.providers.other);
assert.equal(updated.providers.custom.unknownSetting, 'kept');
assert.deepEqual(updated.providers.custom.compat, { supportsStore: false });
assert.deepEqual(updated.providers.custom.models[0], { id: 'one', tokenizer: 'o200k', headers: { 'X-Model': 'kept' }, contextWindow: 200000, reasoning: true });
assert.equal(original.providers.custom.models[0].maxTokens, 8192);

// 未填写模型覆盖时不写入长度、费用或能力默认值。
const standard = mergeProvider({}, { ...input, options: { discovery: { type: 'openai-models-list' } } });
assert.deepEqual(standard.providers.custom.models, [{ id: 'one' }]);
assert.deepEqual(standard.providers.custom.discovery, { type: 'openai-models-list' });
assert.equal(JSON.stringify(summary(standard)).includes('fixture'), false);
assert.equal(summary(updated)[0].hasApiKey, true);
assert.equal(summary(updated).find(provider => provider.id === 'custom')?.models[0].contextWindow, 200000);

const keyless = mergeProvider({}, { ...input, apiKey: '', modelIds: [], options: { auth: 'none', discovery: { type: 'ollama' } } });
assert.equal(keyless.providers.custom.apiKey, undefined);
assert.deepEqual(keyless.providers.custom.models, []);
assert.throws(() => mergeProvider({}, { ...input, modelSettings: { one: { contextWindow: 0 } } }), /positive integer/);
assert.throws(() => mergeProvider({}, { ...input, modelSettings: { one: { contextWindow: 100, maxContextWindow: 50 } } }), /extended context/);
assert.throws(() => mergeProvider({}, { ...input, modelSettings: { one: { cost: { input: 1 } } } }), /all four/);
assert.throws(() => mergeProvider({}, { ...input, options: { discovery: { type: 'openai-models-list', timeoutMs: Number.NaN } } }), /positive number/);
assert.throws(() => mergeProvider({}, { ...input, options: { headers: { invalid: 1 } } }), /string values/);
assert.throws(() => mergeProvider({}, { ...input, modelSettings: { one: { input: ['audio'] } } }), /text or image/);
assert.throws(() => mergeProvider({}, { ...input, baseUrl: 'file:///tmp/model' }), /HTTP or HTTPS/);
assert.deepEqual(deleteProvider(deleteProvider(original, { id: 'custom' }), { id: 'custom' }), { providers: { other: original.providers.other } });
assert.deepEqual(modelRows({ data: [{ id: 'one', context_length: 999 }, { id: 'one' }, { id: 'two' }] }), [{ id: 'one' }, { id: 'two' }]);
console.log('提供商配置检查通过：标准值、覆盖清除、既有字段、认证、校验与幂等删除。');
