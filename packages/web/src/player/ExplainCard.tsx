/**
 * 解说卡（T-director2 / T-director3）：导演模式下在焦点旁边弹出，大字显示这一步的说明，下方小一号显示 explain() 的解说。
 * - 锚点：anchors 里第一个在画面上可见的元素（导演层本步镜头的主目标 → 被操作的元素 → 这一层镜头里的第一个目标）；
 *   没有可见的锚点时放在画面底部居中。
 * - 每帧测量，坐标在镜头变换（含用户缩放平移）之后：元素的屏幕矩形换算成画框坐标；架构图里正在移动的节点取最终位置。
 * - 位置由 placeCallout 计算：放在锚点旁边的空白处，不压住本步任何焦点元素（镜头高光框），箭头尖端落在锚点的边上。
 * - 宽度自适应文字，最大为舞台宽度的 60%（不小于 480）；字体跟随舞台主题（sketch 手写体、clean 系统字体），
 *   字号按舞台的外层缩放补偿。
 * 演示页、发布站、renderStep 截图（静态，没有动画）与视频共用。
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { finalRect } from '../renderer/camera';
import { CARD_CAPTION_PX, CARD_EXPLAIN_PX, cardMaxWidth, placeCallout, type Box, type Placement } from './callout';

const ACCENT = '#e8590c';

type Geo = { p: Placement; s: number; w: number; h: number; anchor: string | null };

export function ExplainCard({ stage, stepKey, caption, explain, anchors, animate }: { stage: HTMLElement | null; stepKey: string; caption: string; explain?: string | null; anchors: string[]; animate: boolean }) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const anchorKey = anchors.join('|');
  useLayoutEffect(() => {
    if (!stage) return;
    let raf = 0;
    let prev = '';
    const ids = anchorKey ? anchorKey.split('|') : [];
    const tick = () => {
      const rr = stage.getBoundingClientRect();
      const s = rr.width / (stage.offsetWidth || 1) || 1;
      const W = stage.offsetWidth;
      const H = stage.offsetHeight;
      const toFrame = (r: { left: number; top: number; width: number; height: number }): Box | null => {
        // 只保留画面内的部分（用户把目标拖出画面时，卡片贴着画面边缘）
        const x0 = Math.max(0, (r.left - rr.left) / s), y0 = Math.max(0, (r.top - rr.top) / s);
        const x1 = Math.min(W, (r.left - rr.left + r.width) / s), y1 = Math.min(H, (r.top - rr.top + r.height) / s);
        return x1 - x0 > 1 && y1 - y0 > 1 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
      };
      let anchor: Box | null = null;
      let anchorId: string | null = null;
      for (const id of ids) {
        const el = stage.querySelector(`[data-jcamera] [data-jid="${CSS.escape(id)}"]`) ?? stage.querySelector(`[data-jid="${CSS.escape(id)}"]`);
        const b = el ? toFrame(finalRect(el)) : null;
        if (b) {
          anchor = b;
          anchorId = id;
          break;
        }
      }
      // 本步所有焦点（镜头高光框）：卡片不能压住它们
      const obstacles: Box[] = [];
      stage.querySelectorAll('[data-jhighlight-box]').forEach((el) => {
        const b = toFrame(el.getBoundingClientRect());
        if (b) obstacles.push(b);
      });
      const card = cardRef.current;
      const w = card?.offsetWidth ?? 400;
      const h = card?.offsetHeight ?? 120;
      const p = placeCallout(anchor, { w, h }, { W, H }, obstacles);
      const sig = JSON.stringify([p, Math.round(s * 1000), w, h, anchorId]);
      if (sig !== prev) {
        prev = sig;
        setGeo({ p, s, w, h, anchor: anchorId });
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [stage, stepKey, anchorKey]);
  const W = stage?.offsetWidth ?? 1280;
  const s = geo?.s ?? 1;
  const capPx = Math.max(CARD_CAPTION_PX, 22 / s);
  const expPx = Math.max(CARD_EXPLAIN_PX, 17 / s);
  const p = geo?.p;
  return (
    <>
      {p?.arrow && p.tail ? (
        <svg className="pointer-events-none absolute inset-0 overflow-visible" width="100%" height="100%" aria-hidden data-joverlay="explain-arrow" data-tip={`${Math.round(p.arrow.x)},${Math.round(p.arrow.y)}`}>
          <defs>
            <marker id="jexplain-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth={6} markerHeight={6} orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={ACCENT} />
            </marker>
          </defs>
          <line x1={p.tail.x} y1={p.tail.y} x2={p.arrow.x} y2={p.arrow.y} stroke={ACCENT} strokeWidth={3 / Math.min(1, s)} strokeLinecap="round" markerEnd="url(#jexplain-head)" />
        </svg>
      ) : null}
      <motion.div
        key={stepKey}
        ref={cardRef}
        role="note"
        data-joverlay="explain"
        data-side={p?.side ?? 'none'}
        data-anchor={geo?.anchor ?? undefined}
        className="jexplain absolute rounded-[12px] border-2 bg-white text-left shadow-[0_8px_28px_rgba(0,0,0,0.16)]"
        style={{ left: p?.x ?? -9999, top: p?.y ?? -9999, width: 'max-content', maxWidth: cardMaxWidth(W), minWidth: Math.min(240, W - 24), padding: '16px 22px', borderColor: ACCENT, visibility: p ? 'visible' : 'hidden' }}
        initial={animate ? { opacity: 0, y: 6 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className="leading-[1.35] text-[#1e1e1e]" style={{ fontSize: capPx }} data-jexplain-caption="">
          {caption}
        </div>
        {explain ? (
          <div className="mt-2 whitespace-pre-line leading-[1.55] text-[#495057]" style={{ fontSize: expPx }} data-jexplain-text="">
            {explain}
          </div>
        ) : null}
      </motion.div>
    </>
  );
}
