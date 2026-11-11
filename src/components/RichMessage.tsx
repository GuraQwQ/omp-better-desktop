import { Fragment, lazy, Suspense, useMemo } from 'react';
import { extractGenUIBlocks, genUIRepairTarget, resolveGenUIRepair, type GenUIRepairs } from '../lib/genui';
import { normalizeGenUIConfiguration } from '../lib/genui-config';
import { copy } from '../lib/i18n';
import type { Language } from '../lib/types';
import MarkdownBody from './MarkdownBody';

const GenerativeUI = lazy(() => import('./GenerativeUI'));
export default function RichMessage({ text, id, sessionId, sessionKey, cwd, language, configuration, onSend, isStreaming = false, repairs = {} }: { text: string; id: string; sessionId?: string; sessionKey?: string; cwd: string; language: Language; configuration: unknown; onSend: (text: string) => Promise<void>; isStreaming?: boolean; repairs?: GenUIRepairs }) {
  const config = normalizeGenUIConfiguration(configuration);
  const blocks = useMemo(() => config.enabled ? extractGenUIBlocks(text) : [], [text, config.enabled]);
  const t = copy(language);
  if (!blocks.length) return <MarkdownBody text={text} t={t} live={isStreaming} />;
  let offset = 0;
  const parts = blocks.map(block => {
    const before = text.slice(offset, block.start); offset = block.end;
    const blockId = `${id}-genui-${block.index}`;
    const target = genUIRepairTarget(block.source);
    const repaired = resolveGenUIRepair(block, repairs[blockId]);
    const rendered = repaired ?? block;
    return <Fragment key={blockId}>{before.trim() && <MarkdownBody text={before} t={t} live={isStreaming} />}{target ? <p className="settings-hint" role="status">{rendered.complete ? language === 'zh' ? '界面修复结果' : 'Interface repair result' : language === 'zh' ? '正在修复界面…' : 'Repairing interface…'}</p> : <Suspense fallback={<pre>{rendered.source}</pre>}><GenerativeUI source={rendered.source} kind={rendered.kind} id={blockId} sessionId={sessionId} sessionKey={sessionKey} cwd={cwd} language={language} configuration={config} onSend={onSend} isStreaming={repaired ? !repaired.complete : isStreaming && !block.complete} repairReason={repairs[blockId]?.complete && !repaired ? '修复基于较早的源码版本，请基于当前版本重新修复。' : undefined} /></Suspense>}</Fragment>;
  });
  const after = text.slice(offset);
  return <>{parts}{after.trim() && <MarkdownBody text={after} t={t} live={isStreaming} />}</>;
}
