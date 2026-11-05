/**
 * 舞台：在固定尺寸的画框里渲染当前画面。弹窗、Toast、演示覆盖层都在画框内部分层，
 * 不 portal 到 document.body，因此截图、元素索引与遮挡检查都只看舞台本身。
 */
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { PlayState, Project, Toast } from '@joplo/core';
import { RenderContext, RenderNode, type RenderMode } from './components';
import { Rough, ThemeContext, type RoughRegistry, type StageTheme } from './rough';

export const VIEWPORTS = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } } as const;
export type Viewport = keyof typeof VIEWPORTS;

export function viewportOf(project: Project, state: PlayState): Viewport {
  return project.scenes[state.sceneId]?.viewport === 'mobile' ? 'mobile' : 'desktop';
}

/**
 * 点击命中的元素：文本节点（#text）不单独响应；演示模式优先取最近的可操作祖先
 * （点到按钮里的文字或图标也算点按钮），审阅模式取最内层的元素，便于精确选中。
 */
export function pickTarget(el: HTMLElement, mode: RenderMode): HTMLElement | null {
  if (mode === 'demo') {
    const inter = el.closest<HTMLElement>('[data-jinteractive]');
    if (inter) return inter;
  }
  return el.closest<HTMLElement>('[data-jid]:not([data-jtype="#text"])');
}

export type StageProps = {
  project: Project;
  state: PlayState;
  theme: StageTheme;
  mode: RenderMode;
  selectedId?: string | null;
  preview?: { nodeId: string; text: string } | null;
  animate?: boolean;
  registry?: RoughRegistry | null;
  /** 下一步操作的目标：Toast 会避开它（PRD 8.8）。 */
  nextTargetId?: string | null;
  /** 跳转（重置、上一步、切换场景）时递增：旧 Toast 直接移除，不播放退出动画。 */
  epoch?: number;
  onNodeClick?: (nodeId: string, point: { x: number; y: number }) => void;
  stageRef?: (el: HTMLDivElement | null) => void;
  overlay?: ReactNode;
};

export function Stage({ project, state, theme, mode, selectedId = null, preview = null, animate = true, registry = null, nextTargetId = null, epoch = 0, onNodeClick, stageRef, overlay }: StageProps) {
  const scene = project.scenes[state.sceneId];
  const vp = VIEWPORTS[viewportOf(project, state)];
  const [dialogLayer, setDialogLayer] = useState<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const toFramePoint = (clientX: number, clientY: number) => {
    const el = rootRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const s = r.width / el.offsetWidth || 1;
    return { x: (clientX - r.left) / s, y: (clientY - r.top) / s };
  };

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!onNodeClick) return;
    const hit = pickTarget(e.target as HTMLElement, mode);
    if (!hit || !rootRef.current?.contains(hit)) return;
    e.preventDefault();
    onNodeClick(hit.dataset.jid!, toFramePoint(e.clientX, e.clientY));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!onNodeClick || (e.key !== 'Enter' && e.key !== ' ')) return;
    const t = e.target as HTMLElement;
    if (t.tagName === 'BUTTON') return; // 原生按钮会自己触发 click
    const hit = pickTarget(t, mode);
    if (!hit) return;
    e.preventDefault();
    const r = hit.getBoundingClientRect();
    onNodeClick(hit.dataset.jid!, toFramePoint(r.left + r.width / 2, r.top + r.height / 2));
  };

  return (
    <ThemeContext.Provider value={{ theme, registry }}>
      <div
        ref={(el) => {
          rootRef.current = el;
          stageRef?.(el);
        }}
        data-joplo-stage=""
        data-theme={theme}
        data-mode={mode}
        data-scene={state.sceneId}
        className="jstage relative overflow-hidden"
        style={{ width: vp.width, height: vp.height }}
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        {scene ? (
          <RenderContext.Provider value={{ scene, state, mode, selectedId, preview, dialogLayer, animate }}>
            <div className="absolute inset-0">
              <RenderNode node={scene.root} />
            </div>
          </RenderContext.Provider>
        ) : (
          <div className="flex h-full items-center justify-center text-[#c92a2a]">画面不存在：{state.sceneId}</div>
        )}
        <div ref={setDialogLayer} className="pointer-events-none absolute inset-0 z-20 [&>*]:pointer-events-auto" data-jlayer="dialog" />
        <ToastLayer key={epoch} toasts={state.toasts} nextTargetId={nextTargetId} animate={animate} rootRef={rootRef} />
        {overlay ? <div className="pointer-events-none absolute inset-0 z-40" data-jlayer="overlay">{overlay}</div> : null}
      </div>
    </ThemeContext.Provider>
  );
}

type Corner = 'br' | 'tr' | 'bl' | 'tl' | 'bc';
const CORNER_CLASS: Record<Corner, string> = {
  br: 'right-5 bottom-5 items-end',
  tr: 'right-5 top-14 items-end',
  bl: 'left-5 bottom-5 items-start',
  tl: 'left-5 top-14 items-start',
  bc: 'left-1/2 -translate-x-1/2 bottom-5 items-center',
};
const TOAST_STYLE: Record<Toast['tone'], { c: string; bg: string; icon: string }> = {
  success: { c: '#2b8a3e', bg: '#f3fbf4', icon: '✓' },
  error: { c: '#c92a2a', bg: '#fff3f3', icon: '!' },
  info: { c: '#1e1e1e', bg: '#ffffff', icon: 'i' },
};

/** Toast 放在舞台内；若与下一步操作目标重叠，换到其他角落。 */
function ToastLayer({ toasts, nextTargetId, animate, rootRef }: { toasts: Toast[]; nextTargetId: string | null; animate: boolean; rootRef: React.RefObject<HTMLDivElement | null> }) {
  const [corner, setCorner] = useState<Corner>('br');

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || toasts.length === 0) return;
    const target = nextTargetId ? root.querySelector<HTMLElement>(`[data-jid="${CSS.escape(nextTargetId)}"]`) : null;
    if (!target) {
      setCorner('br');
      return;
    }
    const s = root.getBoundingClientRect().width / root.offsetWidth || 1;
    const rr = root.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    const t = { x: (tr.left - rr.left) / s, y: (tr.top - rr.top) / s, w: tr.width / s, h: tr.height / s };
    const W = root.offsetWidth;
    const H = root.offsetHeight;
    const tw = Math.min(380, W - 40);
    const th = 64 * toasts.length + 10;
    const boxes: Record<Corner, { x: number; y: number }> = {
      br: { x: W - 20 - tw, y: H - 20 - th },
      tr: { x: W - 20 - tw, y: 56 },
      bl: { x: 20, y: H - 20 - th },
      tl: { x: 20, y: 56 },
      bc: { x: (W - tw) / 2, y: H - 20 - th },
    };
    const overlap = (b: { x: number; y: number }) => !(b.x + tw < t.x || t.x + t.w < b.x || b.y + th < t.y || t.y + t.h < b.y);
    const pick = (['br', 'tr', 'bc', 'bl', 'tl'] as Corner[]).find((c) => !overlap(boxes[c])) ?? 'br';
    setCorner(pick);
  }, [toasts, nextTargetId, rootRef]);

  return (
    <div className={`pointer-events-none absolute z-30 flex max-w-[calc(100%-40px)] flex-col gap-2 ${CORNER_CLASS[corner]}`} data-jlayer="toast">
      <AnimatePresence>
        {toasts.map((t) => {
          const st = TOAST_STYLE[t.tone];
          return (
            <motion.div
              key={t.id}
              data-jtoast={t.id}
              role="status"
              className="jbox flex w-[380px] max-w-full items-center gap-3 px-4 py-3 shadow-[4px_4px_0_rgba(30,30,30,0.15)] [.jstage[data-theme=clean]_&]:rounded-md"
              style={{ background: st.bg, color: st.c, borderColor: st.c }}
              initial={animate ? { opacity: 0, y: 16 } : false}
              animate={{ opacity: 1, y: 0 }}
              exit={animate ? { opacity: 0 } : undefined}
              transition={{ duration: 0.25 }}
            >
              <ToastRough id={t.id} stroke={st.c} />
              <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white" style={{ background: st.c }}>
                {st.icon}
              </span>
              <span className="text-[15px] leading-snug text-[#1e1e1e]">{t.text}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function ToastRough({ id, stroke }: { id: string; stroke: string }) {
  return <Rough seedKey={`toast:${id}`} stroke={stroke} strokeWidth={1.6} />;
}
