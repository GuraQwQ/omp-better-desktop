import assert from 'node:assert/strict';
import { parseSettingInput, parseSettingLines, parseSettingRecord } from '../src/lib/settings-values';

assert.equal(parseSettingInput({ type: 'number' }, '0'), 0);
assert.equal(parseSettingInput({ type: 'boolean' }, 'false'), false);
assert.deepEqual(parseSettingInput({ type: 'array' }, '["甲"]'), ['甲']);
assert.throws(() => parseSettingInput({ type: 'number' }, 'Infinity'));
assert.throws(() => parseSettingInput({ type: 'boolean' }, 'tru'));
assert.throws(() => parseSettingInput({ type: 'array' }, '{}'));
assert.throws(() => parseSettingInput({ type: 'record' }, 'null'));
assert.deepEqual(parseSettingRecord([{ key: '数量', text: '42', type: 'number' }, { key: '开关', text: 'false', type: 'boolean' }]), { 数量: 42, 开关: false });
assert.throws(() => parseSettingRecord([{ key: 'same', text: 'one', type: 'string' }, { key: ' same ', text: 'two', type: 'string' }]), /key/);
assert.throws(() => parseSettingRecord([{ key: '', text: '尚未命名', type: 'string' }]), /key/);
assert.deepEqual(parseSettingLines('甲\r\n\n乙\n'), ['甲', '', '乙', '']);
console.log('设置类型、重复键和多行输入检查通过');
