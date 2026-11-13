import type { Language } from '../lib/types';
import { Quote, X } from 'lucide-react';
import { referenceLabel, referencePreview, type ConversationReference } from '../lib/references';
import './references.css';

export function ReferenceCards({ references, onRemove, language = document.documentElement.lang.startsWith('zh') ? 'zh' : 'en' }: { references: ConversationReference[]; onRemove?: (id: string) => void; language?: Language }) {
  const zh = language === 'zh';
  if (!references.length) return null;
  return <div className="conversation-references" aria-label={zh ? '会话引用' : 'Conversation references'}>{references.map(reference => <div className="conversation-reference" key={reference.id} title={[referenceLabel(reference, language), reference.source.sessionPath, `${zh ? '消息' : 'Message'} ${reference.source.messageId}`].filter(Boolean).join('\n')}>
    <Quote size={13} aria-hidden="true" />
    <div className="conversation-reference-copy"><span>{referenceLabel(reference, language)}</span><p>{referencePreview(reference)}</p></div>
    {onRemove && <button type="button" className="reference-remove" aria-label={`${zh ? '移除引用：' : 'Remove reference: '}${referenceLabel(reference, language)}`} title={zh ? '移除引用' : 'Remove reference'} onClick={() => onRemove(reference.id)}><X size={12} /></button>}
  </div>)}</div>;
}

export default function ComposerReferences(props: { references: ConversationReference[]; onRemove: (id: string) => void; language?: Language }) {
  return <ReferenceCards {...props} />;
}
