import { useEffect, useRef, useState } from 'react';

export function GenUIMath({ expression, display }: { expression: string; display?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setError('');
    void Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([katex]) => {
      if (!cancelled && ref.current) katex.default.render(expression, ref.current, { displayMode: !!display, throwOnError: true, trust: false });
    }).catch(error => { if (!cancelled) setError(String(error)); });
    return () => { cancelled = true; };
  }, [expression, display]);
  return <span className="genui-math" ref={ref}>{error ? <span role="alert">{error}</span> : expression}</span>;
}

export function GenUIMap({ longitude, latitude, zoom, label }: { longitude: number; latitude: number; zoom?: number; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<import('maplibre-gl').Map | undefined>(undefined);
  const marker = useRef<import('maplibre-gl').Marker | undefined>(undefined);
  const [error, setError] = useState('');
  const location = useRef({ longitude, latitude, zoom, label });
  location.current = { longitude, latitude, zoom, label };
  useEffect(() => {
    let cancelled = false;
    void Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')]).then(([module]) => {
      if (cancelled || !ref.current) return;
      const current = location.current;
      const view = new module.Map({ container: ref.current, center: [current.longitude, current.latitude], zoom: current.zoom ?? 10, style: { version: 8, sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } }, layers: [{ id: 'osm', type: 'raster', source: 'osm' }] } });
      map.current = view;
      marker.current = new module.Marker().setLngLat([current.longitude, current.latitude]).addTo(view);
      if (current.label) marker.current.setPopup(new module.Popup().setText(current.label));
      view.addControl(new module.NavigationControl());
      view.on('error', event => { if (!cancelled) setError(event.error.message); });
    }).catch(error => { if (!cancelled) setError(String(error)); });
    return () => { cancelled = true; marker.current?.remove(); map.current?.remove(); map.current = undefined; };
  }, []);
  useEffect(() => { map.current?.jumpTo({ center: [longitude, latitude], zoom: zoom ?? 10 }); marker.current?.setLngLat([longitude, latitude]); }, [longitude, latitude, zoom]);
  return <figure className="genui-map"><div ref={ref} aria-label={label || '地图'} />{label && <figcaption>{label}</figcaption>}{error && <p role="alert">{error}</p>}</figure>;
}
