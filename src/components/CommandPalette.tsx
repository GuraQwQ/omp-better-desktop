import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Command, Play, Search } from 'lucide-react';
import { onDesktopEvent, request, rpc } from '../lib/bridge';
import { rpcCommand } from '../lib/command-routes';
import type { Copy } from '../lib/i18n';
import type { CatalogEntry, Json } from '../lib/types';
import schema from '../generated/rpc-wire.schema.json';

export default function CommandPalette({ t, sessionId, cwd, close, send, onError, navigate, ensureSession, onSessionChanged }: { t: Copy; sessionId?: string; cwd: string; close: () => void; send: (text: string) => void; onError: (error: unknown) => void; navigate: (entry: CatalogEntry, args?: string) => boolean; ensureSession: () => Promise<string>; onSessionChanged: (id: string) => Promise<void> }) {
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<CatalogEntry | null>(null);
  const [args, setArgs] = useState('');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const [fields, setFields] = useState<Record<string, string>>({});
  const runningSession = useRef(sessionId);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    Promise.all([request('command.catalog'), sessionId ? rpc(sessionId, 'get_available_commands') : Promise.resolve({ commands: [] })]).then(([catalog, available]) => {
      const list = Array.isArray(catalog) ? catalog : catalog.commands ?? catalog.entries ?? [];
      const dynamic = available.commands ?? available;
      const merged = new Map<string, CatalogEntry>();
      for (const entry of [...list, ...dynamic]) { const kind = entry.kind ?? 'slash'; const key = `${kind}:${entry.name}`; merged.set(key, { ...merged.get(key), ...entry, kind }); }
      setEntries([...merged.values()]);
    }).catch(onError);
    return () => dialog.current?.close();
  }, []);
  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    void onDesktopEvent(({ sessionId: id, event }) => {
      if (id !== runningSession.current) return;
      if (selected?.name === 'btw' && event.type === 'btw_record') setOutput(JSON.stringify(event.record, null, 2));
      if (selected?.name === 'live_start' && ['live_phase', 'live_transcript', 'live_end'].includes(event.type)) setOutput(JSON.stringify(event, null, 2));
    }).then(unlisten => { if (disposed) unlisten(); else stop = unlisten; }).catch(onError);
    return () => { disposed = true; stop?.(); };
  }, [selected?.name]);
  const commandSpec = schema['x-rpc'].commands.find(command => command.name === selected?.name);
  const params: Json = commandSpec?.params ? (schema.$defs as Json)[commandSpec.params] : {};
  const properties: Record<string, Json> = params?.properties ?? {};
  const resolved = (field: Json): Json => field.$ref ? (schema.$defs as Json)[field.$ref.split('/').at(-1)] ?? field : field;
  const run = async () => {
    if (!selected) return;
    if (selected.kind !== 'cli' && selected.kind !== 'rpc') {
      if (navigate(selected, args)) { close(); return; }
      if (selected.kind === 'tool') { send(`Use the ${selected.name} tool to `); close(); return; }
      send(`/${selected.name.replace(/^\//, '')}${args ? ` ${args}` : ''}`); close(); return;
    }
    setBusy(true);
    try {
      if (selected.kind === 'rpc') {
        const id = sessionId ?? await ensureSession();
        runningSession.current = id;
        const payload: Json = {};
        for (const [key, raw] of Object.entries(fields)) {
          if (raw === '') continue;
          const field = resolved(properties[key]);
          payload[key] = field.type === 'string' || field.enum ? raw : JSON.parse(raw);
        }
        for (const key of params.required ?? []) if (!(key in payload)) throw Error(`${key}: ${t.commandArgs}`);
        const result = await rpc(id, selected.name, payload);
        setOutput(result === undefined || result === null ? t.emptyOutput : JSON.stringify(result, null, 2));
        await onSessionChanged(id);
        return;
      }
      let argumentList: string[] = [];
      if (args.trim()) {
        if (args.trim().startsWith('[')) argumentList = JSON.parse(args);
        else argumentList = args.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map(arg => arg.replace(/^(["'])(.*)\1$/, '$2')) ?? [];
      }
      const result = await request<Json>('command.cli', { cwd, args: [selected.name, ...argumentList] });
      setOutput([result.stdout, result.stderr].filter(Boolean).join('\n') || t.emptyOutput);
    } catch (error) { onError(error); } finally { setBusy(false); }
  };
  const filtered = entries.filter(entry => `${entry.name} ${entry.description ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  const current = Math.min(active, Math.max(filtered.length - 1, 0));
  useEffect(() => { dialog.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' }); }, [current, filtered.length]);
  const selectEntry = (entry: CatalogEntry) => {
    const target = rpcCommand(entry);
    setSelected(target ? { ...entry, name: target, kind: 'rpc', surface: 'rpc' } : entry);
    setArgs(''); setFields({}); setOutput('');
  };
  return <dialog className="command-dialog" ref={dialog} onCancel={close} onClick={e => { if (e.target === dialog.current) close(); }}>
    <div className="command-inner"><header><Search size={18} /><input autoFocus role="combobox" aria-expanded={!selected} aria-controls="command-listbox" aria-activedescendant={!selected && filtered.length ? `command-option-${current}` : undefined} aria-label={t.searchCommands} placeholder={t.searchCommands} value={query} onChange={e => { setQuery(e.target.value); setSelected(null); setActive(0); }} onKeyDown={e => { if (selected || !filtered.length || e.nativeEvent.isComposing) return; if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setActive((current + (e.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length); } else if (e.key === 'Enter') { e.preventDefault(); selectEntry(filtered[current]); } }} /><button className="keycap" onClick={close}>Esc</button></header>
      {selected ? <div className="command-details"><button className="quiet-button" onClick={() => setSelected(null)}>← {t.commands}</button><h2>{selected.kind === 'cli' ? 'omp ' : selected.kind === 'rpc' || selected.kind === 'tool' ? '' : '/'}{selected.name}</h2><p>{selected.description}</p>{selected.kind === 'rpc' ? Object.entries(properties).map(([key, definition]) => {
        const field = resolved(definition);
        const enumValues = field.enum ?? field.anyOf?.filter((item: Json) => item.const !== undefined).map((item: Json) => item.const);
        return <label key={key}>{key}{params.required?.includes(key) ? ' *' : ''}{enumValues ? <select value={fields[key] ?? ''} onChange={event => setFields(previous => ({ ...previous, [key]: event.target.value }))}><option value="">—</option>{enumValues.map((value: string) => <option key={value} value={value}>{value}</option>)}</select> : field.type === 'boolean' ? <select value={fields[key] ?? ''} onChange={event => setFields(previous => ({ ...previous, [key]: event.target.value }))}><option value="">—</option><option value="true">{t.yes}</option><option value="false">{t.no}</option></select> : <input value={fields[key] ?? ''} type={field.type === 'number' || field.type === 'integer' ? 'number' : 'text'} placeholder={field.description ?? (['object', 'array'].includes(field.type) ? 'JSON' : '')} onChange={event => setFields(previous => ({ ...previous, [key]: event.target.value }))} />}</label>;
      }) : <label>{t.commandArgs}<input value={args} onChange={e => setArgs(e.target.value)} placeholder={selected.input?.hint ?? selected.usage ?? ''} onKeyDown={e => { if (e.key === 'Enter') void run(); }} /></label>}<button className="primary-button" disabled={busy} onClick={run}><Play size={14} />{busy ? t.loading : t.execute}</button>{output && <pre className="command-output">{output}</pre>}</div> : <div className="command-results" id="command-listbox" role="listbox" aria-label={t.commands}>{filtered.length ? filtered.map((entry, index) => <button key={`${entry.kind}:${entry.name}:${index}`} id={`command-option-${index}`} role="option" aria-selected={index === current} className={index === current ? 'is-active' : undefined} tabIndex={-1} onClick={() => selectEntry(entry)}><Command size={16} /><span><strong>{entry.kind === 'cli' ? 'omp ' : entry.kind === 'rpc' || entry.kind === 'tool' ? '' : '/'}{entry.name}</strong><small>{entry.description || t.commandKinds[entry.kind as keyof Copy["commandKinds"]] || entry.kind}</small></span><ArrowUpRight size={14} /></button>) : <p className="panel-empty">{t.noResults}</p>}</div>}
      <footer>{t.commandHelp}<span>{filtered.length}</span></footer>
    </div>
  </dialog>;
}
