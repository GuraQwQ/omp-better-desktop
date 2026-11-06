interface ConfiguredProvider { id: string; models: { id: string }[] }

export function filterProviderModels<T extends { provider: string; id: string }>(models: T[], providers: ConfiguredProvider[]): T[] {
  const selected = new Map(providers.map(provider => [provider.id, new Set(provider.models.map(model => model.id))]));
  return models.filter(model => !selected.has(model.provider) || selected.get(model.provider)!.has(model.id));
}

export function applyModelSelection(current: string[], discovered: { id: string }[], selected: ReadonlySet<string>): string[] {
  const catalog = new Set(discovered.map(model => model.id));
  return [...new Set([...current.filter(id => !catalog.has(id) || selected.has(id)), ...discovered.filter(model => selected.has(model.id)).map(model => model.id)])];
}
