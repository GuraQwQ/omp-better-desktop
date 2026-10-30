import { request, rpc } from './bridge';
import type { Json, SessionView } from './types';

export async function readContextMessages(session: SessionView, current: () => boolean): Promise<Json | undefined> {
  if (!session.historyOnly) return rpc<Json>(session.id, 'get_messages');
  if (!session.path) throw new Error('This conversation has no saved history. / 此会话没有已保存的历史记录。');
  const pages: Json[][] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await request<{ messages: Json[]; nextCursor?: string | null }>('session.history', { path: session.path, cursor, limit: 256 });
    if (!current()) return;
    pages.push(page.messages);
    cursor = page.nextCursor ?? undefined;
    if (cursor && cursors.has(cursor)) throw new Error('History paging did not advance. Refresh to retry. / 历史分页未前进，请刷新重试。');
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return { messages: pages.reverse().flat() };
}
