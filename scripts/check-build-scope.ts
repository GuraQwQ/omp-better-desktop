import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { buildScope } from './build-inputs';

if (process.argv.includes('--self-test')) {
  for (const name of ['model-metadata.mjs', 'model-metadata.d.mts', 'model-capabilities.json', 'model-capabilities-overrides.json']) {
    assert.deepEqual(buildScope([`src-tauri/src/${name}`]), { runtime: true, host: true });
  }
  assert.deepEqual(buildScope(['src-tauri/src/lib.rs']), { runtime: false, host: true });
  assert.deepEqual(buildScope(['src/App.tsx']), { runtime: false, host: false });
  assert.deepEqual(buildScope([], true), { runtime: true, host: true });
  console.log('构建输入分类检查通过');
} else {
  const base = process.env.CHECK_BASE;
  const changes = base && !/^0+$/.test(base)
    ? spawnSync('git', ['diff', '--name-only', base, 'HEAD'], { encoding: 'utf8' })
    : undefined;
  const files = changes?.status === 0 ? changes.stdout.trim().split(/\r?\n/).filter(Boolean) : ['package.json'];
  const scope = buildScope(files, process.env.GITHUB_EVENT_NAME === 'workflow_dispatch');
  const output = `runtime=${scope.runtime}\nhost=${scope.host}\n`;
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, output, 'utf8');
  else process.stdout.write(output);
}
