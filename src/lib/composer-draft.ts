export interface ComposerDraft<Image> { text: string; images: Image[]; revision: number }

export const createDraft = <Image,>(text = '', images: Image[] = []): ComposerDraft<Image> => ({ text, images, revision: 0 });

export function updateDraft<Image>(draft: ComposerDraft<Image>, text: string, images = draft.images) {
  draft.text = text;
  draft.images = images;
  draft.revision++;
}

export function captureDraft<Image>(draft: ComposerDraft<Image>) {
  return { draft, revision: draft.revision, text: draft.text, images: draft.images.slice() };
}

export function acknowledgeDraft<Image>(submission: ReturnType<typeof captureDraft<Image>>): boolean {
  if (submission.draft.revision !== submission.revision) return false;
  updateDraft(submission.draft, '', []);
  return true;
}
