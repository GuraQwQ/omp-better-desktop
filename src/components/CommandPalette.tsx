import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Command, Play, Search } from 'lucide-react';
import { request, rpc } from '../lib/bridge';
import type { Copy } from '../lib/i18n';
import type { CatalogEntry, Json } from '../lib/types';
import schema from '../generated/rpc-wire.schema.json';

export default function CommandPalette({ t, sessionId, cwd, close, send, onError, navigate, ensureSession }: { t: Copy; sessionId?: string; cwd: string; close: () => void; send: (text: string) => void; onError: (error: unknown) => void; navigate: (entry: CatalogEntry) => boolean; ensureSession: () => Promise<string> }) {
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<CatalogEntry | null>(null);
  const [args, setArgs] = useState('');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    Promise.all([request('command.catalog'), sessionId ? rpc(sessionId, 'get_available_commands') : Promise.resolve({ commands: [] })]).then(([catalog, available]) => {
      const list = Array.isArray(catalog) ? catalog : catalog.commands ?? catalog.entries ?? [];
      const dynamic = available.commands ?? available;
      const merged = new Map<string, CatalogEntry>();
      for (const entry of [...list, ...dynamic]) { const key = `${entry.kind ?? 'slash'}:${entry.name}`; merged.set(key, { ...merged.get(key), ...entry }); }
      setEntries([...merged.values()]);
    }).catch(onError);
    return () => dialog.current?.close();
  }, []);
  const commandSpec = schema['x-rpc'].commands.find(command => command.name === selected?.name);
  const params: Json = commandSpec?.params ? (schema.$defs as Json)[commandSpec.params] : {};
  const properties: Record<string, Json> = params?.properties ?? {};
  const resolved = (field: Json): Json => field.$ref ? (schema.$defs as Json)[field.$ref.split('/').at(-1)] ?? field : field;
  const run = async () => {
    if (!selected) return;
    if (selected.kind !== 'cli' && selected.kind !== 'rpc') {
      if (navigate(selected)) { close(); return; }
      if (selected.kind === 'tool') { send(`Use the ${selected.name} tool to `); close(); return; }
      send(`/${selected.name.replace(/^\//, '')}${args ? ` ${args}` : ''}`); close(); return;
    }
    setBusy(true);
    try {
      if (selected.kind === 'rpc') {
        const id = sessionId ?? await ensureSession();
        const payload: Json = {};
        for (const [key, raw] of Object.entries(fields)) {
          if (raw === '') continue;
          const field = resolved(properties[key]);
          payload[key] = field.type === 'string' || field.enum ? raw : JSON.parse(raw);
        }
        for (const key of params.required ?? []) if (!(key in payload)) throw Error(`${key}: ${t.commandArgs}`);
        const result = await rpc(id, selected.name, payload);
        setOutput(result === undefined || result === null ? t.emptyOutput : JSON.stringify(result, null, 2));
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
  const selectEntry = (entry: CatalogEntry) => {
    const route: Record<string, string> = { btw: 'btw', goal: 'goal', 'guided-goal': 'goal', live: 'live_start', queue: 'follow_up' };
    const target = entry.kind === 'slash' ? route[entry.name] : undefined;
    setSelected(target ? { ...entry, name: target, kind: 'rpc', surface: 'rpc' } : entry);
    setArgs(''); setFields({}); setOutput('');
  };
  return <dialog className="command-dialog" ref={dialog} onCancel={close} onClick={e => { if (e.target === dialog.current) close(); }}>
    <div className="command-inner"><header><Search size={18} /><input autoFocus aria-label={t.searchCommands} placeholder={t.searchCommands} value={query} onChange={e => { setQuery(e.target.value); setSelected(null); }} /><button className="keycap" onClick={close}>Esc</button></header>
      {selected ? <div className="command-details"><button className="quiet-button" onClick={() => setSelected(null)}>← {t.commands}</button><h2>{selected.kind === 'cli' ? 'omp ' : selected.kind === 'rpc' || selected.kind === 'tool' ? '' : '/'}{selected.name}</h2><p>{selected.description}</p>{selected.kind === 'rpc' ? Object.entries(properties).map(([key, definition]) => {
        const field = resolved(definition);
        const enumValues = field.enum ?? field.anyOf?.filter((item: Json) => item.const !== undefined).map((item: Json) => item.const);
        return <label key={key}>{key}{params.required?.includes(key) ? ' *' : ''}{enumValues ? <select value={fields[key] ?? ''} onChange={event => setFields(previous => ({ ...previous, [key]: event.target.value }))}><option value="">—</option>{enumValues.map((value: string) => <option key={value} value={value}>{value}</option>)}</select> : field.type === 'boolean' ? <select value={fields[key] ?? ''} onChange={event => setFields(previous => ({ ...previous, [key]: event.target.value }))}><option value="">—</option><option value="true">true</option><option value="false">false</option></select> : <input value={fields[key] ?? ''} type={field.type === 'number' || field.type === 'integer' ? 'number' : 'text'} placeholder={field.description ?? (['object', 'array'].includes(field.type) ? 'JSON' : '')} onChange={event => setFields(previous => ({ ...previous, [key]: event.target.value }))} />}</label>;
      }) : <label>{t.commandArgs}<input value={args} onChange={e => setArgs(e.target.value)} placeholder={selected.input?.hint ?? selected.usage ?? ''} onKeyDown={e => { if (e.key === 'Enter') void run(); }} /></label>}<button className="primary-button" disabled={busy} onClick={run}><Play size={14} />{busy ? t.loading : t.execute}</button>{output && <pre className="command-output">{output}</pre>}</div> : <div className="command-results">{filtered.length ? filtered.map((entry, index) => <button key={`${entry.kind}:${entry.name}:${index}`} onClick={() => selectEntry(entry)}><Command size={16} /><span><strong>{entry.kind === 'cli' ? 'omp ' : entry.kind === 'rpc' || entry.kind === 'tool' ? '' : '/'}{entry.name}</strong><small>{entry.description || entry.kind}</small></span><ArrowUpRight size={14} /></button>) : <p className="panel-empty">{t.noResults}</p>}</div>}
      <footer>{t.commandHelp}<span>{filtered.length}</span></footer>
    </div>
  </dialog>;
}
