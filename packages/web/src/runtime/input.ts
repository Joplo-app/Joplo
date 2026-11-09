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
