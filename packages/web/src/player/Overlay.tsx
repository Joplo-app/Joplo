/**
 * 舞台覆盖层：鼠标指针、点击波纹、聚焦高亮、就地提示。说明与 explain 在画面下方的字幕区（Subtitle），不叠在画面上。
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
  const n = snap.notice;
  const anchorId = n && 'nodeId' in n ? n.nodeId : null;
  const showFocus = !snap.busy && nextTargetId;
  const boxes = useBoxes(stage, [showFocus ? nextTargetId : null, anchorId, snap.preview?.nodeId]);
  const W = stage?.offsetWidth ?? 1280;
  const H = stage?.offsetHeight ?? 800;
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
        <MousePointer2 className="-ml-[3px] -mt-[2px] size-7 fill-[var(--jp-surface)] text-[var(--jp-ink)] drop-shadow" strokeWidth={1.6} />
      </div>


      {n && anchor && (n.kind === 'disabled' || n.kind === 'uncovered' || n.kind === 'out_of_order') ? (
        <NoticeBubble anchor={anchor} W={W} H={H} kind={n.kind} text={n.text} onBack={onBackToDemo} onDismiss={onDismiss} />
      ) : null}

    </>
  );
}

function NoticeBubble({ anchor, W, H, kind, text, onBack, onDismiss }: { anchor: Box; W: number; H: number; kind: 'disabled' | 'uncovered' | 'out_of_order'; text: string; onBack: () => void; onDismiss: () => void }) {
  const width = 360;
  const below = anchor.y + anchor.h + 140 < H;
  const left = Math.max(8, Math.min(W - width - 8, anchor.x + anchor.w / 2 - width / 2));
  const top = below ? anchor.y + anchor.h + 10 : Math.max(8, anchor.y - 10 - 120);
  const mix = (c: string) => `color-mix(in srgb, ${c} 8%, var(--jp-surface))`;
  const tone = kind === 'disabled' ? { border: 'var(--jp-muted)', bg: 'var(--jp-surface)', title: '不可用' } : kind === 'uncovered' ? { border: 'var(--jp-warn)', bg: mix('var(--jp-warn)'), title: '演示范围外' } : { border: 'var(--jp-info)', bg: mix('var(--jp-info)'), title: '不是当前步骤' };
  return (
    <div
      role="alert"
      data-joverlay="notice"
      data-notice-kind={kind}
      className="pointer-events-auto absolute rounded-md border-2 px-4 py-3 text-[17px] shadow-lg"
      style={{ left, top, width, borderColor: tone.border, background: tone.bg }}
    >
      <div className="mb-1 text-[14px] font-semibold" style={{ color: tone.border }}>
        {tone.title}
      </div>
      <div className="leading-snug text-[var(--jp-ink)]">{text}</div>
      <div className="mt-2 flex justify-end gap-2">
        {kind === 'uncovered' ? (
          <button type="button" className="whitespace-nowrap rounded border border-[var(--jp-warn)] bg-[var(--jp-surface)] px-2.5 py-1 text-[15px] text-[var(--jp-warn)] hover:opacity-80" onClick={onBack}>
            回到演示
          </button>
        ) : null}
        <button type="button" className="whitespace-nowrap rounded px-2.5 py-1 text-[15px] text-[var(--jp-muted)] hover:bg-black/5" onClick={onDismiss}>
          知道了
        </button>
      </div>
    </div>
  );
}
