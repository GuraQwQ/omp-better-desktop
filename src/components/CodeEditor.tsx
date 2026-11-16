import { useEffect, useRef } from 'react';
import { basicSetup, EditorView } from 'codemirror';
import { EditorState, StateEffect } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { languages } from '@codemirror/language-data';
import type { Language } from '../lib/types';
import './code-editor.css';

const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--code-keyword)' },
  { tag: [tags.variableName, tags.propertyName, tags.typeName], color: 'var(--code-name)' },
  { tag: [tags.string, tags.regexp], color: 'var(--code-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--code-literal)' },
  { tag: tags.comment, color: 'var(--muted)', fontStyle: 'italic' },
]);

export default function CodeEditor({ path, value, readOnly, language, location, onChange, onCursor }: {
  path: string; value: string; readOnly: boolean; language: Language; location?: { line: number };
  onChange: (value: string) => void; onCursor: (line: number, column: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null), editor = useRef<EditorView>(null);
  const callbacks = useRef({ onChange, onCursor }); callbacks.current = { onChange, onCursor };
  useEffect(() => {
    let disposed = false;
    const view = new EditorView({ parent: host.current!, doc: value, extensions: [
      basicSetup, syntaxHighlighting(highlight), EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly),
      EditorState.phrases.of(language === 'zh' ? { 'Find': '查找', 'Replace': '替换', 'next': '下一处', 'previous': '上一处', 'all': '全部', 'match case': '区分大小写', 'by word': '完整词', 'regexp': '正则', 'replace': '替换', 'replace all': '全部替换', 'close': '关闭', 'Go to line': '跳转到行', 'go': '跳转', 'current line': '当前行', 'Fold line': '折叠行', 'Unfold line': '展开行', 'folded code': '已折叠代码' } : {}),
      EditorView.contentAttributes.of({ 'aria-label': path, spellcheck: 'false' }),
      EditorView.updateListener.of(update => {
        if (update.docChanged) callbacks.current.onChange(update.state.doc.toString());
        if (update.docChanged || update.selectionSet) { const head = update.state.selection.main.head, line = update.state.doc.lineAt(head); callbacks.current.onCursor(line.number, head - line.from + 1); }
      }),
    ] });
    editor.current = view;
    const filename = path.split(/[\\/]/).at(-1) ?? path;
    const extension = filename.split('.').at(-1)?.toLowerCase();
    const description = languages.find(item => item.filename?.test(filename) || !!extension && item.extensions.includes(extension));
    void description?.load().then(support => { if (!disposed) view.dispatch({ effects: StateEffect.appendConfig.of(support) }); }).catch(() => {});
    return () => { disposed = true; editor.current = null; view.destroy(); };
  }, [path, readOnly, language]);
  useEffect(() => { const view = editor.current; if (view && value !== view.state.doc.toString()) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } }); }, [value]);
  useEffect(() => { const view = editor.current; if (!view || !location) return; const line = view.state.doc.line(Math.max(1, Math.min(location.line, view.state.doc.lines))); view.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: 'center' }) }); view.focus(); }, [location, path]);
  return <div className="code-editor"><div ref={host} className="code-editor-viewport" /></div>;
}
