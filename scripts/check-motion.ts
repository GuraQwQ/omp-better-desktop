import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { applyMotion, motionTiming, normalizeMotion } from '../src/lib/motion';

assert.equal(normalizeMotion(undefined), 'rich');
assert.equal(normalizeMotion('invalid'), 'rich');
for (const level of ['rich', 'normal', 'reduced'] as const) assert.equal(normalizeMotion(level), level);
assert.deepEqual(motionTiming('rich'), { exit: 120, layout: 220 });
assert.deepEqual(motionTiming('normal'), { exit: 100, layout: 180 });
assert.deepEqual(motionTiming('reduced'), { exit: 60, layout: 0 });

const cache = new Map<string, string>();
const root = { dataset: {} as Record<string, string> };
let cancelled = 0;
Object.assign(globalThis, { document: { documentElement: root, getAnimations: () => [{ cancel: () => cancelled++ }] }, localStorage: { setItem: (key: string, value: string) => cache.set(key, value) } });
assert.equal(applyMotion(undefined), 'rich');
assert.equal(root.dataset.motion, 'rich');
assert.equal(applyMotion('reduced'), 'reduced');
assert.equal(cancelled, 1);
assert.equal(cache.get('omp-motion'), 'reduced');
applyMotion('reduced');
assert.equal(cancelled, 1);
applyMotion('normal');
assert.equal(motionTiming().layout, 180);
Object.assign(globalThis, { localStorage: { setItem: () => { throw Error('不可用'); } } });
assert.doesNotThrow(() => applyMotion('rich'));

const boot = await Bun.file('public/theme-boot.js').text();
for (const stored of [null, 'rich', 'normal', 'reduced', 'invalid']) {
  const document = { documentElement: { dataset: {} as Record<string, string> } };
  runInNewContext(boot, { document, localStorage: { getItem: (key: string) => key === 'omp-motion' ? stored : 'light' }, matchMedia: () => ({ matches: false }) });
  assert.equal(document.documentElement.dataset.motion, normalizeMotion(stored));
}
console.log('动画档位、默认值、即时切换、缓存失败、旧配置及启动恢复检查通过。');
