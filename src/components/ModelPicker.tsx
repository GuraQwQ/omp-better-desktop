import { useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { Json, Language } from '../lib/types';
import type { Copy } from '../lib/i18n';
import { localizeError } from '../lib/i18n';

export default function ModelPicker({ models, loading, error, current, language, t, refresh, choose }: { models: Json[]; loading: boolean; error: string; current?: Json; language: Language; t: Copy; refresh: () => void; choose: (model: Json) => Promise<void> }) {
  const [query, setQuery] = useState(''), [selected, setSelected] = useState('');
  const pending = useRef(false);
  const filtered = models.filter(model => `${model.name} ${model.id} ${model.provider}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="model-picker ui-menu" role="dialog" aria-label={t.chooseModel}>
    {error && <p role="status">{localizeError(error, language)}</p>}
    <button type="button" className="quiet-button" disabled={loading} onClick={refresh}>{t.refresh}</button>
    <input autoFocus aria-label={t.search} placeholder={t.search} value={query} onChange={event => setQuery(event.target.value)} />
    <div>{filtered.map(model => { const key = `${model.provider}:${model.id}`; return <button key={key} disabled={!!selected} aria-pressed={current?.id === model.id && current?.provider === model.provider} onClick={() => {
      if (pending.current) return; pending.current = true; setSelected(key);
      void choose(model).finally(() => { pending.current = false; setSelected(''); });
    }}><strong>{model.name ?? model.id}</strong><small>{selected === key ? <LoaderCircle size={12} className="spin" aria-label={t.loading} /> : model.provider}</small></button>; })}
      {!models.length && <p role="status">{loading ? t.loading : t.noModels}</p>}
      {!!models.length && !filtered.length && <p>{t.noResults}</p>}
    </div>
  </div>;
}
