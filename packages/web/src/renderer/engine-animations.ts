import { useLayoutEffect, type RefObject } from 'react';
import type { ClockSource } from '../runtime/clock';
const owners = new WeakMap<Element, HTMLElement>();
const ownerOf = (el: Element): HTMLElement | undefined => { for (let p: Element | null = el; p; p = p.parentElement) { const owner = owners.get(p); if (owner) return owner; } return undefined; };
/** Browser CSS/WAAPI animations are sampled by engine time, including plugin FLIP and CSS paths. */
export function bindEngineAnimations(root: HTMLElement, clock: ClockSource): () => void {
  owners.set(root, root);
  const starts = new WeakMap<Animation, number>();
  const finished = new WeakSet<Animation>();
  const sample = () => {
    const now = clock.getSnapshot().timeMs;
    for (const animation of root.getAnimations?.({ subtree: true }) ?? []) {
      const target = (animation.effect as KeyframeEffect | null)?.target;
      if (target && ownerOf(target) !== root || finished.has(animation)) continue;
      if (!starts.has(animation)) starts.set(animation, now);
      const elapsed = Math.max(0, now - starts.get(animation)!);
      const end = animation.effect?.getComputedTiming().endTime;
      try {
        animation.pause();
        animation.currentTime = elapsed;
        if (typeof end === 'number' && Number.isFinite(end) && elapsed >= end) { animation.finish(); finished.add(animation); }
      } catch { /* An animation can be removed between the layout pass and this sample. */ }
    }
    // Declarative SVG animation uses the same stage clock (e.g. path-following dots).
    for (const svg of root.querySelectorAll<SVGSVGElement>('svg')) if (ownerOf(svg) === root && svg.querySelector('animate,animateMotion,animateTransform')) {
      svg.pauseAnimations?.(); svg.setCurrentTime?.(clock.getSnapshot().elapsedMs / 1000);
    }
  };
  const unsubscribe = clock.subscribe(sample);
  const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(sample);
  observer?.observe(root, { subtree: true, attributes: true, attributeFilter: ['class', 'style'], childList: true });
  root.addEventListener('animationstart', sample, true);
  root.addEventListener('transitionrun', sample, true);
  sample();
  return () => { owners.delete(root); unsubscribe(); observer?.disconnect(); root.removeEventListener('animationstart', sample, true); root.removeEventListener('transitionrun', sample, true); };
}
/**
 * 界面层（字幕、步骤标题条，D97）不是画面内容：它们的动画用浏览器时间，暂停时也要能淡入淡出。
 * 把 el 登记成自己的 owner，舞台的引擎采样就会跳过它的子树。返回解除函数。
 */
export function exemptFromEngineAnimations(el: HTMLElement): () => void {
  owners.set(el, el);
  return () => { if (owners.get(el) === el) owners.delete(el); };
}
export function useEngineAnimations(root: RefObject<HTMLElement | null>, clock?: ClockSource) {
  useLayoutEffect(() => {
    if (!root.current || !clock) return;
    return bindEngineAnimations(root.current, clock);
  }, [clock, root]);
}
