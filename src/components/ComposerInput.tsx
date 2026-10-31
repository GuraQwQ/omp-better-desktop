import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { File } from 'lucide-react';
import { request } from '../lib/bridge';
import { fileMentionAt, insertFileMention, matchingFiles } from '../lib/file-mentions';
import type { Copy } from '../lib/i18n';
import './composer-input.css';

export default function ComposerInput({ value, onChange, onSend, onRecall, disabled, cwd, t, textareaRef }: {
  value: string; onChange: (text: string) => void; onSend: () => void; onRecall?: () => void; disabled: boolean; cwd: string; t: Copy; textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const [caret, setCaret] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(0);
  const [listing, setListing] = useState<{ cwd: string; files: string[] } | null>(null);
  const [error, setError] = useState('');
  const activeOption = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const mention = !dismissed && !disabled && cwd ? fileMentionAt(value, caret) : null;
  const files = listing?.cwd === cwd ? matchingFiles(listing.files, mention?.query ?? '') : [];
  const open = !!mention;
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(''); setListing(null);
    void request<string[]>('workspace.files', { cwd }).then(files => { if (!cancelled) setListing({ cwd, files }); }).catch(error => { if (!cancelled) setError(error instanceof Error ? error.message : String(error)); });
    return () => { cancelled = true; };
  }, [cwd, open]);
  useEffect(() => { setActive(0); }, [mention?.query, cwd]);
  useEffect(() => { activeOption.current?.scrollIntoView({ block: 'nearest' }); }, [active]);
  const choose = (path: string) => {
    if (!mention) return;
    const next = insertFileMention(value, mention, path);
    onChange(next.text); setDismissed(true);
    requestAnimationFrame(() => { textareaRef.current?.focus(); textareaRef.current?.setSelectionRange(next.caret, next.caret); setCaret(next.caret); });
  };
  return <div className="composer-input" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDismissed(true); }}>
    {open && <div className="file-mention-menu ui-menu"><div className="file-mention-heading">{t.mentionFiles}</div><div id={menuId} role="listbox" aria-label={t.mentionFiles}>
      {files.map((path, index) => <button type="button" key={path} id={`${menuId}-${index}`} role="option" aria-selected={index === active} ref={index === active ? activeOption : undefined} className={index === active ? 'is-active' : ''} onPointerDown={event => event.preventDefault()} onPointerMove={() => setActive(index)} onClick={() => choose(path)}><File size={14} /><span>{path}</span></button>)}
      {!files.length && <p role={error ? 'alert' : 'status'}>{error || (listing?.cwd === cwd ? t.noResults : t.loading)}</p>}
    </div></div>}
    <textarea ref={textareaRef} disabled={disabled} rows={2} value={value} aria-label={t.prompt} placeholder={t.prompt} title={t.mentionHint} aria-autocomplete="list" aria-controls={open ? menuId : undefined} aria-activedescendant={open && files[active] ? `${menuId}-${active}` : undefined}
      onChange={event => { onChange(event.target.value); setCaret(event.target.selectionStart); setDismissed(false); }}
      onSelect={event => setCaret(event.currentTarget.selectionStart)} onFocus={event => { setCaret(event.currentTarget.selectionStart); setDismissed(false); }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (open && ['ArrowDown', 'ArrowUp', 'Escape'].includes(event.key)) {
          event.preventDefault(); event.stopPropagation();
          if (event.key === 'Escape') setDismissed(true);
          else if (files.length) setActive(previous => (previous + (event.key === 'ArrowDown' ? 1 : -1) + files.length) % files.length);
        } else if (open && files.length && (event.key === 'Tab' || event.key === 'Enter' && !event.shiftKey)) { event.preventDefault(); choose(files[active] ?? files[0]); }
        else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); onSend(); }
        else if (event.key === 'ArrowUp' && !value && onRecall) { event.preventDefault(); onRecall(); }
      }} />
  </div>;
}
