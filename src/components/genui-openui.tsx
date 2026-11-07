import { action, createLibrary, defineComponent, FormNameContext, reactive, useFormName, useIsStreaming, useStateField, useTriggerAction, type ActionPlan, type ComponentRenderProps } from '@openuidev/react-lang';
import { lazy, Suspense, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { z } from 'zod/v4';
import { GENUI_COMPONENTS, exposedGenUIFields, type GenUIConfiguration, type GenUIField } from '../lib/genui-config';
import { request } from '../lib/bridge';
import { safeGenUIUrl } from '../lib/genui';

const MathView = lazy(() => import('./genui-heavy').then(module => ({ default: module.GenUIMath })));
const MapView = lazy(() => import('./genui-heavy').then(module => ({ default: module.GenUIMap })));
const clamp = (value: unknown, fallback: number, minimum = 0, maximum = 64) => typeof value === 'number' && Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;

function schema(field: GenUIField, config: GenUIConfiguration): z.ZodType {
  let value: z.ZodType;
  switch (field.type) {
    case 'children': value = z.array(z.any()); break;
    case 'strings': value = z.array(z.string()); break;
    case 'numbers': value = z.array(z.number()); break;
    case 'rows': value = z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))); break;
    case 'number': value = z.number(); break;
    case 'boolean': value = z.boolean(); break;
    case 'reactiveString': value = z.string(); break;
    case 'reactiveNumber': value = z.number(); break;
    case 'reactiveBoolean': value = z.boolean(); break;
    case 'action': value = action(); break;
    default: value = field.type.includes('|') ? z.enum(field.type.split('|') as [string, ...string[]]) : z.string();
  }
  if (field.optional) value = value.optional();
  return config.features.state && field.type.startsWith('reactive') ? reactive(value) : value;
}

function Chart({ type, labels, values, title }: { type: string; labels: string[]; values: number[]; title?: string }) {
  const data = values.slice(0, labels.length).filter(Number.isFinite);
  const min = Math.min(0, ...data), max = Math.max(1, ...data), span = max - min;
  const y = (value: number) => 180 - (value - min) / span * 155;
  const width = 480, baseline = y(0), step = 440 / Math.max(1, data.length);
  const sum = data.reduce((total, value) => total + Math.max(0, value), 0);
  let angle = 0;
  return <figure className="genui-chart">{title && <figcaption>{title}</figcaption>}<svg viewBox={`0 0 ${width} 210`} role="img" aria-label={title || type}>
    {type === 'PieChart' ? data.map((value, index) => {
      const from = angle; angle += sum ? Math.max(0, value) / sum * Math.PI * 2 : 0;
      const path = `M240 100 L${240 + Math.cos(from) * 80} ${100 + Math.sin(from) * 80} A80 80 0 ${angle - from > Math.PI ? 1 : 0} 1 ${240 + Math.cos(angle) * 80} ${100 + Math.sin(angle) * 80} Z`;
      return value > 0 && sum === value ? <circle key={index} cx="240" cy="100" r="80" className={`genui-series-${index % 4}`}><title>{labels[index]}: {value}</title></circle> : <path key={index} d={path} className={`genui-series-${index % 4}`}><title>{labels[index]}: {value}</title></path>;
    }) : <><line x1="20" y1={baseline} x2="460" y2={baseline} className="genui-axis" />{type === 'LineChart' && <polyline fill="none" className="genui-line" points={data.map((value, index) => `${20 + (index + .5) * step},${y(value)}`).join(' ')} />}{data.map((value, index) => <g key={index}><title>{labels[index]}: {value}</title>{type === 'BarChart' ? <rect x={20 + index * step + 3} y={Math.min(baseline, y(value))} width={Math.max(1, step - 6)} height={Math.max(1, Math.abs(baseline - y(value)))} className="genui-series-0" /> : <circle cx={20 + (index + .5) * step} cy={y(value)} r="3" className="genui-series-0" />}<text x={20 + (index + .5) * step} y="200" textAnchor="middle">{labels[index]?.slice(0, 12)}</text></g>)}</>}
  </svg><details><summary>数据</summary><table><tbody>{data.map((value, index) => <tr key={index}><th>{labels[index]}</th><td>{value}</td></tr>)}</tbody></table></details></figure>;
}

function Control({ name, props, config, statementId }: { name: string; props: Record<string, unknown>; config: GenUIConfiguration; statementId?: string }) {
  const field = useStateField(String(props.name || statementId || name), props.value);
  const streaming = useIsStreaming();
  const disabled = streaming || !config.features.state;
  const label = String(props.label ?? '');
  const value = field.value ?? (name === 'Checkbox' ? false : '');
  const set = (value: unknown) => { if (!disabled) field.setValue(value); };
  let control: ReactNode;
  if (name === 'TextArea') control = <textarea rows={3} value={String(value)} disabled={disabled} onChange={event => set(event.target.value)} />;
  else if (name === 'Select') control = <select value={String(value)} disabled={disabled} onChange={event => set(event.target.value)}>{(props.options as string[]).map(option => <option key={option} value={option}>{option}</option>)}</select>;
  else if (name === 'Checkbox') control = <input type="checkbox" checked={!!value} disabled={disabled} onChange={event => set(event.target.checked)} />;
  else if (name === 'Slider') control = <><input type="range" min={Number(props.min)} max={Number(props.max)} value={Number(value || 0)} disabled={disabled} onChange={event => set(Number(event.target.value))} /><output>{String(value)}</output></>;
  else control = <input type={name === 'NumberInput' ? 'number' : name === 'DatePicker' ? 'date' : 'text'} value={String(value)} placeholder={String(props.placeholder ?? '')} disabled={disabled} onChange={event => set(name === 'NumberInput' ? event.target.value === '' ? null : Number(event.target.value) : event.target.value)} />;
  return <label className={`genui-field ${name === 'Checkbox' ? 'genui-checkbox' : ''}`}><span>{label}</span>{control}</label>;
}

function ActionButton({ props, config }: { props: Record<string, unknown>; config: GenUIConfiguration }) {
  const trigger = useTriggerAction(), form = useFormName(), streaming = useIsStreaming();
  return <button className="genui-button" type="button" disabled={streaming || !config.features.actions && !config.features.state} onClick={() => { if (props.action || config.features.actions) void trigger(String(props.label), form, props.action as ActionPlan | undefined); }}>{String(props.label)}</button>;
}

function ExternalLink({ url, label }: { url: unknown; label: ReactNode }) {
  const [error, setError] = useState('');
  const target = safeGenUIUrl(url);
  return <><button type="button" className="genui-link" disabled={!target} onClick={() => { if (target) void request('system.open_url', { url: target }).then(() => setError('')).catch(error => setError(String(error))); }}>{label}</button>{error && <small role="alert">{error}</small>}</>;
}

function renderComponent(name: string, { props, renderNode, statementId }: ComponentRenderProps, config: GenUIConfiguration): ReactNode {
  if (['Input', 'TextArea', 'NumberInput', 'Select', 'Checkbox', 'Slider', 'DatePicker'].includes(name)) return <Control name={name} props={props} config={config} statementId={statementId} />;
  const children = () => renderNode(props.children);
  switch (name) {
    case 'Col': case 'Row': case 'Grid': return <div className={`genui-${name.toLowerCase()}`} style={{ gap: clamp(props.gap, 12), ...(name === 'Grid' ? { gridTemplateColumns: `repeat(${Math.round(clamp(props.columns, 2, 1, 12))},minmax(0,1fr))` } : {}) }}>{children()}</div>;
    case 'Card': return <section className="genui-card">{!!props.title && <h3>{String(props.title)}</h3>}{children()}</section>;
    case 'Box': return <div style={{ padding: clamp(props.padding, 0) }}>{children()}</div>;
    case 'Divider': return <hr />;
    case 'Spacer': return <div style={{ height: clamp(props.size, 12) }} />;
    case 'Title': { const level = Math.round(clamp(props.level, 2, 1, 4)); return level === 1 ? <h1>{String(props.text)}</h1> : level === 2 ? <h2>{String(props.text)}</h2> : level === 3 ? <h3>{String(props.text)}</h3> : <h4>{String(props.text)}</h4>; }
    case 'Text': return <p>{String(props.text)}</p>;
    case 'Caption': return <small>{String(props.text)}</small>;
    case 'Badge': return <span className={`genui-badge genui-tone-${props.tone || 'neutral'}`}>{String(props.text)}</span>;
    case 'Code': return <pre><code>{String(props.text)}</code></pre>;
    case 'Markdown': return <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => <ExternalLink url={href} label={children} /> }}>{String(props.text)}</ReactMarkdown>;
    case 'Link': return <ExternalLink url={props.url} label={String(props.label)} />;
    case 'List': return <ul>{(props.items as string[]).map((item, index) => <li key={index}>{item}</li>)}</ul>;
    case 'Button': return <ActionButton props={props} config={config} />;
    case 'Form': return <FormNameContext.Provider value={String(props.name || statementId || 'form')}><div className="genui-col">{children()}</div></FormNameContext.Provider>;
    case 'Table': return <div className="genui-table-scroll"><table>{!!props.caption && <caption>{String(props.caption)}</caption>}<thead><tr>{(props.columns as string[]).map((item, index) => <th key={index}>{item}</th>)}</tr></thead><tbody>{(props.rows as unknown[][]).map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>{String(cell ?? '')}</td>)}</tr>)}</tbody></table></div>;
    case 'LineChart': case 'BarChart': case 'PieChart': return <Chart type={name} labels={props.labels as string[]} values={props.values as number[]} title={props.title as string | undefined} />;
    case 'Math': return <Suspense fallback={<code>{String(props.expression)}</code>}><MathView expression={String(props.expression)} display={props.display as boolean | undefined} /></Suspense>;
    case 'Map': return <Suspense fallback={<p role="status">正在载入地图…</p>}><MapView longitude={Number(props.longitude)} latitude={Number(props.latitude)} zoom={props.zoom as number | undefined} label={props.label as string | undefined} /></Suspense>;
    case 'Image': return <img loading="lazy" src={safeGenUIUrl(props.url,true)} alt={String(props.alt)} />;
    case 'Video': return <video controls preload="none" src={safeGenUIUrl(props.url)} aria-label={String(props.title)} />;
    case 'Audio': return <audio controls preload="none" src={safeGenUIUrl(props.url)} aria-label={String(props.title)} />;
    default: return null;
  }
}

export function createGenUILibrary(config: GenUIConfiguration) {
  return createLibrary({ id: 'omp-genui.v1', components: GENUI_COMPONENTS.filter(item => config.components.includes(item.name)).map(item => defineComponent({ name: item.name, description: item.label, props: z.object(Object.fromEntries(exposedGenUIFields(item, config).map(field => [field.name, schema(field, config)]))), component: renderProps => renderComponent(item.name, renderProps, config) })) });
}
