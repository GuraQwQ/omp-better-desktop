export function applyModelSelection(current: string[], discovered: { id: string }[], selected: ReadonlySet<string>): string[] {
  const catalog = new Set(discovered.map(model => model.id));
  return [...new Set([...current.filter(id => !catalog.has(id) || selected.has(id)), ...discovered.filter(model => selected.has(model.id)).map(model => model.id)])];
}
