/**
 * 镜头（D43）：在舞台内部把画面平移、缩放到“这一层 / 这些元素”的包围盒，四周留出内边距；
 * 焦点外变暗（遮罩挖出焦点区域），焦点元素外圈高光，出现时脉冲一次。
 *
 * - 镜头包住画面内容和弹窗层；Toast、鼠标、聚焦框等演示覆盖层在镜头之外（它们按屏幕位置测量，变换后照样对准）。
 * - 测量用“内容坐标”：元素的屏幕矩形减去镜头容器左上角，再除以容器当前的总缩放；所以过渡中途测量也正确。
 * - 全景（没有对准任何元素）只缩小不放大：内容比画面高时整体缩进来，细节靠聚焦。
 * - 聚焦最多推近 2 倍（保留上下文）；对准架构图节点时，至少推近到节点主标签在屏幕上 ≥ 16px。
 * - animate=false（renderStep 静态截图、减少动态效果）时直接到位，没有过渡与脉冲。
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { animate as animateEl, motion } from 'motion/react';
import { roundRectPath } from './rough';
import { fitCamera, union, type Box } from './camera-math';
import { Rough, useStageTheme } from './rough';

export type CameraSpec = {
  /** 对准的元素 id；空 = 这一层整体（roots），全景时为整个画面。 */
  targets: string[];
  /** 这一层的根元素 id；全景为空。 */
  roots: string[];
  /** 镜头标识（层级 + 目标）：变化时高光脉冲一次。 */
  key: string;
};

export type CameraView = { k: number; tx: number; ty: number; mode: 'focus' | 'layer' | 'overview'; hole: Box | null; rects: { id: string; box: Box }[] };

const round = (n: number) => Math.round(n * 100) / 100;

/** 镜头的计算与应用。wrapRef 挂在镜头容器上，contentRef 挂在画面内容上。 */
export function useCamera(spec: CameraSpec | null, opts: { width: number; height: number; animate: boolean; deps: unknown[] }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<CameraView | null>(null);
  const current = useRef({ k: 1, tx: 0, ty: 0 });
  const specKey = spec ? `${spec.key}|${spec.roots.join(',')}|${spec.targets.join(',')}` : '';

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const apply = (k: number, tx: number, ty: number, smooth: boolean) => {
      current.current = { k, tx, ty };
      wrap.dataset.cameraView = JSON.stringify({ k: round(k), tx: round(tx), ty: round(ty) });
      if (smooth) void animateEl(wrap, { x: tx, y: ty, scale: k }, { duration: 0.6, ease: [0.4, 0, 0.2, 1] });
      else void animateEl(wrap, { x: tx, y: ty, scale: k }, { duration: 0 });
    };
    if (!spec) {
      apply(1, 0, 0, false);
      setView(null);
      return;
    }
    const W = opts.width;
    const H = opts.height;
    const measure = (): CameraView | null => {
      const wr = wrap.getBoundingClientRect();
      const S = wr.width / (wrap.offsetWidth || 1) || 1; // 屏幕像素 / 内容像素（含舞台外层缩放与当前镜头）
      const outer = S / (current.current.k || 1); // 舞台外层缩放（看板按可用区域缩放舞台）
      const boxOf = (el: Element): Box => {
        const r = el.getBoundingClientRect();
        return { x: (r.left - wr.left) / S, y: (r.top - wr.top) / S, w: r.width / S, h: r.height / S };
      };
      const find = (id: string) => wrap.querySelector(`[data-jid="${CSS.escape(id)}"]`);
      const rects = spec.targets.map((id) => ({ id, el: find(id) })).filter((x): x is { id: string; el: Element } => !!x.el).map((x) => ({ id: x.id, el: x.el, box: boxOf(x.el) }));
      const roots = spec.roots.map(find).filter((x): x is Element => !!x).map(boxOf);
      let mode: CameraView['mode'] = rects.length ? 'focus' : roots.length ? 'layer' : 'overview';
      let bbox = mode === 'focus' ? union(rects.map((r) => r.box)) : mode === 'layer' ? union(roots) : null;
      if (mode === 'overview') {
        const root = contentRef.current?.firstElementChild;
        const content = root ? boxOf(root) : null;
        bbox = union([{ x: 0, y: 0, w: W, h: H }, ...(content && content.h > 0 ? [content] : [])]);
      }
      if (!bbox || bbox.w <= 0 || bbox.h <= 0) {
        mode = 'overview';
        bbox = { x: 0, y: 0, w: W, h: H };
      }
      // 对准架构图节点：每个节点“内容像素 → 屏幕像素”的比例（架构图缩放 × 舞台外层缩放），保证主标签在屏幕上 ≥ 16px
      const nodeScales = rects
        .filter((r) => r.el.getAttribute('data-jtype') === 'Diagram.Node')
        .map((r) => (Number(r.el.closest('[data-jtype="Diagram"]')?.getAttribute('data-scale') ?? 1) || 1) * outer);
      const { k, tx, ty, hole } = fitCamera({ W, H, mode, bbox, nodeScales });
      return { k, tx, ty, mode, hole, rects: mode === 'focus' ? rects.map((r) => ({ id: r.id, box: r.box })) : [] };
    };
    // 首帧过渡；随后几帧继续测量（字体、架构图尺寸可能稍后才稳定），有变化时直接修正
    let raf = 0;
    let n = 0;
    let last = '';
    const tick = () => {
      const v = measure();
      if (v) {
        const sig = JSON.stringify([round(v.k), round(v.tx), round(v.ty), v.hole && [round(v.hole.x), round(v.hole.y), round(v.hole.w), round(v.hole.h)]]);
        if (sig !== last) {
          apply(v.k, v.tx, v.ty, opts.animate && n === 0);
          setView(v);
          last = sig;
        }
      }
      if (++n < 15) raf = requestAnimationFrame(tick);
      else wrap.dataset.cameraSettled = '1';
    };
    delete wrap.dataset.cameraSettled;
    tick();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey, opts.width, opts.height, opts.animate, ...opts.deps]);

  return { wrapRef, contentRef, view };
}

const BIG = 20000;
const ACCENT = '#e8590c';

/** 遮罩与高光：画在镜头容器里（内容坐标），随镜头一起平移缩放。 */
export function CameraLayer({ view, animate, pulseKey }: { view: CameraView | null; animate: boolean; pulseKey: string }) {
  const theme = useStageTheme();
  if (!view || view.mode === 'overview' || !view.hole) return null;
  const hb = view.hole;
  const r = 12 / view.k;
  const d = `M${-BIG},${-BIG} H${BIG} V${BIG} H${-BIG} Z ${roundRectPath(hb.x, hb.y, hb.w, hb.h, r)}`;
  const t = animate ? { duration: 0.6, ease: [0.4, 0, 0.2, 1] as const } : { duration: 0 };
  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: 25 }} data-jcamera-layer={view.mode}>
      <svg width="1" height="1" style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} aria-hidden>
        <motion.path fillRule="evenodd" initial={false} animate={{ d, fill: view.mode === 'focus' ? 'rgba(15,23,42,0.34)' : 'rgba(15,23,42,0.2)' }} transition={t} data-jcamera-mask="" />
      </svg>
      {view.rects.map(({ id, box }) => {
        const m = 6 / view.k;
        const style = { position: 'absolute' as const, left: box.x - m, top: box.y - m, width: box.w + 2 * m, height: box.h + 2 * m, borderRadius: 10 / view.k };
        return (
          <div key={`${pulseKey}:${id}`} data-jhighlight={id}>
            <motion.div
              style={{ ...style, ...(theme === 'clean' ? { boxShadow: `0 0 0 ${2.5 / view.k}px ${ACCENT}, 0 0 ${18 / view.k}px ${6 / view.k}px rgba(232,89,12,0.35)` } : {}) }}
              initial={animate ? { opacity: 0, scale: 1.12 } : false}
              animate={{ opacity: 1, scale: 1 }}
              transition={animate ? { duration: 0.45, delay: 0.35 } : { duration: 0 }}
            >
              {theme === 'sketch' ? <Rough seedKey={`hl:${id}`} shape="roundrect" radius={10 / view.k} stroke={ACCENT} strokeWidth={2.6 / view.k} inset={1 / view.k} /> : null}
            </motion.div>
            {animate ? (
              // 脉冲一次：外扩并淡出的一圈
              <motion.div style={{ ...style, border: `${2 / view.k}px solid ${ACCENT}` }} initial={{ opacity: 0.8, scale: 1 }} animate={{ opacity: 0, scale: 1.3 }} transition={{ duration: 0.9, delay: 0.5 }} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
