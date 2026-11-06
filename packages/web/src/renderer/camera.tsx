/**
 * 镜头（D43 / T-layers）：在“这一层自己的画面”里平移、缩放到焦点元素的包围盒，四周留出内边距。
 *
 * - 每层是独立画面，镜头只在这一层的坐标里计算；镜头容器包住画面内容和弹窗层，Toast、鼠标等覆盖层在镜头之外。
 * - 测量用“内容坐标”：元素的屏幕矩形减去镜头容器左上角，再除以容器当前的总缩放；所以过渡中途测量也正确。
 * - 焦点用元素“实际可见”的矩形（与裁切它的祖先求交，见 camera-math 的 visibleRect）；在滚动区里的目标先滚到可见处。
 * - 不再用覆盖舞台的遮罩：焦点外的内容降低不透明度（沿焦点的祖先链，把每一层的兄弟元素调暗），不遮挡任何东西。
 * - 高光框画在镜头容器里、贴着焦点的可见矩形，随镜头动画一起移动；出现时脉冲一次。
 * - animate=false（renderStep 静态截图、减少动态效果）时直接到位，没有过渡与脉冲。
 * - 自由缩放（T-director2）：opts.user 是用户用滚轮 / 捏合 / 拖动得到的视图；有它时用它，镜头算出的视图（base）照常更新但不应用；
 *   user 变回 null（下一步导演接管、点「适应画面」）时平滑回到 base。
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { animate as animateEl, motion } from 'motion/react';
import { Rough, useStroke } from './rough';
import { fitCamera, highlightRect, revealScroll, union, visibleRect, type Box, type View } from './camera-math';
import { CAMERA_EASE, CAMERA_MS } from '../runtime/pace';

export type CameraSpec = {
  /** 对准的元素 id；空 = 这一层（这个画面）整体。 */
  targets: string[];
  /** 镜头标识（层级 + 目标）：变化时高光脉冲一次。 */
  key: string;
};

/**
 * 元素的屏幕矩形；架构图里正在移向聚焦布局的节点（data-jfinal）取它的最终位置（画布坐标 × 画布此刻的屏幕缩放），
 * 镜头与高光不用等节点移动结束，也不会对准移动途中的位置（T-director3）。
 */
export function finalRect(el: Element): { left: number; top: number; width: number; height: number } {
  const f = el.getAttribute('data-jfinal');
  const canvas = f ? el.closest<HTMLElement>('[data-jdiagram-canvas]') : null;
  if (!f || !canvas) return el.getBoundingClientRect();
  const [x, y, w, h] = f.split(',').map(Number) as [number, number, number, number];
  const cr = canvas.getBoundingClientRect();
  const sc = cr.width / (canvas.offsetWidth || 1) || 1;
  return { left: cr.left + x * sc, top: cr.top + y * sc, width: w * sc, height: h * sc };
}

/** 镜头容器里内容的范围（内容坐标，至少是整个画面）：整层缩放与平移夹紧都用它。 */
export function contentBounds(wrap: HTMLElement, content: HTMLElement | null, W: number, H: number): Box {
  const wr = wrap.getBoundingClientRect();
  const S = wr.width / (wrap.offsetWidth || 1) || 1;
  const r = content?.firstElementChild?.getBoundingClientRect();
  const c = r && r.height > 0 ? { x: (r.left - wr.left) / S, y: (r.top - wr.top) / S, w: r.width / S, h: r.height / S } : null;
  return union([{ x: 0, y: 0, w: W, h: H }, ...(c ? [c] : [])])!;
}

export type CameraView = { k: number; tx: number; ty: number; mode: 'focus' | 'overview'; rects: { id: string; box: Box }[] };

const round = (n: number) => Math.round(n * 100) / 100;
const FOCUS_ATTRS = ['data-jfocus', 'data-jfocus-path'] as const;

/** 镜头的计算与应用。wrapRef 挂在镜头容器上，contentRef 挂在画面内容上。 */
/** 换层时先在整层停留多久再推近（D67，先全景再放大）。 */
export const ESTABLISH_MS = 400;

/**
 * opts.establish（D67，默认焦点行为，config({ autoFocus: false }) 关闭）：导演换到另一层、且这一层要推近时，
 * 新画面淡入时先停在整层（不做动画），ESTABLISH_MS 后再平滑推近。没有它时镜头从上一层的视图直接过渡过去（方向随意）。
 * 首次挂载（打开深链接、截图）与静态截图不做。
 */
export function useCamera(spec: CameraSpec | null, opts: { width: number; height: number; animate: boolean; deps: unknown[]; user?: View | null; establish?: boolean }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<CameraView | null>(null);
  /** 最近一次应用到镜头容器上的视图（目标值）。 */
  const current = useRef<View>({ k: 1, tx: 0, ty: 0 });
  /** 镜头（导演 / 这一层的焦点）算出的视图。 */
  const base = useRef<View>({ k: 1, tx: 0, ty: 0 });
  /** 镜头对准过焦点（之后目标暂时不在画面上时保持不动，而不是先退到整层）。 */
  const hadFocus = useRef(false);
  const lastLayer = useRef('');
  const user = opts.user ?? null;
  const userRef = useRef<View | null>(user);
  userRef.current = user;
  const specKey = spec ? `${spec.key}|${spec.targets.join(',')}` : '';

  const applyTo = (wrap: HTMLElement, v: View, smooth: boolean) => {
    current.current = v;
    wrap.dataset.cameraView = JSON.stringify({ k: round(v.k), tx: round(v.tx), ty: round(v.ty) });
    wrap.dataset.zoom = userRef.current ? 'user' : 'camera';
    void animateEl(wrap, { x: v.tx, y: v.ty, scale: v.k }, smooth ? { duration: CAMERA_MS / 1000, ease: CAMERA_EASE } : { duration: 0 });
  };

  // 用户缩放 / 平移：立即应用；回到镜头（null）时平滑过渡
  const userSig = user ? `${user.k},${user.tx},${user.ty}` : '';
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    applyTo(wrap, user ?? base.current, !user && opts.animate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userSig]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const content = contentRef.current;
    const clearFocus = () => {
      for (const a of FOCUS_ATTRS) wrap.querySelectorAll(`[${a}]`).forEach((el) => el.removeAttribute(a));
      content?.removeAttribute('data-jfocus-dim');
    };
    // 镜头算出的视图：记为 base；用户正在自由缩放时不应用（等导演接管或「适应画面」）
    const apply = (k: number, tx: number, ty: number, smooth: boolean) => {
      base.current = { k, tx, ty };
      if (!userRef.current) applyTo(wrap, base.current, smooth);
    };
    if (!spec) {
      clearFocus();
      apply(1, 0, 0, false);
      setView(null);
      return;
    }
    const W = opts.width;
    const H = opts.height;
    // 换层（换画面）后重新开始：新画面里的目标还没出现时退到整层，而不是保持上一层的镜头
    const layerOf = spec.key.split('|')[0] ?? '';
    const cut = lastLayer.current !== '' && lastLayer.current !== layerOf;
    if (lastLayer.current !== layerOf) hadFocus.current = false;
    lastLayer.current = layerOf;
    /** 滚动区里的目标：把每个可滚动的祖先滚到目标可见（镜头只平移缩放，不会替页面滚动）。 */
    const reveal = () => {
      for (const id of spec.targets) {
        const el: Element | null = wrap.querySelector(`[data-jid="${CSS.escape(id)}"]`);
        if (!el) continue;
        for (let p: HTMLElement | null = el.parentElement; p && p !== wrap; p = p.parentElement) {
          const cs = getComputedStyle(p);
          const pr = p.getBoundingClientRect();
          const r = el.getBoundingClientRect();
          const s = pr.width / (p.offsetWidth || 1) || 1;
          if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight)
            p.scrollTop = revealScroll((r.top - pr.top) / s, r.height / s, p.clientHeight, p.scrollTop, p.scrollHeight - p.clientHeight);
          if (/(auto|scroll)/.test(cs.overflowX) && p.scrollWidth > p.clientWidth)
            p.scrollLeft = revealScroll((r.left - pr.left) / s, r.width / s, p.clientWidth, p.scrollLeft, p.scrollWidth - p.clientWidth);
        }
      }
    };
    const measure = (): (CameraView & { els: Element[] }) | null => {
      const wr = wrap.getBoundingClientRect();
      const S = wr.width / (wrap.offsetWidth || 1) || 1; // 屏幕像素 / 内容像素（含舞台外层缩放与镜头此刻的缩放，过渡中途也对）
      // 舞台外层缩放（看板按可用区域缩放舞台）：从没有镜头变换的舞台根量，过渡中途也稳定
      const host = wrap.parentElement;
      const outer = host ? host.getBoundingClientRect().width / (host.offsetWidth || 1) || 1 : S / (current.current.k || 1);
      const toBox = (r: { left: number; top: number; width: number; height: number }): Box => ({ x: (r.left - wr.left) / S, y: (r.top - wr.top) / S, w: r.width / S, h: r.height / S });
      /** 元素实际可见的矩形：与裁切它的祖先（直到镜头容器）求交。 */
      const visibleOf = (el: Element): Box | null => {
        const clips: Box[] = [];
        for (let p = el.parentElement; p && p !== wrap; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') clips.push(toBox(p.getBoundingClientRect()));
        }
        return visibleRect(toBox(finalRect(el)), clips);
      };
      const found = spec.targets
        .map((id) => ({ id, el: wrap.querySelector(`[data-jid="${CSS.escape(id)}"]`) }))
        .filter((x): x is { id: string; el: Element } => !!x.el)
        .map((x) => ({ ...x, box: visibleOf(x.el) }))
        .filter((x): x is { id: string; el: Element; box: Box } => !!x.box);
      // 写了目标但它们还不在画面上（例如这一步才出现的元素，状态尚未提交）：镜头先不动，等它们出现再对准
      if (spec.targets.length && !found.length && hadFocus.current) return { ...base.current, mode: 'focus', rects: [], els: [] };
      let mode: CameraView['mode'] = found.length ? 'focus' : 'overview';
      // 这一层内容的范围（至少是整个画面）：整层时整体缩进来；聚焦时尽量不露出它以外的空白
      const root = content?.firstElementChild;
      const c = root ? toBox(root.getBoundingClientRect()) : null;
      const bounds = union([{ x: 0, y: 0, w: W, h: H }, ...(c && c.h > 0 ? [c] : [])])!;
      // 架构图的聚焦布局：镜头框住整张小图（含连线标签），不只是被点名的节点
      const backdrops = new Set<Element>();
      for (const f of found) {
        const b = f.el.closest('[data-jdiagram-canvas]')?.querySelector('[data-jfocus-backdrop]');
        if (b) backdrops.add(b);
      }
      const extra = [...backdrops].map((b) => visibleRect(toBox(b.getBoundingClientRect()), [])).filter((b): b is Box => !!b);
      let bbox = mode === 'focus' ? union([...found.map((f) => f.box), ...extra]) : bounds;
      if (!bbox || bbox.w <= 0 || bbox.h <= 0) {
        mode = 'overview';
        bbox = { x: 0, y: 0, w: W, h: H };
      }
      // 对准架构图节点：每个节点“内容像素 → 屏幕像素”的比例，保证主标签在屏幕上 ≥ 16px
      const nodeScales = found
        .filter((f) => f.el.getAttribute('data-jtype') === 'Diagram.Node')
        .map((f) => (Number(f.el.closest('[data-jtype="Diagram"]')?.getAttribute('data-scale') ?? 1) || 1) * outer);
      const { k, tx, ty } = fitCamera({ W, H, mode, bbox, nodeScales, bounds });
      if (mode === 'focus') hadFocus.current = true;
      return { k, tx, ty, mode, rects: found.map((f) => ({ id: f.id, box: highlightRect(f.box) })), els: found.map((f) => f.el) };
    };
    /** 焦点外调暗：标记焦点与它的祖先链；CSS 把祖先链上每一层的其他兄弟元素调暗（index.css）。 */
    const markFocus = (els: Element[]) => {
      clearFocus();
      if (!content || !els.length) return;
      content.setAttribute('data-jfocus-dim', '');
      // 架构图聚焦布局里的小图节点（例如镜头对准连线时它的两端）同样是焦点，不被调暗
      for (const el of [...els, ...content.querySelectorAll('[data-jfocus-member]')]) {
        el.setAttribute('data-jfocus', '');
        for (let p = el.parentElement; p && p !== content; p = p.parentElement) p.setAttribute('data-jfocus-path', '');
      }
    };
    // 首帧过渡；随后几帧继续测量（字体、架构图尺寸可能稍后才稳定），有变化时直接修正
    let raf = 0;
    let n = 0;
    let last = '';
    const tick = () => {
      const v = measure();
      if (v) {
        // 内容坐标与镜头变换无关，过渡中途测量也一样；按 0.5px 比较，避免舍入抖动打断过渡
        const q = (x: number) => Math.round(x * 2) / 2;
        const sig = JSON.stringify([Math.round(v.k * 1000), q(v.tx), q(v.ty), v.rects.map((r) => [q(r.box.x), q(r.box.y), q(r.box.w), q(r.box.h)])]);
        if (sig !== last) {
          // 之后的修正（字体、架构图尺寸稍后才稳定）也平滑过去：Motion 从当前值接着过渡，不会跳
          apply(v.k, v.tx, v.ty, opts.animate);
          markFocus(v.els);
          setView({ k: v.k, tx: v.tx, ty: v.ty, mode: v.mode, rects: v.rects });
          last = sig;
        }
      }
      if (++n < 15) raf = requestAnimationFrame(tick);
      else wrap.dataset.cameraSettled = '1';
    };
    delete wrap.dataset.cameraSettled;
    reveal();
    // 先全景再推近（D67）：换层时先停在新画面的整层（被淡入盖住，不做动画），停一下再推近到焦点
    let establishTimer: ReturnType<typeof setTimeout> | 0 = 0;
    if (cut && opts.establish && opts.animate && spec.targets.length && !userRef.current) {
      const o = fitCamera({ W, H, mode: 'overview', bbox: contentBounds(wrap, content, W, H) });
      apply(o.k, o.tx, o.ty, false);
      // 上一层的高光与调暗不能留在新画面上
      clearFocus();
      setView({ k: o.k, tx: o.tx, ty: o.ty, mode: 'overview', rects: [] });
      wrap.dataset.establish = '1';
      establishTimer = setTimeout(() => { establishTimer = 0; delete wrap.dataset.establish; tick(); }, ESTABLISH_MS);
    } else tick();
    // 内容在停稳之后还会变（流式输出逐字变长、元素随后出现，D56）：每次变化后的下一帧重新测量，
    // 镜头与高光始终套住目标的最终大小。只听文字与子节点变化，不听属性（markFocus 自己会改属性）。
    let pending = 0;
    const remeasure = () => {
      pending = 0;
      if (establishTimer) return; // 正在整层停留：到时间再推近
      reveal();
      const v = measure();
      if (!v) return;
      const q = (x: number) => Math.round(x * 2) / 2;
      const sig = JSON.stringify([Math.round(v.k * 1000), q(v.tx), q(v.ty), v.rects.map((r) => [q(r.box.x), q(r.box.y), q(r.box.w), q(r.box.h)])]);
      if (sig === last) return;
      apply(v.k, v.tx, v.ty, opts.animate);
      markFocus(v.els);
      setView({ k: v.k, tx: v.tx, ty: v.ty, mode: v.mode, rects: v.rects });
      last = sig;
    };
    const mo = content && spec.targets.length ? new MutationObserver(() => {
      if (!pending) pending = requestAnimationFrame(remeasure);
    }) : null;
    mo?.observe(content!, { childList: true, characterData: true, subtree: true });
    return () => {
      if (establishTimer) clearTimeout(establishTimer);
      delete wrap.dataset.establish;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(pending);
      mo?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey, opts.width, opts.height, opts.animate, ...opts.deps]);

  return { wrapRef, contentRef, view, current };
}

/** 高光颜色：主题的 --jp-accent（D51）。 */
const ACCENT = 'var(--jp-accent)';

/** 高光：画在镜头容器里（内容坐标），贴着焦点的可见矩形，随镜头一起平移缩放。 */
export function CameraLayer({ view, animate, pulseKey }: { view: CameraView | null; animate: boolean; pulseKey: string }) {
  const mode = useStroke();
  if (!view || view.mode !== 'focus') return null;
  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: 25 }} data-jcamera-layer="focus">
      {view.rects.map(({ id, box }) => {
        const r = 8 / view.k;
        const style = { position: 'absolute' as const, left: box.x, top: box.y, width: box.w, height: box.h, borderRadius: r };
        return (
          <div key={`${pulseKey}:${id}`} data-jhighlight={id} data-box={`${round(box.x)},${round(box.y)},${round(box.w)},${round(box.h)}`}>
            <motion.div
              data-jhighlight-box=""
              style={{ ...style, ...(mode === 'clean' ? { boxShadow: `0 0 0 ${2.5 / view.k}px ${ACCENT}, 0 0 ${16 / view.k}px ${5 / view.k}px color-mix(in srgb, ${ACCENT} 32%, transparent)` } : {}) }}
              initial={animate ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={animate ? { duration: 0.35, delay: 0.3 } : { duration: 0 }}
            >
              {mode === 'rough' ? (
                // 手绘描边：宿主比目标大 3px，描边落在目标外沿 1–2px 处
                <div style={{ position: 'absolute', left: -3 / view.k, top: -3 / view.k, right: -3 / view.k, bottom: -3 / view.k }}>
                  <Rough seedKey={`hl:${id}`} shape="roundrect" radius={r + 3 / view.k} stroke={ACCENT} strokeWidth={2.4 / view.k} inset={1.5 / view.k} />
                </div>
              ) : null}
            </motion.div>
            {animate ? (
              // 脉冲一次：从目标外沿外扩并淡出的一圈
              <motion.div style={{ ...style, border: `${2 / view.k}px solid ${ACCENT}` }} initial={{ opacity: 0.8, scale: 1 }} animate={{ opacity: 0, scale: 1.25 }} transition={{ duration: 0.9, delay: 0.45 }} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
