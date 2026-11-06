import { useEffect, useState, type ReactNode } from 'react';
import { motionTiming } from '../lib/motion';

export default function Collapse({ open, children, id }: { open: boolean; children: ReactNode; id?: string }) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) { setMounted(true); return; }
    const timer = setTimeout(() => setMounted(false), motionTiming().layout + 50);
    return () => clearTimeout(timer);
  }, [open]);
  return <div id={id} className={`collapse-grid${open ? ' is-open' : ''}`} inert={!open} aria-hidden={!open} onTransitionEnd={event => { if (event.target === event.currentTarget && event.propertyName === 'grid-template-rows' && !open) setMounted(false); }}><div className="collapse-inner">{mounted && children}</div></div>;
}
