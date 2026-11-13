import { action, createLibrary, defineComponent, FormNameContext, isReactiveAssign, reactive, useFormName, useIsStreaming, useStateField, useTriggerAction, type ActionPlan, type ComponentRenderProps } from '@openuidev/react-lang';
import { lazy, Suspense, useId, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { z } from 'zod/v4';
import { ChevronRight } from 'lucide-react';
import { GENUI_COMPONENTS, exposedGenUIFields, type GenUIConfiguration, type GenUIField } from '../lib/genui-config';
import { TargetLink } from './LinkTargets';
import { safeGenUIUrl } from '../lib/genui';
import ZoomableImage from './ZoomableImage';

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
    case 'reactiveStrings': value = z.array(z.string()); break;
    case 'reactiveNumberOrRange': case 'numberOrRange': value = z.union([z.number(), z.tuple([z.number(), z.number()])]); break;
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
  else control = <input type={name === 'NumberInput' ? 'number' : name === 'DatePicker' ? 'date' : 'text'} value={String(value)} placeholder={String(props.placeholder ?? '')} disabled={disabled} onChange={event => set(name === 'NumberInput' ? event.target.value === '' ? null : Number(event.target.value) : event.target.value)} />;
  return <label className={`genui-field ${name === 'Checkbox' ? 'genui-checkbox' : ''}`}><span>{label}</span>{control}</label>;
}

function SliderControl({ props, config, statementId }: { props: Record<string, unknown>; config: GenUIConfiguration; statementId?: string }) {
  const id = useId(), streaming = useIsStreaming();
  const min = Math.min(Number(props.min), Number(props.max)), max = Math.max(Number(props.min), Number(props.max));
  const step = typeof props.step === 'number' && props.step > 0 && Number.isFinite(props.step) ? props.step : 1;
  // 滑轨按步序号定位，最后一个位置始终映射到声明的最大值。
  const intervals = (max - min) / step;
  const steps = Math.max(max > min ? 1 : 0, Math.ceil(intervals - Math.abs(intervals) * Number.EPSILON * 4));
  const valueAt = (index: number) => index >= steps ? max : Number((min + index * step).toPrecision(12));
  const indexOf = (value: unknown, fallback: number) => {
    const number = typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
    const lower = Math.max(0, Math.min(steps, Math.floor((number - min) / step))), upper = Math.min(steps, lower + 1);
    return number - valueAt(lower) < valueAt(upper) - number ? lower : upper;
  };
  const snap = (value: unknown, fallback: number) => valueAt(indexOf(value, fallback));
  const initial = isReactiveAssign(props.value) ? props.value : Array.isArray(props.value) ? [snap(props.value[0], min), snap(props.value[1], max)].sort((a, b) => a - b) : snap(props.value, min);
  const field = useStateField(String(props.name || statementId || 'slider'), initial);
  const range = Array.isArray(field.value) ? [snap(field.value[0], min), snap(field.value[1], max)].sort((a, b) => a - b) : undefined;
  const value = snap(field.value, min), disabled = streaming || !config.features.state;
  const label = String(props.label ?? ''), zh = document.documentElement.lang.startsWith('zh');
  return <fieldset className="genui-field genui-slider" disabled={disabled}><legend>{label}</legend><div className="genui-slider-values">
    {range ? range.map((value, index) => <label key={index}><span>{index === 0 ? zh ? '起点' : 'Start' : zh ? '终点' : 'End'}</span><input id={`${id}-${index}`} type="range" min={0} max={steps} step={1} value={indexOf(value, min)} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={String(value)} aria-label={`${label} ${index === 0 ? zh ? '起点' : 'Start' : zh ? '终点' : 'End'}`} onChange={event => {
      const next = valueAt(Number(event.target.value)); field.setValue(index === 0 ? [Math.min(next, range[1]), range[1]] : [range[0], Math.max(next, range[0])]);
    }} /><output htmlFor={`${id}-${index}`}>{value}</output></label>) : <label><input id={id} type="range" min={0} max={steps} step={1} value={indexOf(value, min)} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={String(value)} aria-label={label} onChange={event => field.setValue(valueAt(Number(event.target.value)))} /><output htmlFor={id}>{value}</output></label>}
  </div></fieldset>;
}

function SwitchGroup({ props, config, statementId }: { props: Record<string, unknown>; config: GenUIConfiguration; statementId?: string }) {
  const field = useStateField(String(props.name || statementId || 'switches'), props.value ?? []), streaming = useIsStreaming();
  const selected = Array.isArray(field.value) ? field.value : [];
  const options = [...new Set(props.options as string[])];
  return <fieldset className="genui-field genui-switch-group" disabled={streaming || !config.features.state}><legend>{String(props.label)}</legend>{options.map(option => <label className="genui-switch-option" key={option}><span>{option}</span><input className="capture-switch" type="checkbox" role="switch" checked={selected.includes(option)} onChange={event => field.setValue(event.target.checked ? [...selected, option] : selected.filter(value => value !== option))} /></label>)}</fieldset>;
}

function Tabs({ props, renderNode, statementId, config }: ComponentRenderProps & { config: GenUIConfiguration }) {
  const id = useId(), streaming = useIsStreaming();
  const field = useStateField(String(props.name || statementId || 'tabs'), props.value ?? 0);
  const labels = props.labels as string[], children = props.children as unknown[];
  const zh = document.documentElement.lang.startsWith('zh');
  const count = Math.max(labels.length, children.length), selected = Math.round(clamp(field.value, 0, 0, Math.max(0, count - 1)));
  const disabled = streaming || !config.features.state;
  return <div className="genui-tabs"><div role="tablist" aria-label={String(props.name)} onKeyDown={event => {
    if (disabled || !count || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : (selected + (event.key === 'ArrowRight' ? 1 : -1) + count) % count;
    field.setValue(next); event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }}>{Array.from({ length: count }, (_, index) => <button type="button" role="tab" key={index} id={`${id}-tab-${index}`} aria-controls={`${id}-panel-${index}`} aria-selected={selected === index} tabIndex={selected === index ? 0 : -1} disabled={disabled} onClick={() => field.setValue(index)}>{labels[index] ?? `${zh ? '标签页' : 'Tab'} ${index + 1}`}</button>)}</div>
    {Array.from({ length: count }, (_, index) => <div key={index} id={`${id}-panel-${index}`} role="tabpanel" aria-labelledby={`${id}-tab-${index}`} hidden={selected !== index} tabIndex={0}>{index < children.length ? renderNode(children[index]) : <p>{zh ? '暂无内容。' : 'No content yet.'}</p>}</div>)}
  </div>;
}

function Accordion({ props, renderNode, statementId, config }: ComponentRenderProps & { config: GenUIConfiguration }) {
  const field = useStateField(String(props.name || statementId || 'accordion'), props.value ?? false), streaming = useIsStreaming();
  const disabled = streaming || !config.features.state;
  return <details className="genui-accordion" open={!!field.value} onToggle={event => { if (!disabled && event.currentTarget.open !== !!field.value) field.setValue(event.currentTarget.open); }}>
    <summary aria-disabled={disabled || undefined} onClick={event => { if (disabled) event.preventDefault(); }}><ChevronRight size={14} aria-hidden="true" />{String(props.label)}</summary><div>{renderNode(props.children)}</div>
  </details>;
}

function ActionButton({ props, config }: { props: Record<string, unknown>; config: GenUIConfiguration }) {
  const trigger = useTriggerAction(), form = useFormName(), streaming = useIsStreaming();
  return <button className="genui-button" type="button" disabled={streaming || !config.features.actions && !config.features.state} onClick={() => { if (props.action || config.features.actions) void trigger(String(props.label), form, props.action as ActionPlan | undefined); }}>{String(props.label)}</button>;
}

function ExternalLink({ url, label }: { url: unknown; label: ReactNode }) {
  const target = safeGenUIUrl(url);
  return target ? <TargetLink className="genui-link" href={target} target="_blank" rel="noreferrer">{label}</TargetLink> : <span>{label}</span>;
}

function renderComponent(name: string, renderProps: ComponentRenderProps, config: GenUIConfiguration): ReactNode {
  const { props, renderNode, statementId } = renderProps;
  if (name === 'Tabs') return <Tabs {...renderProps} config={config} />;
  if (name === 'Accordion') return <Accordion {...renderProps} config={config} />;
  if (name === 'SwitchGroup') return <SwitchGroup props={props} config={config} statementId={statementId} />;
  if (name === 'Slider') return <SliderControl props={props} config={config} statementId={statementId} />;
  if (['Input', 'TextArea', 'NumberInput', 'Select', 'Checkbox', 'DatePicker'].includes(name)) return <Control name={name} props={props} config={config} statementId={statementId} />;
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
    case 'Markdown': return <ReactMarkdown urlTransform={(url, key) => safeGenUIUrl(url, key === 'src') ?? ''} remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => <ExternalLink url={href} label={children} />, img: ({ src, alt }) => <ZoomableImage src={safeGenUIUrl(src, true)} alt={alt} /> }}>{String(props.text)}</ReactMarkdown>;
    case 'Link': return <ExternalLink url={props.url} label={String(props.label)} />;
    case 'List': return <ul>{(props.items as string[]).map((item, index) => <li key={index}>{item}</li>)}</ul>;
    case 'Button': return <ActionButton props={props} config={config} />;
    case 'Form': return <FormNameContext.Provider value={String(props.name || statementId || 'form')}><div className="genui-col">{children()}</div></FormNameContext.Provider>;
    case 'Table': return <div className="genui-table-scroll"><table>{!!props.caption && <caption>{String(props.caption)}</caption>}<thead><tr>{(props.columns as string[]).map((item, index) => <th key={index}>{item}</th>)}</tr></thead><tbody>{(props.rows as unknown[][]).map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>{String(cell ?? '')}</td>)}</tr>)}</tbody></table></div>;
    case 'LineChart': case 'BarChart': case 'PieChart': return <Chart type={name} labels={props.labels as string[]} values={props.values as number[]} title={props.title as string | undefined} />;
    case 'Math': return <Suspense fallback={<code>{String(props.expression)}</code>}><MathView expression={String(props.expression)} display={props.display as boolean | undefined} /></Suspense>;
    case 'Map': return <Suspense fallback={<p role="status">正在载入地图…</p>}><MapView longitude={Number(props.longitude)} latitude={Number(props.latitude)} zoom={props.zoom as number | undefined} label={props.label as string | undefined} /></Suspense>;
    case 'Image': return <ZoomableImage loading="lazy" src={safeGenUIUrl(props.url,true)} alt={String(props.alt)} />;
    case 'Video': return <video controls preload="none" src={safeGenUIUrl(props.url)} aria-label={String(props.title)} />;
    case 'Audio': return <audio controls preload="none" src={safeGenUIUrl(props.url)} aria-label={String(props.title)} />;
    default: return null;
  }
}

export function createGenUILibrary(config: GenUIConfiguration) {
  return createLibrary({ id: 'omp-genui.v1', components: GENUI_COMPONENTS.filter(item => config.components.includes(item.name)).map(item => defineComponent({ name: item.name, description: item.label, props: z.object(Object.fromEntries(exposedGenUIFields(item, config).map(field => [field.name, schema(field, config)]))), component: renderProps => renderComponent(item.name, renderProps, config) })) });
}
