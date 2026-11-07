export function taskCardSummary(text: string): string {
  return text.replace(/```[\s\S]*?(?:```|$)/g, '').trim().slice(0, 500);
}
