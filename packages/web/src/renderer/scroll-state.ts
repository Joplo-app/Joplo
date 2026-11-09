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
  const baseline=useRef(new Map<HTMLElement,{x:number;y:number}>());
  const exploring=useRef(freeMode);exploring.current=freeMode;
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
    const el=root.current;
    if(!el||!scenario)return;
    // Capture every scripted target before any prefix is applied. Retain baselines
    // across same-stage scenario changes, even when the new scenario has no scroll.
    const targets=new Set(scenario.steps.flatMap(step=>step.action.type==='scroll'?[step.action.target]:[]));
    const actions=new Map<string,string|{x:number;y:number}>();
    for(const step of scenario.steps.slice(0,position))if(step.action.type==='scroll'){
      actions.delete(step.action.target);actions.set(step.action.target,step.action.to);
    }
    const applied=new WeakMap<HTMLElement,string>();
    const apply=()=>{
      if(exploring.current)return;
      for(const node of baseline.current.keys())if(!node.isConnected||!el.contains(node))baseline.current.delete(node);
      for(const target of targets){
        const scroller=scrollTarget(el,target);
        if(scroller&&!baseline.current.has(scroller))baseline.current.set(scroller,{x:scroller.scrollLeft,y:scroller.scrollTop});
      }
      const desired=new Map<HTMLElement,{key:string;to:string|{x:number;y:number}}>();
      for(const [target,to] of actions){
        const scroller=scrollTarget(el,target);
        if(scroller)desired.set(scroller,{key:JSON.stringify([target,to]),to});
      }
      for(const [scroller,initial] of baseline.current){
        const action=desired.get(scroller),key=action?.key??'baseline';
        if(applied.get(scroller)===key)continue;
        const next=action?scrollPoint(scroller,action.to):initial;
        if(!next)continue;
        scroller.scrollLeft=next.x;scroller.scrollTop=next.y;applied.set(scroller,key);
      }
    };
    apply();
    // Late-mounted targets need the same projection. Already applied elements are
    // untouched: animation frames and audience gestures own their intermediate DOM.
    const observer=new MutationObserver(apply);
    observer.observe(el,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[scenario,position,epoch]);
}
