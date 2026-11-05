/**
 * 舞台覆盖层：鼠标指针、点击波纹、聚焦高亮、步骤字幕、就地提示。
 * 位于画框内部（坐标即画框坐标），pointer-events 默认关闭，不影响元素命中与遮挡检查。
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { MousePointer2 } from 'lucide-react';
import type { Snapshot } from '../runtime/demo';

type Box = { x: number; y: number; w: number; h: number };

/** 每帧测量若干元素在画框内的位置（弹窗进场动画期间也能跟上）。 */
function useBoxes(stage: HTMLElement | null, ids: (string | null | undefined)[]): Record<string, Box> {
  const [boxes, setBoxes] = useState<Record<string, Box>>({});
  const key = ids.filter(Boolean).join('|');
  useEffect(() => {
    if (!stage) return;
    let raf = 0;
    let prev = '';
    const list = key ? key.split('|') : [];
    const tick = () => {
      const rr = stage.getBoundingClientRect();
      const s = rr.width / stage.offsetWidth || 1;
      const out: Record<string, Box> = {};
      for (const id of list) {
        // 输入组件的根包含 label 等，光标与高亮对准真正的控件
        const el = stage.querySelector<HTMLElement>(`[data-jcontrol="${CSS.escape(id)}"]`) ?? stage.querySelector<HTMLElement>(`[data-jid="${CSS.escape(id)}"]`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        out[id] = { x: (r.left - rr.left) / s, y: (r.top - rr.top) / s, w: r.width / s, h: r.height / s };
      }
      const sig = JSON.stringify(out);
      if (sig !== prev) {
        prev = sig;
        setBoxes(out);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [stage, key]);
  return boxes;
}

export function Overlay({
  snap,
  stage,
  nextTargetId,
  caption,
  setCursorEl,
  onBackToDemo,
  onDismiss,
}: {
  snap: Snapshot;
  stage: HTMLElement | null;
  nextTargetId: string | null;
  caption: string | null;
  setCursorEl: (el: HTMLElement | null) => void;
  onBackToDemo: () => void;
  onDismiss: () => void;
}) {
  const n = snap.notice;
  const anchorId = n && 'nodeId' in n ? n.nodeId : null;
  const showFocus = !snap.busy && nextTargetId;
  const boxes = useBoxes(stage, [showFocus ? nextTargetId : null, anchorId, snap.preview?.nodeId]);
  const W = stage?.offsetWidth ?? 1280;
  const H = stage?.offsetHeight ?? 800;
  const focus = showFocus && nextTargetId ? boxes[nextTargetId] : undefined;
  const anchor = anchorId ? boxes[anchorId] : undefined;
  const prevBox = snap.preview ? boxes[snap.preview.nodeId] : undefined;
  // 字幕避开目标：目标在下方时放到顶部
  const target = focus ?? anchor;
  const captionTop = target ? target.y + target.h > H - 110 : false;

  return (
    <>
      {focus ? (
        <div
          className="jfocus-ring absolute rounded-md border-2 border-dashed border-[var(--focus)]"
          style={{ left: focus.x - 6, top: focus.y - 6, width: focus.w + 12, height: focus.h + 12 }}
          data-joverlay="focus"
          aria-hidden
        />
      ) : null}

      {snap.preview && prevBox ? (
        <div className="absolute rounded bg-[var(--focus)] px-2 py-0.5 text-[13px] font-medium text-white" style={{ left: prevBox.x + prevBox.w - 76, top: prevBox.y - 6 }} data-joverlay="sample">
          示例输入
        </div>
      ) : null}

      <AnimatePresence>
        {snap.ripple ? (
          <motion.div
            key={snap.ripple.key}
            className="absolute size-10 rounded-full border-2 border-[var(--focus)] bg-[var(--focus)]/20"
            style={{ left: snap.ripple.x - 20, top: snap.ripple.y - 20 }}
            initial={{ scale: 0.3, opacity: 0.9 }}
            animate={{ scale: 1.6, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            aria-hidden
          />
        ) : null}
      </AnimatePresence>

      <div ref={setCursorEl} className="absolute left-0 top-0 will-change-transform" style={{ opacity: snap.cursorVisible ? 1 : 0 }} aria-hidden data-joverlay="cursor">
        <MousePointer2 className="-ml-[3px] -mt-[2px] size-7 fill-white text-[#1e1e1e] drop-shadow" strokeWidth={1.6} />
      </div>

      {snap.systemEvent ? (
        <div className="absolute left-1/2 top-14 -translate-x-1/2 rounded-full border border-[#1c5fb8] bg-[#eef4ff] px-4 py-1.5 text-[17px] text-[#1c5fb8] shadow" data-joverlay="system">
          <span className="mr-2 rounded bg-[#1c5fb8] px-1.5 py-0.5 text-[11px] font-semibold text-white">系统事件</span>
          {snap.systemEvent}
        </div>
      ) : null}

      {n && anchor && (n.kind === 'disabled' || n.kind === 'uncovered' || n.kind === 'out_of_order') ? (
        <NoticeBubble anchor={anchor} W={W} H={H} kind={n.kind} text={n.text} onBack={onBackToDemo} onDismiss={onDismiss} />
      ) : null}

      {caption ? (
        <div className={`absolute left-1/2 max-w-[86%] -translate-x-1/2 rounded-md bg-[rgba(30,30,30,0.86)] px-5 py-2.5 text-center text-[18px] leading-snug text-white ${captionTop ? 'top-12' : 'bottom-4'}`} data-joverlay="caption">
          {caption}
        </div>
      ) : null}
    </>
  );
}

function NoticeBubble({ anchor, W, H, kind, text, onBack, onDismiss }: { anchor: Box; W: number; H: number; kind: 'disabled' | 'uncovered' | 'out_of_order'; text: string; onBack: () => void; onDismiss: () => void }) {
  const width = 360;
  const below = anchor.y + anchor.h + 140 < H;
  const left = Math.max(8, Math.min(W - width - 8, anchor.x + anchor.w / 2 - width / 2));
  const top = below ? anchor.y + anchor.h + 10 : Math.max(8, anchor.y - 10 - 120);
  const tone = kind === 'disabled' ? { border: '#6b6b6b', bg: '#ffffff', title: '不可用' } : kind === 'uncovered' ? { border: '#b35c00', bg: '#fff8ee', title: '演示范围外' } : { border: '#1c5fb8', bg: '#f2f6ff', title: '不是当前步骤' };
  return (
    <div
      role="alert"
      data-joverlay="notice"
      data-notice-kind={kind}
      className="pointer-events-auto absolute rounded-md border-2 px-4 py-3 text-[17px] shadow-lg"
      style={{ left, top, width, borderColor: tone.border, background: tone.bg, fontFamily: 'system-ui, "PingFang SC", sans-serif' }}
    >
      <div className="mb-1 text-[14px] font-semibold" style={{ color: tone.border }}>
        {tone.title}
      </div>
      <div className="leading-snug text-[#1e1e1e]">{text}</div>
      <div className="mt-2 flex justify-end gap-2">
        {kind === 'uncovered' ? (
          <button type="button" className="rounded border border-[#b35c00] bg-white px-2.5 py-1 text-[15px] text-[#b35c00] hover:bg-[#fff1dd]" onClick={onBack}>
            回到演示
          </button>
        ) : null}
        <button type="button" className="rounded px-2.5 py-1 text-[15px] text-[#6b6b6b] hover:bg-black/5" onClick={onDismiss}>
          知道了
        </button>
      </div>
    </div>
  );
}
