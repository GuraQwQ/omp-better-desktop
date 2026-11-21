import type { ComponentProps } from 'react';
import SessionLibrary from './SessionLibrary';
import Schedules from './desktop/Schedules';
import './library-page.css';

type Props = ComponentProps<typeof SessionLibrary> & { page: 'library' | 'schedules'; onError: (error: unknown) => void };
export default function LibraryPage({ page, onError, ...props }: Props) {
  const zh = props.language === 'zh';
  return <section className="library-page">
    <div className="library-page-content">
      <p className="library-page-description">{page === 'library' ? zh ? '搜索历史、管理归档与查看用量' : 'Search history, manage archives and review usage' : zh ? '安排执行时间，查看运行记录与重试' : 'Schedule tasks, review runs and retry'}</p>
      {page === 'library' ? <SessionLibrary {...props} /> : <Schedules cwd={props.cwd ?? ''} onOpen={props.onOpen} onError={onError} />}
    </div>
  </section>;
}
