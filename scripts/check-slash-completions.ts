import assert from 'node:assert/strict';
import { completionKey, composingInput, insertSlashCommand, matchingSlashCommands, slashCommandAt } from '../src/lib/slash-completions';
import type { CatalogEntry } from '../src/lib/types';
import { mergeCommandEntries, terminalCommand } from '../src/lib/command-routes';
import catalogEntries from '../src/generated/catalog.json';
import { acknowledgeDraft, captureDraft, createDraft, updateDraft } from '../src/lib/composer-draft';

const entries: CatalogEntry[] = [
  { name: 'plan', kind: 'slash', description: 'Plan the next change' },
  { name: 'plan', source: 'builtin', description: 'Create a plan' },
  { name: 'skill:ponytail', source: 'skill', description: '最小改动完成任务' },
  { name: 'deploy', source: 'extension', description: 'Deploy preview' },
  { name: 'get_state', kind: 'rpc' },
  { name: 'bad command', kind: 'slash' },
];
assert.deepEqual(slashCommandAt('/', 1), { start: 0, end: 1, query: '' });
assert.deepEqual(slashCommandAt('/skill:po', 9), { start: 0, end: 9, query: 'skill:po' });
assert.equal(slashCommandAt('路径 /src', 7), null);
assert.equal(slashCommandAt('/plan @src', 10), null);
assert.equal(slashCommandAt('问题\n/plan', 8), null);
assert.equal(slashCommandAt('/plan ', 6), null);
assert.deepEqual(matchingSlashCommands(entries, '', 'en').map(item => item.token).sort(), ['deploy', 'plan', 'skill:ponytail']);
assert.equal(matchingSlashCommands(entries, 'plan', 'zh')[0].token, 'plan');
assert.equal(matchingSlashCommands(entries, 'ponytail', 'zh')[0].token, 'skill:ponytail');
assert.equal(matchingSlashCommands(entries, '最小改动', 'zh')[0].group, 'skills');
assert.equal(matchingSlashCommands(entries, 'preview', 'en')[0].group, 'extensions');
const many = Array.from({ length: 60 }, (_, index) => ({ name: `command${index}`, kind: 'slash' }));
assert(matchingSlashCommands([...many, ...entries], '', 'en').some(item => item.token === 'skill:ponytail'));
assert(matchingSlashCommands([...many, ...entries], '', 'en').some(item => item.token === 'deploy'));
assert.equal(matchingSlashCommands([...many, ...entries], '', 'en').length, 30);
assert.deepEqual(insertSlashCommand('/pl', { start: 0, end: 3 }, 'plan'), { text: '/plan ', caret: 6 });
assert.deepEqual(insertSlashCommand('/skill:po', { start: 0, end: 9 }, 'skill:ponytail'), { text: '/skill:ponytail ', caret: 16 });
const mid = slashCommandAt('/plan existing args', 3)!;
assert.deepEqual(insertSlashCommand('/plan existing args', mid, 'plan'), { text: '/plan existing args', caret: 6 });
assert.equal(composingInput({ isComposing: true }), true);
assert.equal(composingInput({ keyCode: 229 }), true);
assert.equal(composingInput({}, true), true);
assert.equal(composingInput({ keyCode: 13 }), false);
assert.equal(completionKey({ key: 'Enter' }, 2), 'choose');
assert.equal(completionKey({ key: 'Tab' }, 2), 'choose');
assert.equal(completionKey({ key: 'Enter', shiftKey: true }, 2), undefined);
assert.equal(completionKey({ key: 'Tab', shiftKey: true }, 2), undefined);
assert.equal(completionKey({ key: 'Enter' }, 0), undefined);
assert.equal(completionKey({ key: 'ArrowDown' }, 2), 'next');
assert.equal(completionKey({ key: 'ArrowUp' }, 2), 'previous');
assert.equal(completionKey({ key: 'Escape' }, 0), 'dismiss');
const catalog = [{ name: 'plan', kind: 'slash', rpc: false, surface: 'terminal' }, { name: 'usage', kind: 'slash', rpc: true, surface: 'usage' }];
const builtins = mergeCommandEntries(catalog, [{ name: 'plan', source: 'builtin', description: 'Plan' }]);
assert.equal(terminalCommand(builtins.find(entry => entry.name === 'plan')!, '审查变更'), '/plan 审查变更');
assert.equal(terminalCommand(builtins.find(entry => entry.name === 'usage')!), undefined);
const extension = mergeCommandEntries(catalog, [{ name: 'plan', source: 'extension', description: 'Extension plan' }]).find(entry => entry.name === 'plan')!;
assert.equal(extension.rpc, true);
assert.equal(extension.surface, 'prompt');
assert.equal(terminalCommand(extension), undefined);
assert.equal(catalogEntries.find(entry => entry.kind === 'slash' && entry.name === 'seance')?.rpc, false);
assert(catalogEntries.find(entry => entry.kind === 'slash' && entry.name === 'quit')?.aliases?.includes('q'));
assert.equal(catalogEntries.find(entry => entry.kind === 'slash' && entry.name === 'switch')?.surface, 'prompt');
const draft = createDraft('/');
const identity = draft.id;
updateDraft(draft, '/plan');
assert.equal(draft.id, identity);
assert.notEqual(createDraft().id, identity);
const submission = captureDraft(draft);
updateDraft(draft, '/plan 后续输入');
assert.equal(acknowledgeDraft(submission), false);
assert.equal(draft.text, '/plan 后续输入');
console.log('命令补全匹配、去重、插入与键盘边界检查通过');
