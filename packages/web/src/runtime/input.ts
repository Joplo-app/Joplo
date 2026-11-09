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
