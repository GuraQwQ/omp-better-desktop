import { ArrowLeft } from 'lucide-react';
import type { ComponentProps } from 'react';
import SessionLibrary from './SessionLibrary';
import Schedules from './desktop/Schedules';
import './library-page.css';

type Props = ComponentProps<typeof SessionLibrary> & { page: 'library' | 'schedules'; close: () => void; onError: (error: unknown) => void };
export default function LibraryPage({ page, close, onError, ...props }: Props) {
  const zh = props.language === 'zh';
  return <section className="library-page">
    <header><button className="icon-button" onClick={close} aria-label={zh ? '返回对话' : 'Back to conversation'}><ArrowLeft size={18} /></button><div><h1>{page === 'library' ? zh ? '会话库' : 'Session library' : zh ? '定时任务' : 'Schedules'}</h1><p>{page === 'library' ? zh ? '搜索历史、管理归档与查看用量' : 'Search history, manage archives and review usage' : zh ? '安排执行时间，查看运行记录与重试' : 'Schedule tasks, review runs and retry'}</p></div></header>
    <div className="library-page-content">{page === 'library' ? <SessionLibrary {...props} /> : <Schedules cwd={props.cwd ?? ''} onOpen={props.onOpen} onError={onError} />}</div>
  </section>;
}
