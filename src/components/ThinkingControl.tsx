import { useEffect, useRef, useState } from 'react';
import { rpc } from '../lib/bridge';
import type { SessionView } from '../lib/types';
import type { Copy } from '../lib/i18n';
import Select from './Select';

export default function ThinkingControl({ session, t, onChange, onError }: { session: SessionView; t: Copy; onChange: (level: string) => void; onError: (error: unknown) => void }) {
  const modelKey = `${session.id}:${session.state.model?.provider}:${session.state.model?.id}`;
  const [available, setAvailable] = useState<{ key: string; levels: string[] }>();
  const [saving, setSaving] = useState(false);
  const currentModel = useRef(modelKey); currentModel.current = modelKey;
  useEffect(() => {
    let disposed = false;
    void rpc<{ levels: string[] }>(session.id, 'get_available_thinking_levels').then(value => { if (!disposed) setAvailable({ key: modelKey, levels: value.levels }); }).catch(error => { if (!disposed) onError(error); });
    return () => { disposed = true; };
  }, [modelKey]);
  const levels = available?.key === modelKey ? available.levels : Array.isArray(session.state.model?.thinking?.efforts) ? ['off', ...session.state.model.thinking.efforts] : [];
  if (levels.length < 2) return null;
  return <Select label={t.effort} disabled={saving} value={session.state.thinkingLevel ?? levels[1]} options={levels.map((value: string) => ({ value, label: t.effortLevels[value as keyof typeof t.effortLevels] ?? value }))} onChange={level => {
    setSaving(true);
    void rpc<{ level?: string }>(session.id, 'set_thinking_level', { level }).then(value => { if (currentModel.current === modelKey) onChange(value.level ?? level); }).catch(onError).finally(() => setSaving(false));
  }} />;
}
