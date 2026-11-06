import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';

// 复制成功后图标短暂变成对勾；消息操作和代码块共用。
export default function CopyButton({ source, label, doneLabel, className = '', size = 13 }: { source: () => string; label: string; doneLabel: string; className?: string; size?: number }) {
  const [copiedAt, setCopiedAt] = useState(0);
  const done = copiedAt > 0;
  useEffect(() => { if (!done) return; const timer = setTimeout(() => setCopiedAt(0), 2500); return () => clearTimeout(timer); }, [copiedAt]);
  const name = done ? doneLabel : label;
  return <button type="button" className={`icon-button copy-feedback ${className}`} data-copied={done} title={name} aria-label={name} onClick={() => { navigator.clipboard.writeText(source()).then(() => setCopiedAt(Date.now()), () => {}); }}><Copy size={size} className="copy-idle" /><Check size={size} className="copy-done" /></button>;
}
