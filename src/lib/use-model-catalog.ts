import { useCallback, useEffect, useRef, useState } from 'react';
import { modelCatalog } from './model-catalog';
import type { Json } from './types';

export function useModelCatalog(key: string, cwd: string, enabled: boolean) {
  const [models, setModels] = useState<Json[]>(() => modelCatalog.peek(key)?.models ?? []);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const revision = useRef(0), activeKey = useRef(key); activeKey.current = key;
  const load = useCallback(async (refresh = false) => {
    const current = ++revision.current, generation = modelCatalog.generation;
    const valid = () => current === revision.current && key === activeKey.current && generation === modelCatalog.generation;
    const apply = (result: Awaited<ReturnType<typeof modelCatalog.load>>) => { if (valid()) { setModels(result.models); setError(result.warning ?? ''); } };
    setError(''); setLoading(true);
    const hadSnapshot = !!modelCatalog.peek(key);
    try {
      apply(await modelCatalog.load(key, cwd, refresh));
      if (!refresh && !hadSnapshot && valid()) void modelCatalog.load(key, cwd, true).then(apply).catch(value => { if (valid()) setError(String(value)); });
    } catch (value) { if (valid()) setError(value instanceof Error ? value.message : String(value)); }
    finally { if (current === revision.current && key === activeKey.current) setLoading(false); }
  }, [key, cwd]);
  useEffect(() => {
    revision.current++; setModels(modelCatalog.peek(key)?.models ?? []); setError(''); setLoading(false);
    if (enabled) void load();
    return () => { revision.current++; };
  }, [key, enabled, load]);
  return { models, loading, error, load };
}
