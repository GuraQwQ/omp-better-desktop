import { cloneElement, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { motionTiming } from '../lib/motion';

type SurfaceProps = { exiting?: boolean; inert?: boolean; 'aria-hidden'?: boolean; 'data-exiting'?: boolean };
export default function MotionPresence({ open, children }: { open: boolean; children: ReactElement<SurfaceProps> }) {
  const [present, setPresent] = useState(open);
  const last = useRef(children);
  if (open) last.current = children;
  useLayoutEffect(() => {
    if (open) { setPresent(true); return; }
    const timer = setTimeout(() => setPresent(false), motionTiming().exit);
    return () => clearTimeout(timer);
  }, [open]);
  if (!open && !present) return null;
  const element = open ? children : last.current;
  return cloneElement(element, typeof element.type === 'string'
    ? { 'data-exiting': !open || undefined, inert: !open, 'aria-hidden': !open || undefined }
    : { exiting: !open });
}
