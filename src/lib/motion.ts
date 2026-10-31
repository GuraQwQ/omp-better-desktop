import type { MotionLevel } from './types';

export function normalizeMotion(value: unknown): MotionLevel {
  return value === 'normal' || value === 'reduced' ? value : 'rich';
}

export function motionTiming(level = normalizeMotion(document.documentElement.dataset.motion)) {
  return level === 'reduced' ? { exit: 60, layout: 0 } : level === 'normal' ? { exit: 100, layout: 180 } : { exit: 120, layout: 220 };
}

export function applyMotion(value: unknown): MotionLevel {
  const level = normalizeMotion(value);
  const root = document.documentElement;
  if (root.dataset.motion !== level) {
    root.dataset.motion = level;
    if (level === 'reduced') document.getAnimations().forEach(animation => animation.cancel());
  }
  try { localStorage.setItem('omp-motion', level); } catch { /* 缓存只用于下次启动首帧。 */ }
  return level;
}
