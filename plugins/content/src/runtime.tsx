import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { defineRuntime, type ComponentCtx, type PluginObserve } from '@joplo-app/kit/plugin';
import { useRoot } from '@joplo-app/kit/renderer';
import type { ContentFrame } from './plugin.ts';
const stillCss = '.jstage[data-jstill] [data-jcanvas],.jstage[data-jstill] [data-jcanvas] *{transition:none!important;animation-delay:0s!important;animation-duration:0s!important}';

type Box = { x: number; y: number; w: number; h: number };
/** 元素在画布世界里的布局位置（offset 链，不受镜头和变形动画的 transform 影响）；不在 root 里时为 null。 */
function offsetIn(el: HTMLElement, root: HTMLElement): Box | null {
  let x = 0;
  let y = 0;
  let n: HTMLElement | null = el;
  while (n && n !== root) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  return n === root ? { x, y, w: el.offsetWidth, h: el.offsetHeight } : null;
}
const CAMERA_EASE = 'cubic-bezier(.65,0,.35,1)';
const MOTION_EASE = 'cubic-bezier(.2,.8,.2,1)';
const MOTION_MS = 900;
type CanvasCamera = { targets?: string[]; pad?: number; zoom?: number; ms?: number };
const numOr = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : d);

/** 镜头取景：把 r 等比放进 view，居中；k 不超过 zoom。 */
export function canvasFrame(r: Box, view: { w: number; h: number }, zoom = 3): { k: number; tx: number; ty: number } {
  const k = Math.min(view.w / Math.max(1, r.w), view.h / Math.max(1, r.h), zoom);
  return { k, tx: (view.w - r.w * k) / 2 - r.x * k, ty: (view.h - r.h * k) / 2 - r.y * k };
}

function Canvas({ ctx: context }: { ctx: ComponentCtx }) {
  const node = context.model;
  const p = context.node.props;
  const ctx = context.frame;
  // screen 子元素固定在屏幕上（设计尺寸，随画布缩放，不随镜头动）：章节标记、来源、封面、行动号召
  const kids = node.children ?? [];
  const onScreen = kids.filter((c) => c.props?.screen === true);
  const inWorld = kids.filter((c) => c.props?.screen !== true);
  const viewArr = Array.isArray(p.view) ? p.view : [];
  const view = { w: numOr(viewArr[0], 1280), h: numOr(viewArr[1], 800) };
  const world = { w: numOr(p.w, view.w), h: numOr(p.h, view.h) };
  const { w: _w, h: _h, view: _v, ...rest } = p;
  // 父元素给了高度（层、h="100%"）时铺满；没给高度时 height: 100% 解析为 auto，aspect-ratio 按 view 的比例撑开，不会塌成 0
  const root = useRoot(node, rest, { style: { position: 'relative', width: '100%', height: '100%', aspectRatio: `${view.w} / ${view.h}`, overflow: 'hidden' } });
  const outer = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const read = () => setBox((b) => (b.w === el.clientWidth && b.h === el.clientHeight ? b : { w: el.clientWidth, h: el.clientHeight }));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // 镜头：编译好的当前舞台取景快照；目标不在这张画布里时看整张画布
  const cam = (context.ext.content as ContentFrame | undefined)?.scenes[ctx.sceneId]?.camera as CanvasCamera | undefined;
  const whole = canvasFrame({ x: 0, y: 0, ...world }, view, Infinity);
  const [frame, setFrame] = useState(whole);
  const frameRef = useRef(whole);
  const lastBox = useRef(box);
  useLayoutEffect(() => {
    const w = worldRef.current;
    if (!w) return;
    // 1) 取景：目标的布局范围（offset，不含 transform）合起来，加留白
    let next = whole;
    const ids = cam?.targets ?? [];
    if (ids.length) {
      const boxes = ids.flatMap((id) => {
        const el = w.querySelector<HTMLElement>(`[data-jid="${CSS.escape(id)}"]`);
        const b = el ? offsetIn(el, w) : null;
        return b ? [b] : [];
      });
      if (boxes.length) {
        const pad = cam?.pad ?? 48;
        const x0 = Math.min(...boxes.map((b) => b.x)) - pad;
        const y0 = Math.min(...boxes.map((b) => b.y)) - pad;
        const x1 = Math.max(...boxes.map((b) => b.x + b.w)) + pad;
        const y1 = Math.max(...boxes.map((b) => b.y + b.h)) + pad;
        next = canvasFrame({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, view, cam?.zoom ?? 3);
      }
    }
    const camMoves = Math.abs(frameRef.current.k - next.k) > 1e-4 || Math.abs(frameRef.current.tx - next.tx) > 0.5 || Math.abs(frameRef.current.ty - next.ty) > 0.5;
    if (camMoves) { frameRef.current = next; setFrame(next); }
    // 镜头同一步也在动：变形用镜头的时长与缓动，两者同步落定（否则屏幕上的轨迹会先冲过头再折回）
    const flight = camMoves && ctx.animate ? { ms: cam?.ms ?? 1200, ease: CAMERA_EASE } : { ms: MOTION_MS, ease: MOTION_EASE };
    w.dataset.flightMs = String(flight.ms);
    w.dataset.flightEase = flight.ease;

  });
  const s = box.w && box.h ? Math.min(box.w / view.w, box.h / view.h) : 0;
  const ox = (box.w - view.w * s) / 2;
  const oy = (box.h - view.h * s) / 2;
  const resized = lastBox.current.w !== box.w || lastBox.current.h !== box.h;
  useEffect(() => { lastBox.current = box; });
  const ms = cam?.ms ?? 1200;
  return (
    <div {...root}>
      <style>{stillCss}</style>
      <div ref={outer} style={{ position: 'absolute', inset: 0 }} data-jcanvas="" data-jreport-surface="Canvas">
        <div
          ref={worldRef}
          data-jcanvas-world="" data-jreport-viewport=""
          style={{
            position: 'absolute', left: 0, top: 0, width: world.w, height: world.h, transformOrigin: '0 0',
            visibility: s ? 'visible' : 'hidden',
            transform: `translate(${ox + frame.tx * s}px, ${oy + frame.ty * s}px) scale(${frame.k * s})`,
            transition: ctx.animate && !resized ? `transform ${ms}ms ${CAMERA_EASE}` : 'none',
          }}
        >
          {context.renderChildren(inWorld)}
        </div>
        {onScreen.length ? (
          <div data-jcanvas-screen="" style={{ position: 'absolute', left: ox, top: oy, width: view.w, height: view.h, transformOrigin: '0 0', transform: `scale(${s})`, visibility: s ? 'visible' : 'hidden', pointerEvents: 'none' }}>
            {onScreen.map((c) => <div key={c.id} style={{ pointerEvents: 'auto' }}>{context.renderChildren([c])}</div>)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** One observer per stage: cache only design-space layouts, never player state. */
export const observe: PluginObserve = (root) => {
  const layouts = new Map<HTMLElement, Map<string, Box>>();
  const cancel = (w: HTMLElement) => { for (const el of w.querySelectorAll<HTMLElement>('[data-jp-content-motion]')) for (const a of el.getAnimations?.() ?? []) if (a.id === 'jmotion') a.cancel(); };
  return {
    update(context) {
      const worlds = [...root.querySelectorAll<HTMLElement>('[data-jcanvas-world]')];
      for (const w of layouts.keys()) if (!worlds.includes(w)) { cancel(w); layouts.delete(w); }
      for (const w of worlds) {
        const previous = layouts.get(w) ?? new Map<string, Box>();
        const flight = { ms: Number(w.dataset.flightMs ?? MOTION_MS), ease: w.dataset.flightEase ?? MOTION_EASE };
        // 2) 变形（FLIP）：同一个 motion 键的布局位置变了 → 从旧位置、旧大小补间到新位置
        const seen = new Map(previous);
        for (const el of w.querySelectorAll<HTMLElement>('[data-jp-content-motion]')) {
          const key = el.dataset.jpContentMotion!;
          const r = offsetIn(el, w);
          if (!r) continue;
          const prev = previous.get(key);
          seen.set(key, r);
          if (!context.frame.animate) { for (const a of el.getAnimations?.() ?? []) if (a.id === 'jmotion') a.cancel(); }
          if (!prev || !context.frame.animate) continue;
          if (Math.abs(prev.x - r.x) < 0.5 && Math.abs(prev.y - r.y) < 0.5 && Math.abs(prev.w - r.w) < 0.5 && Math.abs(prev.h - r.h) < 0.5) continue;
          const dx = prev.x + prev.w / 2 - (r.x + r.w / 2);
          const dy = prev.y + prev.h / 2 - (r.y + r.h / 2);
          const sx = r.w > 0 && prev.w > 0 ? prev.w / r.w : 1;
          const sy = r.h > 0 && prev.h > 0 ? prev.h / r.h : 1;
          for (const a of el.getAnimations()) if (a.id === 'jmotion') a.cancel();
          if (typeof el.animate !== 'function') continue;
          const anim = el.animate(
            [{ translate: `${dx}px ${dy}px`, scale: `${sx} ${sy}` }, { translate: '0px 0px', scale: '1 1' }],
            { duration: el.dataset.jpContentMotionMs === undefined ? flight.ms : Number(el.dataset.jpContentMotionMs), easing: flight.ease, delay: Number(el.dataset.jpContentMotionDelay) || 0, fill: 'backwards' },
          );
          anim.id = 'jmotion';
        }
        layouts.set(w, seen);
      }
    },
    destroy() { for (const w of layouts.keys()) cancel(w); layouts.clear(); },
  };
};

export default defineRuntime({ id: 'content', observe, components: { Canvas: { react: Canvas } } });
