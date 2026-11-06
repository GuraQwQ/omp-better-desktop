export type ComposerAttachment =
  | { type: 'image'; name: string; data: string; mimeType: string; path?: string }
  | { type: 'file'; name: string; path: string; kind: 'file' | 'folder'; managed?: boolean };

export function attachmentPayload(text: string, attachments: ComposerAttachment[]) {
  const references = attachments.filter(attachment => attachment.type === 'file').map(attachment => `@${JSON.stringify(attachment.path!.replaceAll('\\', '/'))}`);
  return {
    message: [text, ...references].filter(Boolean).join('\n\n'),
    images: attachments.filter(attachment => attachment.type === 'image').map(({ data, mimeType }) => ({ type: 'image' as const, data, mimeType })),
  };
}

export function fileData(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error(`无法读取附件：${file.name}`));
    reader.readAsDataURL(file);
  });
}
