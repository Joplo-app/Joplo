import { useI18n } from '../i18n/context';
/**
 * 舞台覆盖层：鼠标指针、点击波纹、聚焦高亮、点错位置时目标闪两下（提示文字在 StageViewport 顶部居中）。说明与 explain 在画面下方的字幕区（Subtitle），不叠在画面上。
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
  setCursorEl,
  onBackToDemo,
  onDismiss,
}: {
  snap: Snapshot;
  stage: HTMLElement | null;
  nextTargetId: string | null;
  setCursorEl: (el: HTMLElement | null) => void;
  onBackToDemo: () => void;
  onDismiss: () => void;
}) {
  const { t: i18n } = useI18n();

  const n = snap.notice;
  const anchorId = n && 'nodeId' in n ? n.nodeId : null;
  const showFocus = !snap.busy && nextTargetId;
  const boxes = useBoxes(stage, [showFocus ? nextTargetId : null, anchorId, snap.preview?.nodeId]);
  const focus = showFocus && nextTargetId ? boxes[nextTargetId] : undefined;
  const anchor = anchorId ? boxes[anchorId] : undefined;
  const prevBox = snap.preview ? boxes[snap.preview.nodeId] : undefined;

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
        <div className="absolute whitespace-nowrap rounded bg-[var(--focus)] px-2 py-0.5 text-[13px] font-medium text-white" style={{ left: prevBox.x + prevBox.w - 76, top: prevBox.y - 6 }} data-joverlay="sample">
          {i18n.player.sampleInput}</div>
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
        <MousePointer2 className="-ml-[3px] -mt-[2px] size-7 fill-[var(--jp-surface)] text-[var(--jp-ink)] drop-shadow" strokeWidth={1.6} />
      </div>


      {/* 点错位置（D55）：目标闪两下；说明在画面顶部居中的轻提示（StageViewport） */}
      {n && anchor && (n.kind === 'disabled' || n.kind === 'uncovered' || n.kind === 'out_of_order') ? (
        <div key={`${anchorId}|${n.text}`} className="jflash absolute rounded-md border-2 border-[var(--focus)]" style={{ left: anchor.x - 5, top: anchor.y - 5, width: anchor.w + 10, height: anchor.h + 10 }} data-joverlay="notice-target" aria-hidden />
      ) : null}
    </>
  );
}
