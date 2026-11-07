import { Quote, X } from 'lucide-react';
import { referenceLabel, referencePreview, type ConversationReference } from '../lib/references';
import './references.css';

export function ReferenceCards({ references, onRemove }: { references: ConversationReference[]; onRemove?: (id: string) => void }) {
  if (!references.length) return null;
  return <div className="conversation-references" aria-label="会话引用">{references.map(reference => <div className="conversation-reference" key={reference.id} title={[referenceLabel(reference), reference.source.sessionPath, `消息 ${reference.source.messageId}`].filter(Boolean).join('\n')}>
    <Quote size={13} aria-hidden="true" />
    <div className="conversation-reference-copy"><span>{referenceLabel(reference)}</span><p>{referencePreview(reference)}</p></div>
    {onRemove && <button type="button" className="reference-remove" aria-label={`移除引用：${referenceLabel(reference)}`} title="移除引用" onClick={() => onRemove(reference.id)}><X size={12} /></button>}
  </div>)}</div>;
}

export default function ComposerReferences(props: { references: ConversationReference[]; onRemove: (id: string) => void }) {
  return <ReferenceCards {...props} />;
}
