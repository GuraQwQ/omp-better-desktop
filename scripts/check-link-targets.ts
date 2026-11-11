import assert from 'node:assert/strict';
import { resolveLinkTarget } from '../src/lib/link-target';

assert.deepEqual(resolveLinkTarget('src/中文.ts#L18', 'D:\\project'), { kind: 'file', path: 'D:/project/src/中文.ts', relative: 'src/中文.ts', line: 18 });
assert.deepEqual(resolveLinkTarget('file:///D:/project/a%20b.ts:9', 'D:/project'), { kind: 'file', path: 'D:/project/a b.ts', relative: 'a b.ts', line: 9 });
assert.deepEqual(resolveLinkTarget('d:\\PROJECT\\src\\..\\readme.md', 'D:/project'), { kind: 'file', path: 'd:/PROJECT/readme.md', relative: 'readme.md' });
assert.deepEqual(resolveLinkTarget('../outside.txt', 'D:/project'), { kind: 'file', path: 'D:/outside.txt' });
assert.deepEqual(resolveLinkTarget('file://server/share/report.txt', 'D:/project'), { kind: 'file', path: '//server/share/report.txt' });
assert.deepEqual(resolveLinkTarget('https://example.com/path#L12', 'D:/project'), { kind: 'url', url: 'https://example.com/path#L12' });
assert.equal(resolveLinkTarget('#section', 'D:/project'), undefined);
assert.equal(resolveLinkTarget('javascript:alert(1)', 'D:/project'), undefined);
assert.equal(resolveLinkTarget('relative.txt', ''), undefined);
console.log('链接按来源目录解析，保留网址、中文路径、UNC 与行号');
