import './file-name.css';

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function splitFileName(value: string): [string, string] {
  const name = value.slice(Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\')) + 1);
  const compound = /(?:\.d\.[cm]?ts|\.tar\.(?:gz|bz2|xz|zst|br))$/i.exec(name)?.[0];
  const dot = name.lastIndexOf('.');
  const end = compound ?? (dot > 0 ? name.slice(dot) : Array.from(graphemes.segment(name)).at(-1)?.segment ?? '');
  return end ? [value.slice(0, -end.length), end] : [value, ''];
}

export default function FileName({ value, className = '' }: { value: string; className?: string }) {
  const [start, end] = splitFileName(value);
  return <span className={`file-name ${className}`} title={value}><span className="file-name-start">{start}</span><span className="file-name-end">{end}</span></span>;
}
