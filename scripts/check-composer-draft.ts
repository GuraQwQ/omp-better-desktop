import assert from 'node:assert/strict';
import { acknowledgeDraft, captureDraft, createDraft, updateDraft } from '../src/lib/composer-draft';
import { createMessageReference } from '../src/lib/references';

const reference = createMessageReference({ sessionId: 'source' }, { id: 'message', role: 'assistant', content: '材料' });
const draft = createDraft('问题', ['附件'], [reference]);
const submission = captureDraft(draft);
updateDraft(draft, '继续编辑', draft.attachments, []);
assert.equal(acknowledgeDraft(submission), false);
assert.equal(draft.text, '继续编辑');
assert.equal(submission.references[0], reference);
updateDraft(draft, '再次发送', ['附件'], [reference]);
assert.equal(acknowledgeDraft(captureDraft(draft)), true);
assert.deepEqual([draft.text, draft.attachments, draft.references], ['', [], []]);
assert.equal(submission.references.length, 1);
console.log('引用草稿快照与发送确认检查通过');
