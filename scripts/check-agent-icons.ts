import assert from 'node:assert/strict';
import { pngSize } from './fetch-agent-icons';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=', 'base64');
assert.deepEqual(pngSize(png), { width: 1, height: 1 });
assert.throws(() => pngSize(new TextEncoder().encode('<html>error</html>')));
assert.throws(() => pngSize(png.subarray(0, png.length - 4)));
assert.throws(() => pngSize(Buffer.concat([png, Buffer.from([0])])));
console.log('图标 PNG 格式、HTML 与截断响应检查通过');
