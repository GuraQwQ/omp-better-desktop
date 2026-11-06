import assert from 'node:assert/strict';
import { pngSize } from './fetch-agent-icons';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=', 'base64');
assert.deepEqual(pngSize(png), { width: 1, height: 1 });
assert.throws(() => pngSize(png.subarray(0, png.length - 4)));
console.log('图标有效 PNG 与截断响应检查通过');
