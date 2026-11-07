export function selectionMenuPosition(point: { x: number; y: number }, size: { width: number; height: number }, viewport: { width: number; height: number }) {
  const inset = 8;
  const top = point.y + 10 + size.height <= viewport.height - inset ? point.y + 10 : point.y - size.height - 10;
  return {
    left: Math.max(inset, Math.min(point.x - 20, viewport.width - size.width - inset)),
    top: Math.max(inset, Math.min(top, viewport.height - size.height - inset)),
  };
}
