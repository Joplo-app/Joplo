/** Shared input ownership, independent of DOM component vocabulary. */
export function editableTarget(el: { tagName: string; isContentEditable?: boolean } | null): boolean {
  return !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || !!el.isContentEditable);
}
export function inputOwner(input: { editable: boolean; draggable: boolean; plugin: boolean }): 'edit' | 'drag' | 'plugin' | 'pan' {
  return input.editable ? 'edit' : input.draggable ? 'drag' : input.plugin ? 'plugin' : 'pan';
}
export function hoverAction(target: string, elapsed: number, required: number, pointer: string): { type: 'hover'; target: string; ms: number } | null {
  return pointer === 'touch' || elapsed >= required ? { type: 'hover', target, ms: pointer === 'touch' ? required : elapsed } : null;
}

type HoverAction = { type: 'hover'; target: string; ms: number };
/** Real pointer dwell, shared by DOM and raycast surfaces. Never advances the engine clock. */
export class HoverIntent {
  private target: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(
    private resolve: (id: string) => HoverAction | undefined,
    private blocked: () => boolean,
    private dispatch: (action: HoverAction) => void,
  ) {}
  move(target: string | null): void {
    if (!target || this.blocked()) { this.reset(); return; }
    if (target === this.target) return;
    this.reset();
    const action = this.resolve(target);
    if (!action) return;
    this.target = target;
    this.timer = setTimeout(() => {
      this.timer = null;
      const current = this.resolve(target);
      if (!this.blocked() && this.target === target && current?.ms === action.ms) this.dispatch(action);
    }, action.ms);
  }
  reset(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.target = null;
  }
}

/** Match declared drop zones after a canvas gesture; coordinates share the stage frame. */
export function resolveDropTarget(
  point: { x: number; y: number },
  destinations: readonly string[],
  bounds: (id: string) => { x: number; y: number; width: number; height: number } | null,
): string | { x: number; y: number } {
  for (const id of destinations) {
    const b = bounds(id);
    if (b && b.width > 0 && b.height > 0 && point.x >= b.x && point.x <= b.x + b.width && point.y >= b.y && point.y <= b.y + b.height) return id;
  }
  return point;
}

type Rect = { left: number; top: number; right: number; bottom: number };
/**
 * 拖动松手落在哪个声明的目标上（D92 U1，屏幕坐标）：
 * 1) 指针所在的目标；2) 与被拖元素重叠面积最大的目标；3) 指针 radius 以内最近的目标（时间轴上游标那一行与年份标签不重叠）。
 * 都没有时返回 null：调用方让元素回到原位、不改状态。
 */
export function dropTarget(point: { x: number; y: number }, dragged: Rect | null, targets: readonly { id: string; r: Rect }[], radius: number): string | null {
  const inside = targets.find(t => point.x >= t.r.left && point.x <= t.r.right && point.y >= t.r.top && point.y <= t.r.bottom);
  if (inside) return inside.id;
  if (dragged) {
    let best: { id: string; area: number } | null = null;
    for (const t of targets) {
      const w = Math.min(dragged.right, t.r.right) - Math.max(dragged.left, t.r.left), h = Math.min(dragged.bottom, t.r.bottom) - Math.max(dragged.top, t.r.top);
      if (w > 0 && h > 0 && (!best || w * h > best.area)) best = { id: t.id, area: w * h };
    }
    if (best) return best.id;
  }
  let near: { id: string; d: number } | null = null;
  for (const t of targets) {
    const dx = Math.max(t.r.left - point.x, 0, point.x - t.r.right), dy = Math.max(t.r.top - point.y, 0, point.y - t.r.bottom), d = Math.hypot(dx, dy);
    if (d <= radius && (!near || d < near.d)) near = { id: t.id, d };
  }
  return near?.id ?? null;
}
