import { Component, createRef, type ReactNode } from 'react';
import { motionTiming } from '../lib/motion';

type LayoutSnapshot = { targets: { element: HTMLElement; left: number }[]; reading?: { scroller: HTMLElement; index: string; offset: number; fraction: number; range?: Range; textOffset?: number } } | null;
interface Props { layoutKey: string; identity: string; children: ReactNode }
export default class ConversationLayout extends Component<Props, {}, LayoutSnapshot> {
  private workspace = createRef<HTMLDivElement>();
  private animations: Animation[] = [];
  private stopRestoring = () => {};
  getSnapshotBeforeUpdate(previous: Readonly<Props>): LayoutSnapshot {
    if (previous.layoutKey === this.props.layoutKey || previous.identity !== this.props.identity) return null;
    const workspace = this.workspace.current;
    const scroller = workspace?.querySelector<HTMLElement>('.transcript');
    const top = scroller?.getBoundingClientRect().top ?? 0;
    const row = scroller && scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight > 80 ? Array.from(scroller.querySelectorAll<HTMLElement>('[data-index]')).find(element => element.getBoundingClientRect().bottom > top + 4) : undefined;
    const body = row?.querySelector<HTMLElement>('.message-body') ?? row;
    const caret = body && document.caretRangeFromPoint(body.getBoundingClientRect().left + 8, top + 8);
    const range = caret && row?.contains(caret.startContainer) ? caret : undefined;
    const offset = row ? row.getBoundingClientRect().top - top : 0;
    return { targets: Array.from(workspace?.querySelectorAll<HTMLElement>('.transcript-content, .composer-area, .welcome') ?? []).map(element => ({ element, left: element.getBoundingClientRect().left })), ...(row && scroller ? { reading: { scroller, index: row.dataset.index!, offset, fraction: Math.max(0, -offset / row.getBoundingClientRect().height), ...(range ? { range, textOffset: range.getBoundingClientRect().top - top } : {}) } } : {}) };
  }
  componentDidUpdate(previous: Readonly<Props>, _state: unknown, snapshot: LayoutSnapshot) {
    if (previous.identity !== this.props.identity) { this.animations.forEach(animation => animation.cancel()); this.stopRestoring(); return; }
    if (!snapshot) return;
    this.animations.forEach(animation => animation.cancel());
    this.stopRestoring();
    // 只平移已重排的内容，避免逐帧改变列宽或拉伸文字。
    const offsets = snapshot.targets.map(({ element, left }) => ({ element, offset: left - element.getBoundingClientRect().left }));
    const duration = motionTiming().layout;
    this.animations = duration ? offsets.filter(({ offset }) => Math.abs(offset) > 1).map(({ element, offset }) => element.animate([{ transform: `translateX(${offset}px)` }, { transform: 'translateX(0)' }], { duration, easing: 'cubic-bezier(.16,1,.3,1)' })) : [];
    if (snapshot.reading) {
      const { scroller, index, offset, fraction, range, textOffset } = snapshot.reading;
      const controller = new AbortController();
      let frame = 0;
      let attempts = 0;
      this.stopRestoring = () => { cancelAnimationFrame(frame); controller.abort(); };
      for (const type of ['wheel', 'pointerdown', 'keydown', 'touchstart']) scroller.addEventListener(type, this.stopRestoring, { passive: true, signal: controller.signal });
      const restore = () => {
        const row = scroller.querySelector<HTMLElement>(`[data-index="${index}"]`);
        if (range?.startContainer.isConnected) scroller.scrollTop += range.getBoundingClientRect().top - scroller.getBoundingClientRect().top - textOffset!;
        else if (row) scroller.scrollTop += row.getBoundingClientRect().top - scroller.getBoundingClientRect().top - (offset < 0 ? -fraction * row.getBoundingClientRect().height : offset);
        if (++attempts < 12) frame = requestAnimationFrame(restore);
        else this.stopRestoring();
      };
      restore();
    }
  }
  componentWillUnmount() { this.animations.forEach(animation => animation.cancel()); this.stopRestoring(); }
  render() { return <div className="workspace-body" ref={this.workspace}>{this.props.children}</div>; }
}
