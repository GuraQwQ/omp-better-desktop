import { useEffect, useRef, useState } from 'react';
import { request } from '../../lib/bridge';
import type { Json, SessionView } from '../../lib/types';

export default function Notes({ session, selection, selectionNonce, onReference, onError }: { session?: SessionView; selection?: string; selectionNonce?: number; onReference: (text: string) => void; onError: (error: unknown) => void }) {
  const key = `notes:${session?.path ?? session?.id ?? 'scratch'}`;
  const [notes, setNotes] = useState<Json[]>([]);
  const [quote, setQuote] = useState(selection ?? '');
  const [note, setNote] = useState('');
  const [ready, setReady] = useState(false);
  const [working, setWorking] = useState(false);
  const generation = useRef(0);
  const draftRevision = useRef(0);
  const errorHandler = useRef(onError); errorHandler.current = onError;
  useEffect(() => {
    const scope = ++generation.current;
    setReady(false); setNotes([]); setWorking(false); setQuote(selection ?? ''); setNote(''); draftRevision.current++;
    void request<Json[] | null>('desktop.state.get', { key }).then(value => {
      if (scope === generation.current) { setNotes(value ?? []); setReady(true); }
    }).catch(error => { if (scope === generation.current) errorHandler.current(error); });
    return () => { generation.current++; };
  }, [key]);
  useEffect(() => { if (selection) { draftRevision.current++; setQuote(selection); } }, [selection, selectionNonce]);
  const save = async (items: Json[]) => {
    const scope = generation.current; setWorking(true);
    try {
      await request('desktop.state.set', { key, value: items });
      if (scope !== generation.current) return false;
      setNotes(items); return true;
    } catch (error) { if (scope === generation.current) errorHandler.current(error); return false; }
    finally { if (scope === generation.current) setWorking(false); }
  };
  return <>
    <label className="desktop-field">引用内容<textarea rows={4} value={quote} disabled={working} onChange={event => { draftRevision.current++; setQuote(event.target.value); }} /></label>
    <label className="desktop-field">批注<textarea rows={3} value={note} disabled={working} onChange={event => { draftRevision.current++; setNote(event.target.value); }} /></label>
    <button className="primary-button" disabled={!ready || working || !quote.trim()} onClick={() => { const revision = draftRevision.current; void save([...notes, { id: crypto.randomUUID(), quote, note, createdAt: Date.now() }]).then(saved => { if (saved && revision === draftRevision.current) { setQuote(''); setNote(''); } }); }}>保存批注</button>
    {notes.map(item => <article className="desktop-record" key={item.id}><blockquote>{item.quote}</blockquote><p>{item.note}</p><div className="desktop-tool-actions"><button className="quiet-button" onClick={() => onReference(`${item.quote}${item.note ? `\n\n批注：${item.note}` : ''}`)}>引用到草稿</button><button className="quiet-button" disabled={!ready || working} onClick={() => void save(notes.filter(note => note.id !== item.id))}>删除</button></div></article>)}
  </>;
}
