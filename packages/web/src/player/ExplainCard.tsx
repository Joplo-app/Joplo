/**
 * 解说卡（T-director2）：导演模式下在焦点旁边弹出，大字显示这一步的说明，下方是 explain() 的较长解说。
 * - 锚点 = 镜头高光框（[data-jhighlight-box]）的并集，每帧测量，随镜头与用户缩放一起移动；没有焦点时放在画面底部居中。
 * - 位置由 placeCallout 计算：依次试右、左、下、上，自动避开画面边缘；带一支指向焦点的箭头。
 * - 字号按舞台的外层缩放补偿：屏幕上说明 ≥ 20px、解说 ≥ 16px。
 * 演示页、发布站、renderStep 截图（静态，没有动画）与视频共用。
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { placeCallout, type Box, type Placement } from './callout';

export const CARD_W = 400;
const ACCENT = '#e8590c';

export function cardWidth(W: number): number {
  return W >= 900 ? CARD_W : Math.max(220, W - 24);
}

export function ExplainCard({ stage, stepKey, caption, explain, animate }: { stage: HTMLElement | null; stepKey: string; caption: string; explain?: string | null; animate: boolean }) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [geo, setGeo] = useState<{ p: Placement; anchor: Box | null; s: number; h: number } | null>(null);
  useLayoutEffect(() => {
    if (!stage) return;
    let raf = 0;
    let prev = '';
    const tick = () => {
      const rr = stage.getBoundingClientRect();
      const s = rr.width / (stage.offsetWidth || 1) || 1;
      const W = stage.offsetWidth;
      const H = stage.offsetHeight;
      const boxes: Box[] = [];
      stage.querySelectorAll('[data-jhighlight-box]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) boxes.push({ x: (r.left - rr.left) / s, y: (r.top - rr.top) / s, w: r.width / s, h: r.height / s });
      });
      // 只保留画面内的部分（用户把焦点拖出画面时，卡片贴着画面边缘）
      const vis = boxes
        .map((b) => {
          const x0 = Math.max(0, b.x), y0 = Math.max(0, b.y), x1 = Math.min(W, b.x + b.w), y1 = Math.min(H, b.y + b.h);
          return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
        })
        .filter((b): b is Box => !!b);
      const anchor = vis.length ? { x: Math.min(...vis.map((b) => b.x)), y: Math.min(...vis.map((b) => b.y)), w: Math.max(...vis.map((b) => b.x + b.w)) - Math.min(...vis.map((b) => b.x)), h: Math.max(...vis.map((b) => b.y + b.h)) - Math.min(...vis.map((b) => b.y)) } : null;
      const card = cardRef.current;
      const w = cardWidth(W);
      const h = card?.offsetHeight ?? 120;
      const p = placeCallout(anchor, { w, h }, { W, H });
      const sig = JSON.stringify([p, Math.round(s * 1000), h]);
      if (sig !== prev) {
        prev = sig;
        setGeo({ p, anchor, s, h });
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [stage, stepKey]);
  const W = stage?.offsetWidth ?? 1280;
  const s = geo?.s ?? 1;
  const capPx = Math.max(22, 20 / s);
  const expPx = Math.max(17, 16 / s);
  const p = geo?.p;
  const w = cardWidth(W);
  // 箭头：从卡片朝向焦点的一边连到焦点边缘
  const tail = p?.arrow
    ? p.side === 'right' ? { x: p.x, y: p.arrow.y }
      : p.side === 'left' ? { x: p.x + w, y: p.arrow.y }
      : p.side === 'bottom' ? { x: p.arrow.x, y: p.y }
      : { x: p.arrow.x, y: p.y + (geo?.h ?? 0) }
    : null;
  return (
    <>
      {p?.arrow && tail ? (
        <svg className="pointer-events-none absolute inset-0 overflow-visible" width="100%" height="100%" aria-hidden data-joverlay="explain-arrow">
          <defs>
            <marker id="jexplain-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth={7} markerHeight={7} orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={ACCENT} />
            </marker>
          </defs>
          <line x1={tail.x} y1={tail.y} x2={p.arrow.x} y2={p.arrow.y} stroke={ACCENT} strokeWidth={3 / Math.min(1, s)} strokeLinecap="round" markerEnd="url(#jexplain-head)" />
        </svg>
      ) : null}
      <motion.div
        key={stepKey}
        ref={cardRef}
        role="note"
        data-joverlay="explain"
        data-side={p?.side ?? 'none'}
        className="absolute rounded-[10px] border-2 bg-white px-5 py-4 text-left shadow-[0_8px_28px_rgba(0,0,0,0.16)]"
        style={{ left: p?.x ?? -9999, top: p?.y ?? -9999, width: w, borderColor: ACCENT, fontFamily: 'system-ui, "PingFang SC", sans-serif', visibility: p ? 'visible' : 'hidden' }}
        initial={animate ? { opacity: 0, y: 6 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className="font-semibold leading-snug text-[#1e1e1e]" style={{ fontSize: capPx }} data-jexplain-caption="">
          {caption}
        </div>
        {explain ? (
          <div className="mt-2 whitespace-pre-line leading-relaxed text-[#3a3a3a]" style={{ fontSize: expPx }} data-jexplain-text="">
            {explain}
          </div>
        ) : null}
      </motion.div>
    </>
  );
}
