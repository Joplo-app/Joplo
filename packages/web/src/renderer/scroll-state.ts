import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { Scenario } from '@joplo-app/core/runtime';

export function scrollTarget(root: HTMLElement, target: string): HTMLElement | null {
  const node = root.querySelector<HTMLElement>(`[data-jid="${CSS.escape(target)}"]`);
  if (!node) return null;
  return [node, ...node.querySelectorAll<HTMLElement>('*')].find(el => el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth) ?? node;
}
export function scrollPoint(scroller: HTMLElement, to: string | {x:number;y:number}): {x:number;y:number} | null {
  if (typeof to !== 'string') return to;
  const element = scroller.querySelector<HTMLElement>(`[data-jid="${CSS.escape(to)}"]`);
  if (!element) return null;
  const box = scroller.getBoundingClientRect(), dest = element.getBoundingClientRect();
  const scale = box.width / scroller.offsetWidth || 1;
  return { x: scroller.scrollLeft + (dest.left - box.left) / scale, y: scroller.scrollTop + (dest.top - box.top) / scale };
}
/** Scripted scroll is replayable presentation; audience scroll is restored on the reset epoch. */
export function useScrollState(root: RefObject<HTMLElement | null>, scenario: Scenario | undefined, position: number, epoch: number, freeMode: boolean) {
  const saved = useRef(new Map<HTMLElement, {x:number;y:number}>());
  const wasFree = useRef(false);
  useLayoutEffect(() => {
    if (freeMode && !wasFree.current) {
      saved.current.clear();
      for (const el of root.current?.querySelectorAll<HTMLElement>('*') ?? []) if (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth) saved.current.set(el, {x:el.scrollLeft,y:el.scrollTop});
    }
    wasFree.current = freeMode;
  }, [freeMode]);
  const lastEpoch = useRef(epoch);
  useLayoutEffect(() => {
    if (lastEpoch.current === epoch) return;
    lastEpoch.current = epoch;
    for (const [el, pos] of saved.current) { if (el.isConnected) { el.scrollLeft = pos.x; el.scrollTop = pos.y; } }
  }, [epoch]);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || !scenario) return;
    const actions = new Map<string, string | {x:number;y:number}>();
    for (const step of scenario.steps.slice(0, position)) if (step.action.type === 'scroll') actions.set(step.action.target, step.action.to);
    const applied = new WeakMap<HTMLElement, string>();
    const apply = () => {
      for (const [target, to] of actions) {
        const scroller = scrollTarget(el, target);
        if (!scroller || applied.has(scroller)) continue;
        const p = scrollPoint(scroller, to);
        if (!p) continue;
        scroller.scrollLeft = p.x; scroller.scrollTop = p.y; applied.set(scroller, target);
      }
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(el, {childList:true,subtree:true});
    return () => observer.disconnect();
  }, [scenario, position]);
}
