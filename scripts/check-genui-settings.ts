import assert from 'node:assert/strict';
import { normalizeGenUIConfiguration, type GenUIConfiguration } from '../src/lib/genui-config';
import { GenUISettingsDraft } from '../src/lib/genui-settings-draft';

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
const initial = normalizeGenUIConfiguration();
const writes: { configuration: GenUIConfiguration; gate: ReturnType<typeof deferred> }[] = [];
const draft = new GenUISettingsDraft(initial, configuration => {
  const gate = deferred();
  writes.push({ configuration, gate });
  return gate.promise;
});

// 保存尚未返回时，不同项和同一项的连续修改都按最新选择计算。
draft.update(current => ({ ...current, enabled: true }));
draft.update(current => ({ ...current, features: { ...current.features, persistence: true } }));
draft.update(current => ({ ...current, components: [...current.components, 'Map'] }));
draft.update(current => ({ ...current, capabilities: current.capabilities.filter(name => name !== 'workspace.read') }));
draft.update(current => ({ ...current, features: { ...current.features, persistence: false } }));
const desired = draft.getSnapshot().configuration;
assert.equal(desired.enabled, true);
assert.equal(desired.features.persistence, false);
assert.ok(desired.components.includes('Map'));
assert.ok(!desired.capabilities.includes('workspace.read'));
assert.equal(draft.getSnapshot().saving, true);
assert.equal(writes.length, 1);
draft.receive(initial);
assert.deepEqual(draft.getSnapshot().configuration, desired);

// 第一次保存结束后直接保存最新版本，旧 ACK 早到或晚到都不能回退。
writes[0].gate.resolve();
await settle();
assert.equal(writes.length, 2);
assert.deepEqual(writes[1].configuration, desired);
draft.receive(writes[0].configuration);
assert.deepEqual(draft.getSnapshot().configuration, desired);
writes[1].gate.resolve();
await settle();
assert.equal(draft.getSnapshot().saving, false);
draft.receive(writes[0].configuration);
draft.receive(initial);
assert.deepEqual(draft.getSnapshot().configuration, desired);

// 失败保留未保存的选择；重试使用失败期间继续修改的最新版本。
draft.update(current => ({ ...current, enabled: false }));
draft.update(current => ({ ...current, features: { ...current.features, diagnostics: true } }));
const failedDesired = draft.getSnapshot().configuration;
writes[2].gate.reject(new Error('保存失败夹具'));
await settle();
assert.equal(draft.getSnapshot().saving, false);
assert.match(draft.getSnapshot().error!, /保存失败夹具/);
draft.receive(desired);
assert.deepEqual(draft.getSnapshot().configuration, failedDesired);
draft.retry();
assert.equal(writes.length, 4);
assert.deepEqual(writes[3].configuration, failedDesired);
assert.equal(draft.getSnapshot().error, null);
writes[3].gate.resolve();
await settle();
assert.equal(draft.getSnapshot().saving, false);
assert.deepEqual(draft.getSnapshot().configuration, failedDesired);

// 空闲时接收外部的新配置，仍然忽略此前保存的旧回包。
const external = { ...failedDesired, features: { ...failedDesired.features, theme: false } };
draft.receive(external);
assert.deepEqual(draft.getSnapshot().configuration, external);
draft.receive(writes[1].configuration);
assert.deepEqual(draft.getSnapshot().configuration, external);

// 同步夹具仍可使用；同步异常同样保留选择并支持再次编辑恢复。
const synchronousWrites: GenUIConfiguration[] = [];
let shouldFail = true;
const synchronous = new GenUISettingsDraft(initial, configuration => {
  if (shouldFail) throw new Error('同步保存失败夹具');
  synchronousWrites.push(configuration);
});
synchronous.update(current => ({ ...current, enabled: true }));
assert.match(synchronous.getSnapshot().error!, /同步保存失败夹具/);
shouldFail = false;
synchronous.update(current => ({ ...current, features: { ...current.features, streaming: true } }));
await settle();
assert.equal(synchronousWrites.length, 1);
assert.equal(synchronousWrites[0].enabled, true);
assert.equal(synchronousWrites[0].features.streaming, true);
assert.equal(synchronous.getSnapshot().error, null);
assert.equal(synchronous.getSnapshot().saving, false);

const emptyFailure = new GenUISettingsDraft(initial, () => { throw ''; });
emptyFailure.update(current => ({ ...current, enabled: true }));
assert.equal(emptyFailure.getSnapshot().error, '保存选择失败');
assert.equal(emptyFailure.getSnapshot().configuration.enabled, true);

console.log('生成式UI设置保存检查通过：连续切换、版本合并、延迟回包、失败重试、外部配置和同步夹具。');
