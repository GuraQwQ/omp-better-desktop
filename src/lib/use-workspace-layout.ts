import { useEffect, useRef, useState } from 'react';
import { native, request } from './bridge';
import type { Json } from './types';
export function useWorkspaceLayout(key: string, value: Json, apply: (value: Json) => void, onError: (error: unknown) => void) {
  const callbacks = useRef({ apply, onError }); callbacks.current = { apply, onError };
  const [loaded, setLoaded] = useState('');
  useEffect(() => { if (!native || !key) return; setLoaded(''); let disposed = false; void request<Json | null>('layout.get', { key }).then(saved => { if (!disposed) { if (saved) callbacks.current.apply(saved); setLoaded(key); } }).catch(error => { if (!disposed) callbacks.current.onError(error); }); return () => { disposed = true; }; }, [key]);
  const serialized = JSON.stringify(value);
  useEffect(() => { if (loaded !== key || !key || !native) return; const timer = setTimeout(() => void request('layout.set', { key, value: JSON.parse(serialized) }).catch(callbacks.current.onError), 250); return () => clearTimeout(timer); }, [key, loaded, serialized]);
}
