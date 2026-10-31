import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';

// 复制成功后图标短暂变成对勾；消息操作和代码块共用。
export default function CopyButton({ source, label, doneLabel, className = '', size = 13 }: { source: () => string; label: string; doneLabel: string; className?: string; size?: number }) {
  const [done, setDone] = useState(false);
  useEffect(() => { if (!done) return; const timer = setTimeout(() => setDone(false), 1500); return () => clearTimeout(timer); }, [done]);
  const name = done ? doneLabel : label;
  return <button type="button" className={`icon-button ${className}`} title={name} aria-label={name} onClick={() => { navigator.clipboard.writeText(source()).then(() => setDone(true), () => {}); }}>{done ? <Check size={size} /> : <Copy size={size} />}</button>;
}
