import assert from 'node:assert/strict';
import { composingInput, insertSlashCommand, matchingSlashCommands, slashCommandAt } from '../src/lib/slash-completions';
import { mergeCommandEntries, resolveCommand } from '../src/lib/command-routes';
import catalogEntries from '../src/generated/catalog.json';
import { acknowledgeDraft, captureDraft, createDraft, updateDraft } from '../src/lib/composer-draft';

const entries = [{ name: 'plan', kind: 'slash' }, { name: 'plan', source: 'builtin' }, { name: 'get_state', kind: 'rpc' }];
assert.deepEqual(matchingSlashCommands(entries, '', 'en').map(item => item.token), ['plan']);
assert.equal(slashCommandAt('路径 /src', 7), null);
assert.deepEqual(insertSlashCommand('/plan existing args', slashCommandAt('/plan existing args', 3)!, 'plan'), { text: '/plan existing args', caret: 6 });
assert.equal(composingInput({ isComposing: true }), true);
const catalog = [{ name: 'plan', kind: 'slash', rpc: false, surface: 'terminal' }];
assert.deepEqual(resolveCommand(catalog[0], '审查'), { kind: 'terminal', input: '/plan 审查' });
const extension = mergeCommandEntries(catalog, [{ name: 'plan', source: 'extension' }])[0];
assert.deepEqual(resolveCommand(extension), { kind: 'prompt', message: '/plan' });
assert.deepEqual(resolveCommand({ name: 'goal', kind: 'slash', source: 'extension' }), { kind: 'prompt', message: '/goal' });
for (const [name, surface] of Object.entries({ context: 'context', tools: 'context', model: 'models', settings: 'settings:omp', todo: 'tasks', tree: 'tree', login: 'settings:providers', git: 'review' })) {
  const command = catalogEntries.find(entry => entry.kind === 'slash' && entry.name === name)!;
  assert.deepEqual(resolveCommand(command), { kind: 'desktop', surface }, name);
  assert.notEqual(resolveCommand(command, '参数').kind, 'desktop', `${name} 参数`);
  assert.equal(resolveCommand({ ...command, source: 'extension' }).kind, 'prompt', `${name} 扩展`);
}
for (const name of ['usage', 'stats', 'jobs']) assert.equal(resolveCommand({ name, kind: 'slash', rpc: true }).kind, 'prompt', name);
assert.deepEqual(resolveCommand({ name: 'queue', kind: 'slash' }, '下一步'), { kind: 'rpc', command: 'follow_up', params: { message: '下一步' } });
assert.deepEqual(resolveCommand({ name: 'queue', kind: 'slash', source: 'extension' }, '下一步'), { kind: 'prompt', message: '/queue 下一步' });
const menu = matchingSlashCommands(catalogEntries, '', 'zh');
assert.deepEqual(menu.slice(0, 7).map(item => item.token), ['model', 'new', 'resume', 'plan', 'compact', 'context', 'git']);
assert.ok(menu.length > 30);
for (const name of ['usage', 'stats', 'jobs']) assert.ok(menu.some(item => item.token === name), name);
const grouped = matchingSlashCommands([{ name: 'z-command', kind: 'slash' }, { name: 'a-extension', source: 'extension' }, { name: 'a-skill', source: 'skill' }, { name: 'a-file', source: 'file' }], '', 'zh');
assert.deepEqual(grouped.map(item => item.group), ['commands', 'skills', 'extensions', 'extensions']);
assert.deepEqual(matchingSlashCommands([{ name: 'prefix-more', kind: 'slash' }, { name: 'prefix', source: 'extension' }, { name: 'other', kind: 'slash', description: 'prefix' }], 'prefix', 'zh').map(item => item.token), ['prefix', 'prefix-more', 'other']);
assert.equal(matchingSlashCommands([{ name: 'other', kind: 'slash', aliases: ['prefix-alias'] }, { name: 'prefix-exact', kind: 'slash', description: 'prefix' }], 'prefix-al', 'zh')[0]?.token, 'other');
const draft = createDraft('/plan');
const submission = captureDraft(draft);
updateDraft(draft, '/plan 后续输入');
assert.equal(acknowledgeDraft(submission), false);
assert.equal(draft.text, '/plan 后续输入');
console.log('命令路由、排序、分组、输入法边界和提交期间草稿保留检查通过');
