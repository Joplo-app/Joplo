import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { defineRuntime, type ComponentCtx, type PluginObserve } from '@joplo-app/kit/plugin';
import { useEngineFrame, useRoot } from '@joplo-app/kit/renderer';
import type { ContentFrame } from './plugin.ts';
const stillCss = '.jstage[data-jstill] [data-jcanvas],.jstage[data-jstill] [data-jcanvas] *{transition:none!important;animation-delay:0s!important;animation-duration:0s!important}';

type Box = { x: number; y: number; w: number; h: number };
type SubjectBox = Box & { style?: Record<string, string>; text?: string; clone?: HTMLElement; shells?: HTMLElement[] };
const subjectStyle = (el: HTMLElement) => {
  // Read the authored destination, not this observer's currently interpolated style.
  const active = (el.getAnimations?.() ?? []).filter(a => a.id === 'jmotion').map(a => ({ a, effect: a.effect }));
  for (const { a } of active) a.effect = null;
  try { const c = getComputedStyle(el); return { borderRadius: c.borderRadius, color: c.color, backgroundColor: c.backgroundColor, opacity: c.opacity }; }
  finally { for (const { a, effect } of active) a.effect = effect; }
};
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
type DriftSpec = { zoom: number; x: number; y: number; ms: number };
type CanvasCamera = { targets?: string[]; pad?: number; zoom?: number; ms?: number; drift?: unknown; sequenceId?: number; sequence?: { atMs: number; targets: string[]; pad?: number; zoom?: number; ease?: 'easeInOut' | 'easeOut' | 'linear' }[] };
const numOr = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : d);
/** 默认漂移（D92）：画面永远不在数学意义上静止——落定后 8 秒内再推近 4%（约 0.5%/s），非匀速、有终点。 */
export const DEFAULT_DRIFT: DriftSpec = { zoom: 1.04, x: 0, y: 0, ms: 8000 };

/** 安全区（D92）：view 里不被固定屏幕层（标题、时间轴）盖住的部分；[上, 右, 下, 左] 设计像素。 */
export type Safe = { top: number; right: number; bottom: number; left: number };
const NO_SAFE: Safe = { top: 0, right: 0, bottom: 0, left: 0 };
export function safeOf(v: unknown): Safe {
  if (!Array.isArray(v) || v.length !== 4 || v.some((n) => typeof n !== 'number' || !Number.isFinite(n) || n < 0)) return NO_SAFE;
  return { top: v[0], right: v[1], bottom: v[2], left: v[3] };
}
/** 镜头取景：把 r 等比放进 view 的安全区，居中；k 不超过 zoom。 */
export function canvasFrame(r: Box, view: { w: number; h: number }, zoom = 3, safe: Safe = NO_SAFE): { k: number; tx: number; ty: number } {
  const w = Math.max(1, view.w - safe.left - safe.right), h = Math.max(1, view.h - safe.top - safe.bottom);
  const k = Math.min(w / Math.max(1, r.w), h / Math.max(1, r.h), zoom);
  return { k, tx: safe.left + (w - r.w * k) / 2 - r.x * k, ty: safe.top + (h - r.h * k) / 2 - r.y * k };
}

type Frame = { k: number; tx: number; ty: number };
/** 镜头的一段：从 from 用 ms 缓动到 to，然后按 drift 继续漂移。时间都是引擎时间（暂停冻结、导出可录）。 */
export type CameraSegment = { from: Frame; to: Frame; start: number; ms: number; drift: DriftSpec | null };

/** cubic-bezier(x1,y1,x2,y2) 的 y(x)：牛顿迭代 + 二分兜底。 */
export function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const d = (3 * ax * t + 2 * bx) * t + cx;
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-6) return sy(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0, hi = 1;
    t = x;
    for (let i = 0; i < 30; i++) { const v = sx(t); if (Math.abs(v - x) < 1e-6) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return sy(t);
  };
}
const cameraEase = bezier(.65, 0, .35, 1);
/** 漂移的曲线：起步与收尾都是零速度（接在镜头落定之后不顿挫，到终点自然停下），不是匀速。 */
const driftEase = bezier(.37, 0, .63, 1);

/** 在画面中心（有安全区时是安全区中心）保持不动的前提下，把取景 f 推近 zoom 倍、平移 (x, y)（设计坐标）。 */
export function drifted(f: Frame, d: DriftSpec, q: number, view: { w: number; h: number; cx?: number; cy?: number }): Frame {
  const z = 1 + (d.zoom - 1) * q;
  const ox = view.cx ?? view.w / 2, oy = view.cy ?? view.h / 2;
  const cx = (ox - f.tx) / f.k + d.x * q;
  const cy = (oy - f.ty) / f.k + d.y * q;
  const k = f.k * z;
  return { k, tx: ox - cx * k, ty: oy - cy * k };
}

/** 镜头在引擎时间 t 的实际取景（含漂移）。 */
export function cameraAt(seg: CameraSegment, t: number, view: { w: number; h: number; cx?: number; cy?: number }): Frame {
  const p = seg.ms > 0 ? Math.max(0, Math.min(1, (t - seg.start) / seg.ms)) : 1;
  if (p < 1) {
    const e = cameraEase(p);
    return { k: seg.from.k + (seg.to.k - seg.from.k) * e, tx: seg.from.tx + (seg.to.tx - seg.from.tx) * e, ty: seg.from.ty + (seg.to.ty - seg.from.ty) * e };
  }
  if (!seg.drift) return seg.to;
  const q = driftEase(Math.max(0, Math.min(1, (t - seg.start - seg.ms) / seg.drift.ms)));
  return q > 0 ? drifted(seg.to, seg.drift, q, view) : seg.to;
}

/** Pure, clamped waypoint projection; each easing belongs to the destination waypoint. */
export function sequenceFrameAt(points: { atMs: number; frame: Frame; ease?: string }[], elapsedMs: number): Frame {
  if (elapsedMs <= points[0]!.atMs) return points[0]!.frame;
  for (let i = 1; i < points.length; i++) {
    const b = points[i]!, a = points[i - 1]!;
    if (elapsedMs > b.atMs) continue;
    const t = Math.max(0, Math.min(1, (elapsedMs - a.atMs) / (b.atMs - a.atMs)));
    const q = b.ease === 'linear' ? t : b.ease === 'easeOut' ? 1 - (1 - t) ** 3 : cameraEase(t);
    return { k: a.frame.k + (b.frame.k - a.frame.k) * q, tx: a.frame.tx + (b.frame.tx - a.frame.tx) * q, ty: a.frame.ty + (b.frame.ty - a.frame.ty) * q };
  }
  return points.at(-1)!.frame;
}

/** camera(…, { drift }) 优先，其次 <Canvas drift>，都没写时用 DEFAULT_DRIFT；false 关闭。 */
export function driftOf(camera: unknown, canvas: unknown): DriftSpec | null {
  const v = camera !== undefined ? camera : canvas !== undefined ? canvas : DEFAULT_DRIFT;
  if (v === false || v === null) return null;
  if (typeof v === 'number') return Number.isFinite(v) && v !== 1 ? { ...DEFAULT_DRIFT, zoom: v } : null;
  if (typeof v !== 'object') return null;
  const o = v as Partial<DriftSpec>;
  const d = { zoom: typeof o.zoom === 'number' ? o.zoom : 1, x: typeof o.x === 'number' ? o.x : 0, y: typeof o.y === 'number' ? o.y : 0, ms: typeof o.ms === 'number' && o.ms > 0 ? o.ms : DEFAULT_DRIFT.ms };
  return d.zoom === 1 && !d.x && !d.y ? null : d;
}
type Mark = { resetKey?: string; scenarioId: string; position: number; playground: boolean };
/**
 * 跳转（深链、上一步、重置、换章）还是“暂停 → 继续”？两者都会换 resetKey；继续播放时场景与步数不变、之前也没有自由体验。
 * 跳转时画面直接落定，继续时进退场与漂移接着走（D92）。
 */
export function jumpedSince(last: Mark | null, f: { resetKey?: string; scenarioId: string; position: number; playground?: boolean }): boolean {
  if (!last || last.resetKey === f.resetKey) return false;
  return !(last.scenarioId === f.scenarioId && last.position === f.position && !last.playground);
}
const markOf = (f: { resetKey?: string; scenarioId: string; position: number; playground?: boolean }): Mark => ({ resetKey: f.resetKey, scenarioId: f.scenarioId, position: f.position, playground: !!f.playground });
const same = (a: Frame, b: Frame) => Math.abs(a.k - b.k) <= 1e-4 && Math.abs(a.tx - b.tx) <= 0.5 && Math.abs(a.ty - b.ty) <= 0.5;

function Canvas({ ctx: context }: { ctx: ComponentCtx }) {
  const node = context.model;
  const p = context.node.props;
  const ctx = context.frame;
  // 镜头逐帧移动：只有画布本身订阅每一帧；世界里的子树用 useMemo 固定，不跟着每帧重渲染（D99）
  useEngineFrame(!!ctx.clock && ctx.animate);
  // screen 子元素固定在屏幕上（设计尺寸，随画布缩放，不随镜头动）：章节标记、来源、封面、行动号召
  const kids = node.children ?? [];
  const onScreen = kids.filter((c) => c.props?.screen === true);
  const inWorld = kids.filter((c) => c.props?.screen !== true);
  const viewArr = Array.isArray(p.view) ? p.view : [];
  const view = { w: numOr(viewArr[0], 1280), h: numOr(viewArr[1], 800) };
  const world = { w: numOr(p.w, view.w), h: numOr(p.h, view.h) };
  const { w: _w, h: _h, view: _v, drift: canvasDrift, safe: safeProp, ...rest } = p;
  const safe = safeOf(safeProp);
  // 漂移围绕安全区中心（被叠层盖住的部分不算画面中心）
  const lensView = { ...view, cx: safe.left + (view.w - safe.left - safe.right) / 2, cy: safe.top + (view.h - safe.top - safe.bottom) / 2 };
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
  const clock = ctx.clock;
  // 引擎时钟驱动（D92）：镜头的每一段从“此刻实际的取景”出发，落定后按 drift 漂移；没有时钟的宿主退回 CSS 过渡、不漂移
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const timed = !!clock && ctx.animate && !reduced;
  const now = clock?.timeMs ?? 0;
  const seg = useRef<CameraSegment>({ from: whole, to: whole, start: now, ms: 0, drift: null });
  const [, redraw] = useState(0);
  const lastMark = useRef<Mark | null>(null);
  const target = useRef<Frame>(whole);
  const driftKey = useRef('');
  const pathRef = useRef<{ key: string; start: number; frames: { atMs: number; frame: Frame; ease?: string }[] } | null>(null);
  useLayoutEffect(() => {
    const w = worldRef.current;
    if (!w) return;
    const frameFor = (ids: string[], pad = 48, zoom = 3): Frame => {
      const boxes = ids.flatMap(id => { const el = w.querySelector<HTMLElement>(`[data-jid="${CSS.escape(id)}"]`); const b = el ? offsetIn(el, w) : null; return b ? [b] : []; });
      if (!boxes.length) return whole;
      const x = Math.min(...boxes.map(b => b.x)) - pad, y = Math.min(...boxes.map(b => b.y)) - pad;
      return canvasFrame({ x, y, w: Math.max(...boxes.map(b => b.x + b.w)) + pad - x, h: Math.max(...boxes.map(b => b.y + b.h)) + pad - y }, view, zoom, safe);
    };
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
        next = canvasFrame({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, view, cam?.zoom ?? 3, safe);
      }
    }
    const pathKey = JSON.stringify([ctx.scenarioId, cam?.sequenceId, cam?.sequence ?? null]);
    if (cam?.sequence && (pathRef.current?.key !== pathKey || jumpedSince(lastMark.current, ctx))) {
      const live = (cam.sequenceId ?? 0) > 0 && timed && !!clock?.running && lastMark.current !== null && !jumpedSince(lastMark.current, ctx) && !ctx.playground;
      pathRef.current = { key: pathKey, start: live ? now : now - cam.sequence.at(-1)!.atMs, frames: cam.sequence.map(p => ({ atMs: p.atMs, frame: frameFor(p.targets, p.pad, p.zoom), ease: p.ease })) };
    } else if (!cam?.sequence) pathRef.current = null;
    const drift = timed ? driftOf(cam?.drift, canvasDrift) : null;
    const dk = JSON.stringify(drift);
    const camMoves = !same(target.current, next);
    const mounted = lastMark.current !== null;
    const jumped = jumpedSince(lastMark.current, ctx);
    lastMark.current = markOf(ctx);
    // 时钟停了（不是暂停）而镜头段还没走完：直接落到目标，不卡在半路（D97：手动单步的收尾比作者写的 ms 短时）
    const stranded = timed && !!clock && !clock.running && !clock.paused && seg.current.ms > 0 && now < seg.current.start + seg.current.ms;
    if (camMoves || jumped || !mounted || stranded || dk !== driftKey.current || !timed && seg.current.drift) {
      target.current = next;

      // 只有连续播放中（时钟在走、已经挂载过、不是跳转）才补间；首次挂载、停止状态、跳转、截图与静态画面直接落定（D92 R1）。
      // 暂停时目标不会变，已有的镜头段原样冻结。
      const glide = timed && (camMoves || dk !== driftKey.current) && !jumped && mounted && !!clock?.running;
      driftKey.current = dk;
      const from = glide ? cameraAt(seg.current, now, lensView) : next;
      seg.current = { from, to: next, start: now, ms: glide ? cam?.ms ?? 1200 : 0, drift };
      redraw((n) => n + 1);
    }
    // 镜头同一步也在动：变形用镜头的时长与缓动，两者同步落定（否则屏幕上的轨迹会先冲过头再折回）
    const flight = camMoves && ctx.animate ? { ms: cam?.ms ?? 1200, ease: CAMERA_EASE } : { ms: MOTION_MS, ease: MOTION_EASE };
    w.dataset.flightMs = String(flight.ms);
    w.dataset.flightEase = flight.ease;
  });
  // 子树只随节点模型变化；状态变化仍经渲染上下文传到各个节点
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const worldKids = useMemo(() => context.renderChildren(inWorld), [node]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const screenKids = useMemo(() => onScreen.map((c) => <div key={c.id} style={{ pointerEvents: 'auto' }}>{context.renderChildren([c])}</div>), [node]);
  const s = box.w && box.h ? Math.min(box.w / view.w, box.h / view.h) : 0;
  const ox = (box.w - view.w * s) / 2;
  const oy = (box.h - view.h * s) / 2;
  const frame = cam?.sequence && pathRef.current ? sequenceFrameAt(pathRef.current.frames, !timed || ctx.playground || !clock?.running && !clock?.paused ? Infinity : now - pathRef.current.start) : timed ? cameraAt(seg.current, now, lensView) : seg.current.to;
  const ms = cam?.ms ?? 1200;
  return (
    <div {...root}>
      <style>{stillCss}</style>
      <div ref={outer} style={{ position: 'absolute', inset: 0 }} data-jcanvas="" data-jreport-surface="Canvas" data-joplo-audit-phases={timed && !ctx.playground && (clock?.running || clock?.paused) ? JSON.stringify({ clockMs: now, phases: pathRef.current
        ? pathRef.current.frames.map(point => ({ phase: 'camera-waypoint', atMs: pathRef.current!.start + point.atMs }))
        : [{ phase: 'camera-end', atMs: seg.current.start + seg.current.ms }, ...(seg.current.drift ? [{ phase: 'drift-mid', atMs: seg.current.start + seg.current.ms + seg.current.drift.ms / 2 }, { phase: 'drift-end', atMs: seg.current.start + seg.current.ms + seg.current.drift.ms }] : [])],
      }) : undefined}>
        <div
          ref={worldRef}
          data-jcanvas-world="" data-jreport-viewport=""
          style={{
            position: 'absolute', left: 0, top: 0, width: world.w, height: world.h, transformOrigin: '0 0',
            visibility: s ? 'visible' : 'hidden',
            transform: `translate(${ox + frame.tx * s}px, ${oy + frame.ty * s}px) scale(${frame.k * s})`,
            transition: !timed && ctx.animate && !clock ? `transform ${ms}ms ${CAMERA_EASE}` : 'none',
          }}
        >
          {worldKids}
        </div>
        {onScreen.length ? (
          <div data-jcanvas-screen="" style={{ position: 'absolute', left: ox, top: oy, width: view.w, height: view.h, transformOrigin: '0 0', transform: `scale(${s})`, visibility: s ? 'visible' : 'hidden', pointerEvents: 'none' }}>
            {screenKids}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * 进退场（D92）：每个预设是一个“离场姿态”。进场从离场姿态回到元素自己的样子，退场从元素自己的样子走到离场姿态；
 * 用单个关键帧（另一端是元素的底层样式），不覆盖作者自己的 opacity / transform。
 */
export const AWAY: Record<string, Keyframe> = {
  fade: { opacity: 0 },
  rise: { opacity: 0, translate: '0 18%' },
  zoom: { opacity: 0, scale: '1.16' },
  shrink: { opacity: 0, scale: '.84' },
  wipe: { clipPath: 'inset(0 100% 0 0)' },
  iris: { clipPath: 'circle(0% at 50% 50%)' },
  /** 从 0 长出来：grow 从左边横向长（横条、时间轴线、下划线），growUp 从底边往上长（柱子）。方向写明，不按宽高猜（很短的横条比它的高还窄）。 */
  grow: { scale: '0 1', transformOrigin: '0 50%' },
  growUp: { scale: '1 0', transformOrigin: '50% 100%' },
  blur: { opacity: 0, filter: 'blur(14px)' },
};
const ENTER_EASE = 'cubic-bezier(.16,1,.3,1)';
const EXIT_EASE = 'cubic-bezier(.55,0,.75,.2)';
const ENTER_MS = 600;
const EXIT_MS = 450;
const msOf = (v: string | undefined, d: number) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Math.max(0, Number(v)));

/**
 * 阻尼弹簧从 0 到 1 的位置。时间归一化：t = 1 时振幅包络衰减到千分之一（视觉上已落定），
 * 所以作者写的 ms 就是弹簧的总时长。zeta 是阻尼比：越小冲得越远、晃得越多。
 */
export function springAt(zeta: number, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const w = Math.log(1000) / zeta;
  const wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + (zeta * w / wd) * Math.sin(wd * t));
}
/** 把弹簧采样成 CSS linear() 缓动：WAAPI 直接用，引擎时钟照常采样（暂停、跳转、导出都一致）。 */
export function springEasing(zeta: number, samples = 60): string {
  const pts = Array.from({ length: samples + 1 }, (_, i) => (i === samples ? 1 : springAt(zeta, i / samples)));
  return `linear(${pts.map(v => String(Math.round(v * 10000) / 10000)).join(', ')})`;
}
/** 不支持 linear() 的浏览器（el.animate 会因非法缓动抛错）退回一条略冲过终点的贝塞尔。 */
const linearOk = () => typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('animation-timing-function', 'linear(0, 1)');
const EASE_CURVES: Record<string, () => string> = {
  snappy: () => 'cubic-bezier(.05,.7,.1,1)',
  linear: () => 'linear',
  spring: () => (linearOk() ? springEasing(.5) : 'cubic-bezier(.34,1.4,.64,1)'),
  bounce: () => (linearOk() ? springEasing(.32) : 'cubic-bezier(.34,1.8,.64,1)'),
};
/** 缓动预设 → CSS 缓动；没写或 smooth 用这一类动画自己的默认曲线。 */
export function easeOf(preset: string | undefined, fallback: string): string {
  const curve = preset && preset !== 'smooth' ? EASE_CURVES[preset] : undefined;
  return curve ? curve() : fallback;
}
/** 错峰：同一个容器里这一次一起出现（或一起离开）的元素，第 rank 个多等 rank × stagger 毫秒。 */
export function staggered(ranks: Map<Element, number>, host: Element | null, attr: 'enterStagger' | 'exitStagger'): number {
  if (!(host instanceof HTMLElement)) return 0;
  const step = msOf(host.dataset[attr === 'enterStagger' ? 'jpContentEnterStagger' : 'jpContentExitStagger'], 0);
  const rank = ranks.get(host) ?? 0;
  ranks.set(host, rank + 1);
  return rank * step;
}
/** 幽灵不带身份：不能被镜头、FLIP、检查、提示、无障碍树或键盘找到。 */
const IDENTITY = ['id', 'name', 'for', 'tabindex', 'autofocus', 'contenteditable', 'data-jid', 'data-jinteractive', 'data-jhover'];
function strip(el: Element) {
  for (const n of [el, ...el.querySelectorAll('*')]) {
    for (const a of IDENTITY) n.removeAttribute(a);
    for (const a of [...n.getAttributeNames()]) if (a.startsWith('data-jp-content-')) n.removeAttribute(a);
  }
}
/** 克隆不带表单的实时值与画布像素：从（已卸载的）原元素抄过来，外观与移除前一致。 */
function copyLive(from: Element, to: Element) {
  const a = [from, ...from.querySelectorAll('*')], b = [to, ...to.querySelectorAll('*')];
  a.forEach((src, i) => {
    const dst = b[i];
    if (!dst) return;
    if (src instanceof HTMLInputElement && dst instanceof HTMLInputElement) { dst.value = src.value; dst.checked = src.checked; }
    else if ((src instanceof HTMLTextAreaElement || src instanceof HTMLSelectElement) && (dst instanceof HTMLTextAreaElement || dst instanceof HTMLSelectElement)) dst.value = src.value;
    else if (src instanceof HTMLCanvasElement && dst instanceof HTMLCanvasElement) { try { dst.getContext('2d')?.drawImage(src, 0, 0); } catch { /* tainted / zero-size */ } }
  });
}

/**
 * <Split> 的拆法：返回一串“组”，字符串是原样保留的空白，数组是一个不断行的词（里面每一项是一块，逐块进场）。
 * word：Intl.Segmenter 按词切（中文也能切成词），标点贴在前一个词后面，行首不会出现孤立的标点。
 * char：先按词分组（词内不断行），组内按字形（emoji、组合字符不拆）一块一块。
 */
export function splitPieces(text: string, by: 'word' | 'char' = 'word'): (string | string[])[] {
  const Seg = (Intl as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(t: string): Iterable<{ segment: string; isWordLike?: boolean }> } }).Segmenter;
  const words: { s: string; space: boolean }[] = [];
  const raw = Seg ? [...new Seg(undefined, { granularity: 'word' }).segment(text)] : text.split(/(\s+)/).filter(Boolean).map(segment => ({ segment, isWordLike: !/^\s+$/.test(segment) }));
  let lead = '';
  for (const { segment, isWordLike } of raw) {
    const space = /^\s+$/.test(segment);
    const prev = words[words.length - 1];
    // 开括号、开引号贴到后一个词上；其余标点（不是词也不是空白）贴到前一个词上
    if (!space && !isWordLike && /^[\p{Ps}\p{Pi}]+$/u.test(segment)) { lead += segment; continue; }
    if (!space && !isWordLike && !lead && prev && !prev.space) { prev.s += segment; continue; }
    if (space) { if (lead) { words.push({ s: lead, space: false }); lead = ''; } words.push({ s: segment, space }); continue; }
    words.push({ s: lead + segment, space: false }); lead = '';
  }
  if (lead) words.push({ s: lead, space: false });
  const graphemes = (s: string) => (Seg ? [...new Seg(undefined, { granularity: 'grapheme' }).segment(s)].map(g => g.segment) : Array.from(s));
  return words.map(w => (w.space ? w.s : by === 'char' ? graphemes(w.s) : [w.s]));
}
const SPLIT_STAGGER = { word: 70, char: 30 };
const SR_ONLY = { position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 } as const;
const PIECE_ATTRS = ['data-jp-content-enter', 'data-jp-content-enter-ms', 'data-jp-content-enter-delay', 'data-jp-content-enter-ease'] as const;
/** 逐块进场的文字：进场属性写在每一块上（根元素自己不进场），根元素上的 enterStagger 决定间隔；读屏读整句。 */
function Split({ ctx: context }: { ctx: ComponentCtx }) {
  const p = context.node.props;
  const text = p.text === undefined || p.text === null ? '' : String(p.text);
  const by = p.by === 'char' ? 'char' : 'word';
  const { text: _t, by: _b, ...rest } = p;
  const root: Record<string, unknown> = useRoot(context.model, rest, {});
  const piece: Record<string, unknown> = { 'data-jp-content-enter': 'rise' };
  for (const a of PIECE_ATTRS) if (root[a] !== undefined) { piece[a] = root[a]; delete root[a]; }
  root['data-jp-content-enter-stagger'] ??= String(SPLIT_STAGGER[by]);
  const groups = useMemo(() => splitPieces(text, by), [text, by]);
  let n = 0;
  return (
    <span {...root}>
      <span style={SR_ONLY}>{text}</span>
      <span aria-hidden="true">
        {groups.map((g, i) => typeof g === 'string' ? g : (
          // key 带上整句：换了文字就是新的一批节点，整句重新逐块进场
          <span key={`${text}|${i}`} style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
            {g.map(c => <span key={n} {...piece} style={{ display: 'inline-block', whiteSpace: 'pre' }}>{(n++, c)}</span>)}
          </span>
        ))}
      </span>
    </span>
  );
}

/** One observer per stage: cache only design-space layouts, never player state. */
export const observe: PluginObserve = (root, initial) => {
  const context0Inputs = initial?.frame.inputs;
  const layouts = new Map<HTMLElement, Map<string, SubjectBox>>();
  const clips = new Map<HTMLElement, { count: number; value: string; priority: string }>();
  // FLIP crosses containers; their normal overflow must not clip that travel.
  const lift = (el: HTMLElement, world: HTMLElement) => {
    const held: HTMLElement[] = [];
    for (let p = el.parentElement; p && p !== world; p = p.parentElement) {
      const existing = clips.get(p);
      const css = getComputedStyle(p);
      if (!existing && ![css.overflowX, css.overflowY].some(v => ['hidden', 'clip', 'auto', 'scroll'].includes(v))) continue;
      const entry = existing ?? { count: 0, value: p.style.getPropertyValue('overflow'), priority: p.style.getPropertyPriority('overflow') };
      entry.count++; clips.set(p, entry); held.push(p);
      p.style.setProperty('overflow', 'visible', 'important');
    }
    return () => { for (const p of held) {
      const entry = clips.get(p); if (!entry || --entry.count > 0) continue;
      if (entry.value) p.style.setProperty('overflow', entry.value, entry.priority); else p.style.removeProperty('overflow');
      clips.delete(p);
    } };
  };
  const flights = new Map<Animation, { el: HTMLElement; world: HTMLElement; effect: AnimationEffect | null; release: (() => void) | null }>();
  const forget = (a: Animation) => { flights.get(a)?.release?.(); flights.delete(a); };
  const cancel = (w: HTMLElement) => { for (const el of w.querySelectorAll<HTMLElement>('[data-jp-content-motion]')) for (const a of el.getAnimations?.() ?? []) if (a.id === 'jmotion') a.cancel(); };

  // ---- 进退场（D92）----
  // 退场的幽灵：被 React 移除的元素的克隆，放回原来的父元素、原来的位置（同样的选择器上下文），绝对定位在移除前的布局上，
  // 播完退场动画就删掉。React 只操作它自己创建的节点，幽灵不在它的树里。
  const ghosts = new Map<Element, Animation | null>();
  const entering = new Set<Animation>();
  const exitBoxes = new Map<HTMLElement, Map<HTMLElement, Box>>();
  const present = new WeakSet<Element>();
  const watchers = new Map<HTMLElement, MutationObserver>();
  let quiet = true;
  let last: Mark | null = null;
  let lastInputs: number | undefined = context0Inputs;
  const drop = (outer: Element) => { ghosts.delete(outer); outer.remove(); };
  /** 落定：进场直接到终态、幽灵立刻消失（跳转、自由体验、停止、截图、组件卸载）。 */
  const settle = () => {
    for (const [outer, a] of [...ghosts]) { a?.cancel(); drop(outer); }
    for (const a of [...entering]) { entering.delete(a); a.cancel(); }
  };
  const ghostOf = (el: HTMLElement, removed: HTMLElement, parent: Node, next: Node | null, world: HTMLElement, ranks: Map<Element, number>) => {
    const box = exitBoxes.get(world)?.get(el);
    const kind = el.dataset.jpContentExit ?? '';
    const away = AWAY[kind];
    if (!box || !away || typeof el.animate !== 'function') return;
    // 同一个 motion 键在新画面里还在：交给 FLIP（以变形为准，不叠加退场）
    const key = el.dataset.jpContentMotion;
    if (key && world.querySelector(`[data-jp-content-motion="${CSS.escape(key)}"]`)) return;
    if (!(parent instanceof HTMLElement) || !parent.isConnected || !world.contains(parent)) return;
    const ghost = el.cloneNode(true) as HTMLElement;
    copyLive(el, ghost);
    let outer: HTMLElement = ghost;
    // 一起被移除的祖先（el 在被移除的子树里面）：只留 display: contents 的外壳，选择器与继承的样式照旧，不产生盒子
    for (let a = el === removed ? null : el.parentElement; a; a = a === removed ? null : a.parentElement) {
      const shell = a.cloneNode(false) as HTMLElement;
      shell.style.setProperty('display', 'contents', 'important');
      shell.append(outer);
      outer = shell;
    }
    strip(outer);
    outer.setAttribute('data-jghost', '');
    outer.setAttribute('aria-hidden', 'true');
    outer.inert = true;
    const put = (k: string, v: string) => ghost.style.setProperty(k, v, 'important');
    put('position', 'absolute'); put('left', '0px'); put('top', '0px'); put('margin', '0px'); put('box-sizing', 'border-box');
    put('width', `${box.w}px`); put('height', `${box.h}px`); put('pointer-events', 'none');
    parent.insertBefore(outer, next && next.parentNode === parent ? next : null);
    const origin = offsetIn(ghost, world);
    if (!origin) { outer.remove(); return; }
    put('left', `${box.x - origin.x}px`); put('top', `${box.y - origin.y}px`);
    // 错峰的容器：先在一起被移除的子树里找，再从仍在页面上的父元素往上找
    let host: Element | null = null;
    for (let a = el === removed ? null : el.parentElement; a && !host; a = a === removed ? null : a.parentElement) if (a.hasAttribute('data-jp-content-exit-stagger')) host = a;
    host ??= parent.closest('[data-jp-content-exit-stagger]');
    const delay = msOf(el.dataset.jpContentExitDelay, 0) + staggered(ranks, host, 'exitStagger');
    const anim = ghost.animate([{ ...away, offset: 1 }], { duration: msOf(el.dataset.jpContentExitMs, EXIT_MS), delay, easing: easeOf(el.dataset.jpContentExitEase, EXIT_EASE), fill: 'forwards' });
    anim.id = 'jexit';
    ghosts.set(outer, anim);
    const done = () => { if (ghosts.get(outer) === anim) drop(outer); };
    anim.addEventListener('finish', done, { once: true });
    anim.addEventListener('cancel', done, { once: true });
  };
  const handle = (records: MutationRecord[], world: HTMLElement) => {
    const ranks = new Map<Element, number>();
    for (const r of records) for (const n of r.removedNodes) {
      if (!(n instanceof HTMLElement) || n.isConnected || ghosts.has(n) || n.hasAttribute('data-jghost') || quiet) continue;
      const marked = [...(n.hasAttribute('data-jp-content-exit') ? [n] : []), ...n.querySelectorAll<HTMLElement>('[data-jp-content-exit]')];
      for (const el of marked) {
        let outermost = true;
        for (let a = el === n ? null : el.parentElement; a; a = a === n ? null : a.parentElement) if (a.hasAttribute('data-jp-content-exit')) { outermost = false; break; }
        if (outermost) ghostOf(el, n, r.target, r.nextSibling, world, ranks);
      }
    }
  };
  const watch = (w: HTMLElement) => {
    if (watchers.has(w) || typeof MutationObserver === 'undefined') return;
    const mo = new MutationObserver((records) => handle(records, w));
    mo.observe(w, { childList: true, subtree: true });
    watchers.set(w, mo);
  };

  return {
    update(context) {
      const f = context.frame;
      const running = !f.clock || f.clock.running;
      const jumped = jumpedSince(last, f);
      // 观众刚在舞台上输入（D92 R6）：先落定进退场，再让输入作用在终态画面上；播放器的普通暂停不改变 inputs，仍冻结
      const touched = f.inputs !== undefined && f.inputs !== lastInputs;
      lastInputs = f.inputs;
      quiet = !f.animate || !!f.playground || !running || jumped || touched;
      // 暂停：保持冻结（引擎时钟不走）；其余安静的情况一律落定
      if (!f.animate || f.playground || jumped || touched || (!running && !f.clock?.paused)) settle();
      last = markOf(f);
      // 这次提交里被移除的节点同步处理：此刻的布局缓存还是移除前的
      for (const [w, mo] of watchers) handle(mo.takeRecords(), w);
      for (const [outer] of ghosts) if (!outer.isConnected) ghosts.delete(outer);
      for (const [animation, flight] of flights) {
        if (!context.frame.animate || !root.contains(flight.el)) { animation.cancel(); forget(animation); continue; }
        if (context.frame.playground && animation.effect) {
          // Keep the animation identity/time anchor, but yield its transform to
          // the editable final layout. Restoring the effect resumes one clock.
          animation.effect = null; flight.release?.(); flight.release = null;
        } else if (!context.frame.playground && !animation.effect) {
          animation.effect = flight.effect; flight.release = lift(flight.el, flight.world);
        }
      }
      // 画布世界与固定屏幕层（screen 子元素：时间轴、角标）都是“表面”：进退场与变形在两者里都生效，镜头只动世界
      const worlds = [...root.querySelectorAll<HTMLElement>('[data-jcanvas-world],[data-jcanvas-screen]')];
      for (const w of layouts.keys()) if (!worlds.includes(w)) { cancel(w); layouts.delete(w); exitBoxes.delete(w); watchers.get(w)?.disconnect(); watchers.delete(w); }
      for (const w of worlds) {
        const fresh = !layouts.has(w);
        watch(w);
        const previous = layouts.get(w) ?? new Map<string, SubjectBox>();
        const flight = { ms: Number(w.dataset.flightMs ?? MOTION_MS), ease: w.dataset.flightEase ?? MOTION_EASE };
        // 2) 变形（FLIP）：同一个 motion 键的布局位置变了 → 从旧位置、旧大小补间到新位置
        const seen = new Map(previous);
        for (const el of w.querySelectorAll<HTMLElement>('[data-jp-content-motion]')) {
          const key = el.dataset.jpContentMotion!;
          const r = offsetIn(el, w);
          if (!r) continue;
          const prev = previous.get(key);
          const style = subjectStyle(el), text = el.textContent ?? '';
          const shells: HTMLElement[] = [];
          for (let p = el.parentElement; p && p !== w; p = p.parentElement) shells.push(p.cloneNode(false) as HTMLElement);
          seen.set(key, { ...r, style, text, clone: el.cloneNode(true) as HTMLElement, shells });
          if (!context.frame.animate) { for (const a of el.getAnimations?.() ?? []) if (a.id === 'jmotion') a.cancel(); }
          // 跳转、停止后的提交与静态画面直接显示新布局（D92）：变形飞行只属于连续播放
          if (!prev || !context.frame.animate || context.frame.playground || quiet) { if (quiet) for (const a of el.getAnimations?.() ?? []) if (a.id === 'jmotion') a.cancel(); continue; }
          const styleChanged = prev.style && Object.keys(style).some(k => prev.style![k] !== style[k as keyof typeof style]);
          const textChanged = prev.text !== undefined && prev.text !== text;
          if (!styleChanged && !textChanged && Math.abs(prev.x - r.x) < 0.5 && Math.abs(prev.y - r.y) < 0.5 && Math.abs(prev.w - r.w) < 0.5 && Math.abs(prev.h - r.h) < 0.5) continue;
          const dx = prev.x + prev.w / 2 - (r.x + r.w / 2);
          const dy = prev.y + prev.h / 2 - (r.y + r.h / 2);
          const sx = r.w > 0 && prev.w > 0 ? prev.w / r.w : 1;
          const sy = r.h > 0 && prev.h > 0 ? prev.h / r.h : 1;
          for (const a of el.getAnimations()) if (a.id === 'jmotion') a.cancel();
          if (typeof el.animate !== 'function') continue;
          const anim = el.animate(
            [{ ...prev.style, ...(textChanged ? { opacity: 0 } : {}), translate: `${dx}px ${dy}px`, scale: `${sx} ${sy}` }, { ...style, translate: '0px 0px', scale: '1 1' }],
            { duration: el.dataset.jpContentMotionMs === undefined ? flight.ms : Number(el.dataset.jpContentMotionMs), easing: easeOf(el.dataset.jpContentMotionEase, flight.ease), delay: Number(el.dataset.jpContentMotionDelay) || 0, fill: 'backwards' },
          );
          if (textChanged && prev.clone) {
            const ghost = prev.clone.cloneNode(true) as HTMLElement;
            let outer = ghost;
            for (const parent of prev.shells ?? []) { const shell = parent.cloneNode(false) as HTMLElement; shell.style.setProperty('display', 'contents', 'important'); shell.append(outer); outer = shell; }
            strip(outer); outer.setAttribute('aria-hidden', 'true'); outer.setAttribute('inert', ''); outer.dataset.jghost = '';
            Object.assign(ghost.style, { position: 'absolute', left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px`, margin: '0', pointerEvents: 'none', ...prev.style });
            w.appendChild(outer);
            const fade = ghost.animate([{ opacity: prev.style?.opacity ?? '1', translate: `${dx}px ${dy}px`, scale: `${sx} ${sy}` }, { opacity: 0, translate: '0px 0px', scale: '1 1' }], { duration: el.dataset.jpContentMotionMs === undefined ? flight.ms : Number(el.dataset.jpContentMotionMs), easing: easeOf(el.dataset.jpContentMotionEase, flight.ease), delay: Number(el.dataset.jpContentMotionDelay) || 0, fill: 'both' });
            ghosts.set(outer, fade); fade.addEventListener('finish', () => drop(outer), { once: true }); fade.addEventListener('cancel', () => drop(outer), { once: true });
          }
          anim.id = 'jmotion';
          flights.set(anim, { el, world: w, effect: anim.effect, release: lift(el, w) });
          anim.addEventListener('finish', () => forget(anim), { once: true });
          anim.addEventListener('cancel', () => forget(anim), { once: true });
        }
        // 3) 进场：第一次出现的元素（新的 DOM 节点）。画布刚出现、安静的提交、FLIP 接管的同键元素都不播
        // 错峰按文档顺序数：同一个 enterStagger 容器里这次真正播进场的第 n 个，多等 n × stagger
        const ranks = new Map<Element, number>();
        for (const el of w.querySelectorAll<HTMLElement>('[data-jp-content-enter]')) {
          if (present.has(el)) continue;
          present.add(el);
          const kind = el.dataset.jpContentEnter ?? '';
          if (fresh || quiet || !AWAY[kind] || typeof el.animate !== 'function' || el.closest('[data-jghost]')) continue;
          const key = el.dataset.jpContentMotion;
          if (key && previous.has(key)) continue;
          const delay = msOf(el.dataset.jpContentEnterDelay, 0) + staggered(ranks, el.parentElement?.closest('[data-jp-content-enter-stagger]') ?? null, 'enterStagger');
          const anim = el.animate([{ ...AWAY[kind], offset: 0 }], { duration: msOf(el.dataset.jpContentEnterMs, ENTER_MS), delay, easing: easeOf(el.dataset.jpContentEnterEase, ENTER_EASE), fill: 'backwards' });
          anim.id = 'jenter';
          entering.add(anim);
          anim.addEventListener('finish', () => entering.delete(anim), { once: true });
          anim.addEventListener('cancel', () => entering.delete(anim), { once: true });
        }
        // 4) 退场要用的布局：每次提交后记下带 exit 的元素此刻的位置大小（被移除时它已经量不到了）
        const boxes = new Map<HTMLElement, Box>();
        for (const el of w.querySelectorAll<HTMLElement>('[data-jp-content-exit]')) {
          if (el.closest('[data-jghost]')) continue;
          const b = offsetIn(el, w);
          if (b) boxes.set(el, b);
        }
        exitBoxes.set(w, boxes);
        if (!context.frame.playground) layouts.set(w, seen);
      }
    },
    destroy() {
      settle();
      for (const mo of watchers.values()) mo.disconnect();
      watchers.clear();
      for (const [animation] of flights) { animation.cancel(); forget(animation); }
      for (const w of layouts.keys()) cancel(w);
      layouts.clear();
      exitBoxes.clear();
    },
  };
};

export default defineRuntime({ id: 'content', observe, components: { Canvas: { react: Canvas }, Split: { react: Split } } });
