import assert from 'node:assert/strict';
import { applyMotion } from '../src/lib/motion';

let cancelled = 0;
const root = { dataset: { motion: 'normal' } };
Object.assign(globalThis, { matchMedia: () => ({ matches: false }), document: { documentElement: root, getAnimations: () => [{ cancel: () => cancelled++ }] }, localStorage: { setItem: () => { throw Error('不可用'); } } });
assert.doesNotThrow(() => applyMotion('reduced'));
assert.equal(root.dataset.motion, 'reduced');
assert.equal(cancelled, 1);
console.log('减少动态效果时取消现有动画且缓存失败不影响切换');
