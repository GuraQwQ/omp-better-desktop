import assert from 'node:assert/strict';
import { selectionMenuPosition } from '../src/lib/selection-menu';

for (const viewport of [{ width: 880, height: 640 }, { width: 1440, height: 940 }]) {
  const size = { width: 252, height: 42 };
  for (const point of [{ x: 0, y: 0 }, { x: viewport.width, y: viewport.height }, { x: 500, y: 320 }]) {
    const position = selectionMenuPosition(point, size, viewport);
    assert.ok(position.left >= 8 && position.left + size.width <= viewport.width - 8);
    assert.ok(position.top >= 8 && position.top + size.height <= viewport.height - 8);
  }
}
assert.deepEqual(selectionMenuPosition({ x: 500, y: 320 }, { width: 252, height: 42 }, { width: 880, height: 640 }), { left: 480, top: 330 });
console.log('选段操作栏跟随位置及窗口边界检查通过');
