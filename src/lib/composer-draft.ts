export interface ComposerDraft<Attachment> { id: string; text: string; attachments: Attachment[]; revision: number }

export const createDraft = <Attachment,>(text = '', attachments: Attachment[] = []): ComposerDraft<Attachment> => ({ id: crypto.randomUUID(), text, attachments, revision: 0 });

export function updateDraft<Attachment>(draft: ComposerDraft<Attachment>, text: string, attachments = draft.attachments) {
  draft.text = text;
  draft.attachments = attachments;
  draft.revision++;
}

export function captureDraft<Attachment>(draft: ComposerDraft<Attachment>) {
  return { draft, revision: draft.revision, text: draft.text, attachments: draft.attachments.slice() };
}

export function acknowledgeDraft<Attachment>(submission: ReturnType<typeof captureDraft<Attachment>>): boolean {
  if (submission.draft.revision !== submission.revision) return false;
  updateDraft(submission.draft, '', []);
  return true;
}
