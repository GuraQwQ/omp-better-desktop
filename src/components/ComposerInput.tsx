import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Command, File, Puzzle, Sparkles } from 'lucide-react';
import { request } from '../lib/bridge';
import { fileMentionAt, insertFileMention, matchingFiles } from '../lib/file-mentions';
import type { Copy } from '../lib/i18n';
import { completionKey, composingInput, insertSlashCommand, matchingSlashCommands, slashCommandAt, type SlashCompletion } from '../lib/slash-completions';
import type { CatalogEntry, Language } from '../lib/types';
import './composer-input.css';
import MotionPresence from './MotionPresence';

export default function ComposerInput({ value, onChange, onSend, onRecall, disabled, cwd, t, textareaRef, commands = [], language, onCommandsOpen }: {
  value: string; onChange: (text: string) => void; onSend: () => void; onRecall?: () => void; disabled: boolean; cwd: string; t: Copy; textareaRef: RefObject<HTMLTextAreaElement | null>;
  commands?: CatalogEntry[]; language?: Language; onCommandsOpen?: () => void;
}) {
  const [caret, setCaret] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(0);
  const [listing, setListing] = useState<{ cwd: string; files: string[] } | null>(null);
  const [error, setError] = useState('');
  const [composing, setComposing] = useState(false);
  const composition = useRef(false);
  const onOpen = useRef(onCommandsOpen);
  onOpen.current = onCommandsOpen;
  const activeOption = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const available = !dismissed && !disabled && !composing;
  const mention = available && cwd ? fileMentionAt(value, caret) : null;
  const slash = available && !mention ? slashCommandAt(value, caret) : null;
  const uiLanguage = language ?? (/[\u3400-\u9fff]/.test(t.prompt) ? 'zh' : 'en');
  const commandItems = slash ? matchingSlashCommands(commands, slash.query, uiLanguage) : [];
  const files = listing?.cwd === cwd ? matchingFiles(listing.files, mention?.query ?? '') : [];
  const mentionOpen = !!mention;
  const slashOpen = !!slash;
  const open = mentionOpen || slashOpen;
  const count = mentionOpen ? files.length : commandItems.length;
  const groupLabels = uiLanguage === 'zh' ? { commands: '命令', skills: '技能', extensions: '扩展' } : { commands: 'Commands', skills: 'Skills', extensions: 'Extensions' };
  useEffect(() => {
    if (!mentionOpen) return;
    let cancelled = false;
    setError(''); setListing(null);
    void request<string[]>('workspace.files', { cwd }).then(files => { if (!cancelled) setListing({ cwd, files }); }).catch(error => { if (!cancelled) setError(error instanceof Error ? error.message : String(error)); });
    return () => { cancelled = true; };
  }, [cwd, mentionOpen]);
  useEffect(() => { if (slashOpen) onOpen.current?.(); }, [slashOpen]);
  useEffect(() => { setActive(0); }, [mention?.query, slash?.query, cwd]);
  useEffect(() => { setActive(previous => Math.min(previous, Math.max(0, count - 1))); }, [count]);
  useEffect(() => { activeOption.current?.scrollIntoView({ block: 'nearest' }); }, [active, count]);
  const choose = (path: string) => {
    if (!mention) return;
    const next = insertFileMention(value, mention, path);
    onChange(next.text); setDismissed(true);
    requestAnimationFrame(() => { textareaRef.current?.focus(); textareaRef.current?.setSelectionRange(next.caret, next.caret); setCaret(next.caret); });
  };
  const chooseCommand = (item: SlashCompletion) => {
    if (!slash) return;
    const next = insertSlashCommand(value, slash, item.token);
    onChange(next.text); setDismissed(true);
    requestAnimationFrame(() => { textareaRef.current?.focus(); textareaRef.current?.setSelectionRange(next.caret, next.caret); setCaret(next.caret); });
  };
  return <div className="composer-input" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDismissed(true); }}>
    <MotionPresence open={mentionOpen}><div className="file-mention-menu ui-menu"><div className="file-mention-heading">{t.mentionFiles}</div><div id={menuId} role="listbox" aria-label={t.mentionFiles}>
      {files.map((path, index) => <button type="button" key={path} id={`${menuId}-${index}`} role="option" aria-selected={index === active} ref={index === active ? activeOption : undefined} className={index === active ? 'is-active' : ''} onPointerDown={event => event.preventDefault()} onPointerMove={() => setActive(index)} onClick={() => choose(path)}><File size={14} /><span>{path}</span></button>)}
      {!files.length && <p role={error ? 'alert' : 'status'}>{error || (listing?.cwd === cwd ? t.noResults : t.loading)}</p>}
    </div></div></MotionPresence>
    <MotionPresence open={slashOpen}><div className="file-mention-menu slash-completion-menu ui-menu"><div className="file-mention-heading">{uiLanguage === 'zh' ? '命令与技能' : 'Commands & skills'}<span>↑ ↓ · Tab ↵</span></div><div id={menuId} role="listbox" aria-label={uiLanguage === 'zh' ? '命令与技能' : 'Commands & skills'}>
      {commandItems.map((item, index) => { const Icon = item.group === 'skills' ? Sparkles : item.group === 'extensions' ? Puzzle : Command; return <button type="button" key={item.token} id={`${menuId}-${index}`} role="option" aria-selected={index === active} ref={index === active ? activeOption : undefined} className={index === active ? 'is-active' : ''} onPointerDown={event => event.preventDefault()} onPointerMove={() => setActive(index)} onClick={() => chooseCommand(item)}><Icon size={14} /><span className="slash-completion-copy"><strong>/{item.token}</strong>{item.description && <small>{item.description}</small>}</span><span className="slash-completion-kind">{groupLabels[item.group]}</span></button>; })}
      {!commandItems.length && <p role="status">{t.noResults}</p>}
    </div></div></MotionPresence>
    <textarea ref={textareaRef} disabled={disabled} rows={2} value={value} aria-label={t.prompt} placeholder={t.prompt} title={t.mentionHint} aria-autocomplete="list" aria-controls={open ? menuId : undefined} aria-activedescendant={open && count ? `${menuId}-${Math.min(active, count - 1)}` : undefined}
      onChange={event => { onChange(event.target.value); setCaret(event.target.selectionStart); setDismissed(false); }}
      onSelect={event => setCaret(event.currentTarget.selectionStart)} onFocus={event => { setCaret(event.currentTarget.selectionStart); setDismissed(false); }}
      onCompositionStart={() => { composition.current = true; setComposing(true); }}
      onCompositionEnd={event => { composition.current = false; setComposing(false); setCaret(event.currentTarget.selectionStart); }}
      onKeyDown={event => {
        if (composingInput(event.nativeEvent, composition.current)) return;
        const action = open ? completionKey(event, count) : undefined;
        if (action) {
          event.preventDefault(); event.stopPropagation();
          if (action === 'dismiss') setDismissed(true);
          else if (action === 'choose') { if (mentionOpen) choose(files[active] ?? files[0]); else chooseCommand(commandItems[active] ?? commandItems[0]); }
          else if (count) setActive(previous => (previous + (action === 'next' ? 1 : -1) + count) % count);
        }
        else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); onSend(); }
        else if (event.key === 'ArrowUp' && !value && onRecall) { event.preventDefault(); onRecall(); }
      }} />
  </div>;
}
