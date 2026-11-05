/**
 * 舞台：在固定尺寸的画框里渲染当前画面。弹窗、Toast、演示覆盖层都在画框内部分层，
 * 不 portal 到 document.body，因此截图、元素索引与遮挡检查都只看舞台本身。
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { CameraLayer, contentBounds, useCamera, type CameraSpec } from './camera';
import { clampPan, wheelFactor, zoomAt, type View } from './camera-math';
import { AnimatePresence, motion } from 'motion/react';
import { VIEWPORT_SIZE, diagramStateAt, type PlayState, type Project, type Toast } from '@joplo-app/core';
import { RenderContext, RenderNode, type RenderMode } from './components';
import { Rough, ThemeContext, type RoughRegistry, type StageTheme } from './rough';
import { strokeOfTheme } from './themes';

export const VIEWPORTS = VIEWPORT_SIZE;
export type Viewport = keyof typeof VIEWPORTS;

export function viewportOf(project: Project, state: PlayState): Viewport {
  return project.scenes[state.sceneId]?.viewport === 'mobile' ? 'mobile' : 'desktop';
}

/**
 * 点击命中的元素：文本节点（#text）不单独响应；操作时优先取最近的可操作祖先
 * （点到按钮里的文字或图标也算点按钮），检查（⌥+单击）时取最内层的元素，便于精确选中。
 */
export function pickTarget(el: HTMLElement, mode: RenderMode, inspect = false): HTMLElement | null {
  // 架构图连线的标签画在单独一层：点标签等于点这条连线
  const edgeLabel = el.closest<HTMLElement>('[data-jedge-for]');
  if (edgeLabel) {
    const stage = el.closest('[data-joplo-stage]');
    const edge = stage?.querySelector<HTMLElement>(`[data-jid="${CSS.escape(edgeLabel.dataset.jedgeFor ?? '')}"]`);
    if (edge) return edge;
  }
  if (mode === 'demo' && !inspect) {
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
  /** inspect = 按住 ⌥（Alt）单击：检查元素，不操作原型。 */
  onNodeClick?: (nodeId: string, point: { x: number; y: number }, opts: { inspect: boolean }) => void;
  stageRef?: (el: HTMLDivElement | null) => void;
  overlay?: ReactNode;
  /** 预览宽度：覆盖页面自身的 viewport（目录画廊等测试用；D44 起看板不再切换设备）。 */
  viewportOverride?: Viewport | { width: number; height: number } | null;
  /** 镜头（D43）：对准这个画面里的某些元素；null = 不用镜头（整页按舞台显示）。 */
  camera?: CameraSpec | null;
  /** 要显示的画面（有层级的方案是某一层自己的画面）；缺省为状态里的路径画面。各层共享同一份状态。 */
  sceneId?: string | null;
  /** 自由缩放与平移（T-director2）：滚轮 / 触控板捏合缩放、拖动平移；null = 不允许（静态截图、视频）。 */
  zoom?: ZoomProps | null;
};

export type ZoomApi = { zoomBy: (factor: number) => void; fit: () => void };
export type ZoomProps = {
  /** 变化时丢弃用户的缩放，镜头重新接管（导演跟随：每一步；手动：换层）。 */
  resetKey: string;
  onApi?: (api: ZoomApi | null) => void;
  /** 用户视图变化：null = 跟随镜头。 */
  onChange?: (user: View | null) => void;
};

/** 滚轮落在还能继续滚动的区域（聊天记录、滚动区）里时，让它自己滚动，不缩放。 */
function scrollsItself(target: EventTarget | null, root: HTMLElement, dy: number): boolean {
  for (let el = target instanceof HTMLElement ? target : null; el && el !== root; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
      if (dy < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
    }
  }
  return false;
}

export function Stage({ project, state, theme, mode, selectedId = null, preview = null, animate = true, registry = null, nextTargetId = null, epoch = 0, onNodeClick, stageRef, overlay, viewportOverride = null, camera = null, sceneId = null, zoom = null }: StageProps) {
  const shownId = sceneId ?? state.sceneId;
  const scene = project.scenes[shownId];
  const vp = viewportOverride ? (typeof viewportOverride === 'string' ? VIEWPORTS[viewportOverride] : viewportOverride) : VIEWPORTS[scene?.viewport === 'mobile' ? 'mobile' : 'desktop'];
  const [dialogLayer, setDialogLayer] = useState<HTMLDivElement | null>(null);
  // 主题（D51）：描边方式由主题的 --jp-stroke 决定（内置主题或项目 themes/<name>.css）
  const stroke = useMemo(() => strokeOfTheme(theme, project.themes ?? {}), [theme, project.themes]);
  // 调用链（D48）：Diagram 节点与连线的 state 由每一步的 trace 推算（没写 state 时使用）
  const traced = useMemo(() => diagramStateAt(project, state.scenarioId, state.position), [project, state.scenarioId, state.position]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  // 用户的缩放平移（T-director2）：resetKey 变化时丢弃，镜头重新接管
  const [user, setUserState] = useState<View | null>(null);
  const userRef = useRef<View | null>(null);
  const onChangeRef = useRef(zoom?.onChange);
  onChangeRef.current = zoom?.onChange;
  const setUser = (v: View | null) => {
    userRef.current = v;
    setUserState(v);
    onChangeRef.current?.(v);
  };
  const resetKey = zoom?.resetKey ?? '';
  useEffect(() => {
    if (userRef.current) setUser(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);
  const cam = useCamera(camera, { width: vp.width, height: vp.height, animate, deps: [state, scene], user });
  const zoomOn = !!zoom;
  /** 当前视图（用户的，或镜头此刻的目标视图），在它上面继续缩放平移，并把内容夹在画面里。 */
  const setClamped = (v: View) => {
    const wrap = cam.wrapRef.current;
    const b = wrap ? contentBounds(wrap, cam.contentRef.current, vp.width, vp.height) : { x: 0, y: 0, w: vp.width, h: vp.height };
    setUser(clampPan(v, vp.width, vp.height, b));
  };
  const nowView = () => userRef.current ?? cam.current.current;
  const zoomAround = (factor: number, pt: { x: number; y: number }) => setClamped(zoomAt(nowView(), factor, pt));
  const apiRef = useRef<ZoomApi>({ zoomBy: () => undefined, fit: () => undefined });
  apiRef.current.zoomBy = (f) => zoomAround(f, { x: vp.width / 2, y: vp.height / 2 });
  apiRef.current.fit = () => setUser(null);
  const onApi = zoom?.onApi;
  useEffect(() => {
    if (!onApi) return;
    onApi(apiRef.current);
    return () => onApi(null);
  }, [onApi]);
  // 滚轮 / 触控板捏合（Chrome、Firefox 以 ctrl+wheel 表示捏合；Safari 用 gesture 事件），以鼠标位置为中心
  const zoomFns = useRef({ zoomAround, setClamped, nowView });
  zoomFns.current = { zoomAround, setClamped, nowView };
  useEffect(() => {
    const el = rootRef.current;
    if (!el || !zoomOn) return;
    const pt = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect();
      const s = r.width / el.offsetWidth || 1;
      return { x: (cx - r.left) / s, y: (cy - r.top) / s };
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && scrollsItself(e.target, el, e.deltaY)) return;
      e.preventDefault();
      zoomFns.current.zoomAround(wheelFactor(e.deltaY, { ctrlKey: e.ctrlKey, deltaMode: e.deltaMode }), pt(e.clientX, e.clientY));
    };
    let g: { v: View; p: { x: number; y: number } } | null = null;
    type GE = Event & { scale: number; clientX: number; clientY: number };
    const gStart = (e: Event) => {
      e.preventDefault();
      const ge = e as GE;
      g = { v: zoomFns.current.nowView(), p: pt(ge.clientX, ge.clientY) };
    };
    const gChange = (e: Event) => {
      e.preventDefault();
      if (g) zoomFns.current.setClamped(zoomAt(g.v, (e as GE).scale, g.p));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', gStart);
    el.addEventListener('gesturechange', gChange);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', gStart);
      el.removeEventListener('gesturechange', gChange);
    };
  }, [zoomOn]);
  // 拖动平移：移动超过 4px 才算拖动，之后的 click 不当作点击元素
  const drag = useRef<{ x: number; y: number; v: View; moved: boolean; id: number } | null>(null);
  const suppressClick = useRef(false);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!zoomOn || e.button !== 0 || e.altKey) return;
    drag.current = { x: e.clientX, y: e.clientY, v: nowView(), moved: false, id: e.pointerId };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !(e.buttons & 1)) return;
    const el = rootRef.current!;
    const s = el.getBoundingClientRect().width / el.offsetWidth || 1;
    const dx = (e.clientX - d.x) / s;
    const dy = (e.clientY - d.y) / s;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) {
      d.moved = true;
      el.setPointerCapture?.(d.id);
    }
    setClamped({ k: d.v.k, tx: d.v.tx + dx, ty: d.v.ty + dy });
  };
  const onPointerUp = () => {
    if (drag.current?.moved) suppressClick.current = true;
    drag.current = null;
  };

  const toFramePoint = (clientX: number, clientY: number) => {
    const el = rootRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const s = r.width / el.offsetWidth || 1;
    return { x: (clientX - r.left) / s, y: (clientY - r.top) / s };
  };

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!onNodeClick) return;
    const inspect = e.altKey;
    const hit = pickTarget(e.target as HTMLElement, mode, inspect);
    if (!hit || !rootRef.current?.contains(hit)) return;
    e.preventDefault();
    onNodeClick(hit.dataset.jid!, toFramePoint(e.clientX, e.clientY), { inspect });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!onNodeClick || (e.key !== 'Enter' && e.key !== ' ')) return;
    const t = e.target as HTMLElement;
    if (t.tagName === 'BUTTON') return; // 原生按钮会自己触发 click
    const hit = pickTarget(t, mode, e.altKey);
    if (!hit) return;
    e.preventDefault();
    const r = hit.getBoundingClientRect();
    onNodeClick(hit.dataset.jid!, toFramePoint(r.left + r.width / 2, r.top + r.height / 2), { inspect: e.altKey });
  };

  return (
    <ThemeContext.Provider value={{ theme, stroke, registry }}>
      <div
        ref={(el) => {
          rootRef.current = el;
          stageRef?.(el);
        }}
        data-joplo-stage=""
        data-theme={theme}
        data-stroke={stroke}
        data-mode={mode}
        data-scene={shownId}
        data-width={vp.width}
        className="jstage relative overflow-hidden"
        onClick={onClick}
        onKeyDown={onKeyDown}
        onPointerDown={zoomOn ? onPointerDown : undefined}
        onPointerMove={zoomOn ? onPointerMove : undefined}
        onPointerUp={zoomOn ? onPointerUp : undefined}
        onPointerCancel={zoomOn ? onPointerUp : undefined}
        onClickCapture={(e) => {
          if (!suppressClick.current) return;
          suppressClick.current = false;
          e.stopPropagation();
          e.preventDefault();
        }}
        data-zoomable={zoomOn ? '' : undefined}
        data-user-zoom={user ? String(Math.round(user.k * 100) / 100) : undefined}
        style={{ width: vp.width, height: vp.height, touchAction: zoomOn ? 'none' : undefined, cursor: drag.current?.moved ? 'grabbing' : undefined }}
      >
        {/* 镜头包住画面内容与弹窗层（它们一起平移缩放）；Toast 与演示覆盖层在镜头之外 */}
        <div ref={cam.wrapRef} className="absolute inset-0" style={{ transformOrigin: '0 0' }} data-jcamera={camera ? '' : undefined}>
          {scene ? (
            <RenderContext.Provider value={{ scene, state, mode, selectedId, preview, dialogLayer, animate, width: vp.width, focus: camera?.targets.length ? camera.targets : null, traced }}>
              {/* 换层（换画面）时淡入 */}
              <motion.div key={shownId} className="absolute inset-0" ref={cam.contentRef} initial={animate ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}>
                <RenderNode node={scene.root} />
              </motion.div>
            </RenderContext.Provider>
          ) : (
            <div className="flex h-full items-center justify-center text-[var(--jp-danger)]">画面不存在：{shownId}</div>
          )}
          <div ref={setDialogLayer} className="pointer-events-none absolute inset-0 z-20 [&>*]:pointer-events-auto" data-jlayer="dialog" />
          {camera ? <CameraLayer view={cam.view} animate={animate} pulseKey={camera.key} /> : null}
        </div>
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
  success: { c: 'var(--jp-ok)', bg: 'color-mix(in srgb, var(--jp-ok) 8%, var(--jp-surface))', icon: '✓' },
  error: { c: 'var(--jp-danger)', bg: 'color-mix(in srgb, var(--jp-danger) 8%, var(--jp-surface))', icon: '!' },
  info: { c: 'var(--jp-ink)', bg: 'var(--jp-surface)', icon: 'i' },
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
              <span className="text-[15px] leading-snug text-[var(--jp-ink)]">{t.text}</span>
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
