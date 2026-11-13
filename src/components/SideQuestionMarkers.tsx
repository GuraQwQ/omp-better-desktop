import { MessageCircle } from 'lucide-react';
import type { SideQuestionThreadSummary } from '../lib/side-questions';

export default function SideQuestionMarkers({ threads, onOpen }: { threads?: SideQuestionThreadSummary[]; onOpen?: (id: string) => void }) {
  const zh = document.documentElement.lang.startsWith('zh');
  const unread = threads?.filter(thread => thread.unread > 0);
  if (!unread?.length || !onOpen) return null;
  return <span className="message-side-questions">{unread.map(thread => <button type="button" className="quiet-button" key={thread.id} title={thread.title} aria-label={`${zh ? '查看未读旁问：' : 'Read side question: '}${thread.title}`} onClick={event => { event.preventDefault(); event.stopPropagation(); onOpen(thread.id); }}><MessageCircle size={12} />{zh ? '旁问' : 'Side question'} {thread.unread}</button>)}</span>;
}
