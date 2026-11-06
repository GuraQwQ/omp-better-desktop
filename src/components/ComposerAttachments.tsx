import { FileText, Folder, X } from 'lucide-react';
import type { ComposerAttachment } from '../lib/attachments';
import type { Language } from '../lib/types';
import './composer-attachments.css';

export default function ComposerAttachments({ items, remove, disabled, language, name }: { items: ComposerAttachment[]; remove: (index: number) => void; disabled: boolean; language: Language; name: (item: ComposerAttachment) => string }) {
  return <div className="composer-attachments" aria-label={language === 'zh' ? '附件' : 'Attachments'}>{items.map((item, index) => {
    const Icon = item.type === 'file' && item.kind === 'folder' ? Folder : FileText;
    return <div className={`composer-attachment is-${item.type}`} key={name(item)} style={{ viewTransitionName: name(item) }}>
      {item.type === 'image' ? <div className="attachment-image"><img src={`data:${item.mimeType};base64,${item.data}`} alt={item.name} /></div> : <Icon size={20} aria-hidden="true" />}
      <div className="attachment-caption"><span>{item.name}</span>{item.type === 'file' && <small>{item.path}</small>}</div>
      <button type="button" className="attachment-remove" disabled={disabled} onClick={() => remove(index)} title={language === 'zh' ? `移除 ${item.name}` : `Remove ${item.name}`} aria-label={language === 'zh' ? `移除附件 ${item.name}` : `Remove attachment ${item.name}`}><X size={13} aria-hidden="true" /></button>
    </div>;
  })}</div>;
}
