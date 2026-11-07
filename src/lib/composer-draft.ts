import type { ConversationReference } from './references';

export interface ComposerDraft<Attachment> { id: string; text: string; attachments: Attachment[]; references: ConversationReference[]; revision: number }

export const createDraft = <Attachment,>(text = '', attachments: Attachment[] = [], references: ConversationReference[] = []): ComposerDraft<Attachment> => ({ id: crypto.randomUUID(), text, attachments, references, revision: 0 });

export function updateDraft<Attachment>(draft: ComposerDraft<Attachment>, text: string, attachments = draft.attachments, references = draft.references) {
  draft.text = text;
  draft.attachments = attachments;
  draft.references = references;
  draft.revision++;
}

export function captureDraft<Attachment>(draft: ComposerDraft<Attachment>) {
  return { draft, revision: draft.revision, text: draft.text, attachments: draft.attachments.slice(), references: draft.references.slice() };
}

export function acknowledgeDraft<Attachment>(submission: ReturnType<typeof captureDraft<Attachment>>): boolean {
  if (submission.draft.revision !== submission.revision) return false;
  updateDraft(submission.draft, '', [], []);
  return true;
}
