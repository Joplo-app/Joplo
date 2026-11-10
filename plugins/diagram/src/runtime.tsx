import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { defineRuntime } from '@joplo-app/kit/plugin';
import type { PluginIRNode as SceneNode } from '@joplo-app/kit/plugin';
import { resolveProps, isSelfVisible, useEngineFrame, walkNodes } from '@joplo-app/kit/renderer';
import { AnimatePresence } from 'motion/react';
import { motion } from '@joplo-app/kit/renderer';
import { useI18n, useCtx as useHostCtx, useRoot, useRootAttrs, RenderNode, type NodeProps } from '@joplo-app/kit/renderer';
import { useR, Rough, RoughPath, roundRectPath, useStroke } from '@joplo-app/kit/renderer-internal';
import { DANGER, DIMMED, INFO, INK, INK2, LINE_STRONG, MONO, OK, SURFACE, WARN, color, dim, fontSize, radius, tint } from '@joplo-app/kit/renderer-style';
import { rectOf } from '@joplo-app/kit/renderer';
import { DESC_FONT, EDGE_FONT, GROUP_FONT, NODE_FONT, arrowHead, diagramFit, diagramFocus, edgeEmphasized, effectiveState, edgePath, graphView, sequenceView, startEdgeId, type GraphLayout, type SequenceLayout } from './render-layout.ts';
import type { GraphStructure, SequenceStructure } from './model.ts';
import type { DiagramStates } from './state.ts';
import type { FrameData } from './schema.ts';
import type { z } from 'zod';
type Frame = z.infer<typeof FrameData>;
const str = (v: unknown, fallback = ''): string => (v === undefined || v === null ? fallback : typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(v));
function useCtx() {
  const ctx = useHostCtx();
  const data = (ctx.ext?.diagram as Frame | undefined)?.scenes[ctx.scene.id];
  return { ...ctx, traced: data?.states ?? {}, traceNow: data?.now.length ? new Set(data.now) : null };
}
// ============ 关系类图表（D41 / D69）：架构图、状态机、时序图 ============
// 坐标全部来自 IR（编译期布局）；渲染器只画图与做动画。镜头只平移缩放，图里的节点永远不移动（D69 取代 D47 的聚焦布局）。

type DiagramCtxValue = {
  root: 'diagram:Diagram' | 'diagram:StateMachine';
  layout: GraphLayout;
  structure: GraphStructure;
  origin: { x: number; y: number };
  width: number;
  height: number;
  mountedAt: number;
  key: string;
  focus: { nodes: Set<string>; edges: Set<string> } | null;
  /** 推算的状态：trace（diagramStateAt）优先，其次状态机 value 的当前状态与本步走过的转换。 */
  states: DiagramStates;
  /** 状态机的当前状态（value 绑定）。 */
  current: string | null;
  /** 图表根节点（起点圆点按 id 找初始状态，跟随它的可见性）。 */
  rootNode: SceneNode;
  /** 本步的调用线（trace 到的连线 + 状态机这一步走过的转换）。非空时只有它们突出。 */
  now: ReadonlySet<string>;
};

/**
 * 逐段出现：图挂载之后才出现的元素（when 由假变真）播放出现动画；首次显示、回放、renderStep 静态截图都直接是最终状态。
 * 布局始终按全部元素计算（when 不参与），所以出现时已有元素不移动。
 */
function useAppear(mountedAt: number | undefined): boolean {
  const { animate, clock } = useCtx();
  const [appear] = useState(() => mountedAt !== undefined && animate && !!clock && clock.timeMs - mountedAt > 300);
  return appear;
}
const DiagramContext = createContext<DiagramCtxValue | null>(null);

const D_TONE: Record<string, { stroke: string; fill: string; text: string }> = {
  idle: { stroke: INK, fill: SURFACE, text: INK },
  active: { stroke: INFO, fill: tint(INFO), text: INFO },
  ok: { stroke: OK, fill: tint(OK), text: OK },
  error: { stroke: DANGER, fill: tint(DANGER), text: DANGER },
  dim: { stroke: LINE_STRONG, fill: SURFACE, text: DIMMED },
};
const EDGE_TONE: Record<string, string> = { idle: INK2, active: INFO, ok: OK, error: DANGER, dim: LINE_STRONG };
/** 分组色调（D69）：跟随主题的语义色；purple / teal 是固定的低饱和色，主题可以用 --jp-tone-purple / --jp-tone-teal 覆盖。 */
const GROUP_TONE: Record<string, string> = {
  gray: 'var(--jp-muted)',
  blue: INFO,
  green: OK,
  orange: WARN,
  red: DANGER,
  purple: 'var(--jp-tone-purple, #7950f2)',
  teal: 'var(--jp-tone-teal, #0c8599)',
};

/** 节点外形（坐标系：盒子左上角 x,y，宽 w 高 h）。模块级常量，Rough 据此缓存。 */
const SHAPE: Record<string, (x: number, y: number, w: number, h: number) => string> = {
  rect: (x, y, w, h) => roundRectPath(x, y, w, h, 10),
  pill: (x, y, w, h) => roundRectPath(x, y, w, h, h / 2),
  state: (x, y, w, h) => roundRectPath(x, y, w, h, Math.min(16, h / 2)),
  database: (x, y, w, h) => {
    const rx = w / 2;
    const ry = 7;
    return `M${x},${y + ry} A${rx},${ry} 0 0 1 ${x + w},${y + ry} V${y + h - ry} A${rx},${ry} 0 0 1 ${x},${y + h - ry} Z M${x},${y + ry} A${rx},${ry} 0 0 0 ${x + w},${y + ry}`;
  },
  queue: (x, y, w, h) => {
    const rx = 10;
    const ry = h / 2;
    return `M${x + rx},${y} H${x + w - rx} A${rx},${ry} 0 0 1 ${x + w - rx},${y + h} H${x + rx} A${rx},${ry} 0 0 1 ${x + rx},${y} Z M${x + w - rx},${y} A${rx},${ry} 0 0 0 ${x + w - rx},${y + h}`;
  },
};
const shapeOf = (kind: string) => (kind === 'database' ? 'database' : kind === 'queue' ? 'queue' : kind === 'user' ? 'pill' : kind === 'state' ? 'state' : 'rect');

/** 每种 kind / 分组图标一个低保真小图标（16×16，描边用 currentColor）。数据库与队列节点由外形表达，不画图标（分组标题仍画）。 */
function KindIcon({ kind, size = 18, always = false }: { kind: string; size?: number; always?: boolean }) {
  const common = { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, style: { flexShrink: 0 } };
  switch (kind) {
    case 'client':
      return <svg {...common}><rect x="2" y="3" width="12" height="8" rx="1" /><path d="M6 14h4M8 11v3" /></svg>;
    case 'model':
      return <svg {...common}><path d="M8 1.5l1.6 4.2 4.4.8-3.3 3 .9 4.5L8 11.8 4.4 14l.9-4.5-3.3-3 4.4-.8z" /></svg>;
    case 'storage':
      return <svg {...common}><path d="M2 5l1 9h10l1-9zM2 5h12M5 5V3h6v2" /></svg>;
    case 'external':
      return <svg {...common}><path d="M4.5 12.5h7a3 3 0 0 0 .3-6A4 4 0 0 0 4 6.3a3.1 3.1 0 0 0 .5 6.2z" /></svg>;
    case 'cloud':
      return <svg {...common}><path d="M4.5 13h7.2a3.2 3.2 0 0 0 .3-6.4A4.2 4.2 0 0 0 4 6.2 3.4 3.4 0 0 0 4.5 13z" /><path d="M6 10h4" /></svg>;
    case 'tool':
      return <svg {...common}><path d="M10.5 2.5a3 3 0 0 0-3.4 4L2.5 11.1l2.4 2.4 4.6-4.6a3 3 0 0 0 4-3.4l-1.9 1.9-1.6-.4-.4-1.6z" /></svg>;
    case 'user':
      return <svg {...common}><circle cx="8" cy="5" r="2.6" /><path d="M3 14a5 5 0 0 1 10 0" /></svg>;
    case 'gateway':
      return <svg {...common}><path d="M2 8h12M10 4l4 4-4 4M6 4 2 8l4 4" /></svg>;
    case 'lock':
      return <svg {...common}><rect x="3" y="7" width="10" height="7" rx="1.2" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></svg>;
    case 'network':
      return <svg {...common}><circle cx="8" cy="3.5" r="1.8" /><circle cx="3.5" cy="12.5" r="1.8" /><circle cx="12.5" cy="12.5" r="1.8" /><path d="M7 5 4.5 11M9 5l2.5 6M5.3 12.5h5.4" /></svg>;
    case 'device':
      return <svg {...common}><rect x="4.5" y="1.5" width="7" height="13" rx="1.4" /><path d="M7 12.5h2" /></svg>;
    case 'box':
      return <svg {...common}><path d="M2.5 5 8 2l5.5 3v6L8 14l-5.5-3zM2.5 5 8 8l5.5-3M8 8v6" /></svg>;
    case 'brain':
      return <svg {...common}><path d="M6 2.5a2.2 2.2 0 0 0-2.2 2.2A2.3 2.3 0 0 0 2.5 9a2.4 2.4 0 0 0 2.2 3.3A2 2 0 0 0 8 13.5V3.2A1.8 1.8 0 0 0 6 2.5zM10 2.5a2.2 2.2 0 0 1 2.2 2.2A2.3 2.3 0 0 1 13.5 9a2.4 2.4 0 0 1-2.2 3.3A2 2 0 0 1 8 13.5" /></svg>;
    case 'database':
      return always ? <svg {...common}><ellipse cx="8" cy="3.8" rx="5" ry="1.8" /><path d="M3 3.8v8.4c0 1 2.2 1.8 5 1.8s5-.8 5-1.8V3.8M3 8c0 1 2.2 1.8 5 1.8S13 9 13 8" /></svg> : null;
    case 'queue':
      return always ? <svg {...common}><rect x="1.5" y="5" width="13" height="6" rx="3" /><path d="M5 5v6M8 5v6M11 5v6" /></svg> : null;
    case 'state':
      return null;
    default: // service
      return <svg {...common}><rect x="2" y="2.5" width="12" height="4.5" rx="1" /><rect x="2" y="9" width="12" height="4.5" rx="1" /><path d="M4.5 4.75h.01M4.5 11.25h.01" /></svg>;
  }
}

/** 图表元素的“家族”：逐段出现 / 消失的动画只作用在它们身上。 */
const DIAGRAM_PART = /^diagram:(Diagram|StateMachine|Sequence)\./;

/** 渲染一个图表元素：可见性已由父级判断（消失时 AnimatePresence 还要把它渲染到淡出结束）。 */
function DiagramPart({ node }: { node: SceneNode }) {
  const { state } = useCtx();
  const Impl = IMPL[node.type];
  if (!Impl) return null;
  return <Impl node={node} p={resolveProps(node, state)} disabled={false}>{null}</Impl>;
}

/** 图表的子元素：家族元素进 AnimatePresence（出现 / 消失都有动画，已有元素不动）；其余照常渲染。 */
function DiagramChildren({ nodes }: { nodes: SceneNode[] | undefined }) {
  const { state, width } = useCtx();
  const parts = (nodes ?? []).filter((c) => DIAGRAM_PART.test(c.type) && isSelfVisible(c, state, width));
  const others = (nodes ?? []).filter((c) => !DIAGRAM_PART.test(c.type));
  return (
    <>
      <AnimatePresence initial={false}>
        {parts.map((c) => (
          <DiagramPart key={c.id} node={c} />
        ))}
      </AnimatePresence>
      {others.map((c) => (
        <RenderNode key={c.id} node={c} />
      ))}
    </>
  );
}

/** 消失动画（D69）：淡出；静态截图与“减少动态效果”时直接移除。 */
const useExit = () => {
  const { animate } = useCtx();
  return animate ? { opacity: 0, transition: { duration: 0.3 } } : { opacity: 0, transition: { duration: 0 } };
};

/** 状态机 value 绑定的状态路径（'$data.order.status' → 'data.order.status'）。 */

/**
 * Diagram / StateMachine：坐标来自 IR 的编译期布局（ELK），整体缩放到放得下容器宽度与 h。
 * 子元素照常经 DiagramChildren 渲染（可见性、绑定由 core 计算），位置从 DiagramContext 取。
 */
function Diagram({ node, p }: NodeProps) {
  const { t: i18n } = useI18n<{ thisDiagramHasNoNodesYet: string }>();
  const r = useR(p);
  const { structure, layout } = useMemo(() => graphView(node), [node]);
  const ref = useRef<HTMLDivElement | null>(null);
  const { clock } = useCtx();
  const [mountedAt] = useState(() => clock?.timeMs ?? 0);
  const [avail, setAvail] = useState(0);
  const [availH, setAvailH] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      setAvail(el.clientWidth);
      setAvailH(el.clientHeight);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // h：数字是固定高度；"100%" 等百分比铺满父容器（层级里整张图占满舞台）
  const hRaw = r('h');
  const fill = typeof hRaw === 'string' && /%$/.test(hRaw.trim());
  const hv = Number(hRaw);
  const H = fill ? availH || 420 : Number.isFinite(hv) && hv > 0 ? hv : 420;
  const { h: _h, value: _v, ...rest } = p;
  const { focus, traced, traceNow } = useCtx();
  const focusKey = focus?.join(',') ?? '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dfocus = useMemo(() => diagramFocus(structure, focus, node.id), [structure, focusKey, node.id]);
  // 状态机：value 绑定的当前状态，这一步 value 变化时对应的转换点亮（trace 写了的以 trace 为准）
  const root = node.type === 'diagram:StateMachine' ? 'diagram:StateMachine' : 'diagram:Diagram';
  const machine = (useCtx().ext?.diagram as Frame | undefined)?.scenes[useCtx().scene.id]?.machines[node.id] ?? { current: null, states: {} };
  const states = useMemo(() => ({ ...machine.states, ...(traced ?? {}) }), [traced, JSON.stringify(machine.states)]);
  // 本步的调用线：这张图里本步 trace 到的连线，加上状态机这一步自动走过的转换
  const nowKey = traceNow ? [...traceNow].join(',') : '';
  const now = useMemo(
    () => new Set(structure.edges.filter((e) => traceNow?.has(e.id) || machine.states[e.id]?.state === 'active').map((e) => e.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [structure, nowKey, JSON.stringify(machine.states)],
  );
  const { scale } = diagramFit(layout, avail, H);
  const rootProps = useRoot(node, rest, { style: { position: 'relative', width: '100%', height: fill ? String(hRaw) : H, minHeight: fill ? 240 : undefined, overflow: 'hidden' } });
  const W = layout.width * scale;
  const HH = layout.height * scale;
  return (
    <div
      {...rootProps}
      ref={(el) => {
        ref.current = el;
      }}
      data-direction={structure.direction}
      data-scale={String(scale)}
      data-layout={layout.engine}
    >
      {layout.width === 0 ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: DIMMED, fontSize: 13 }}>{i18n.stage.thisDiagramHasNoNodesYet}</div>
      ) : (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <div
            data-jframe-canvas=""
            style={{ position: 'absolute', left: Math.max(0, (avail - W) / 2), top: Math.max(0, (H - HH) / 2), width: layout.width, height: layout.height, transform: `scale(${scale})`, transformOrigin: '0 0' }}
          >
            <DiagramContext.Provider value={{ root, layout, structure, origin: { x: 0, y: 0 }, width: layout.width, height: layout.height, mountedAt, key: node.id, focus: dfocus, states, current: machine.current, rootNode: node, now }}>
              {root === 'diagram:StateMachine' ? <StartDots /> : null}
              <DiagramChildren nodes={node.children} />
            </DiagramContext.Provider>
          </div>
        </div>
      )}
    </div>
  );
}

/** 状态机的起点：实心圆点 + 指向初始状态的箭头（不是作者元素，跟随初始状态的可见性）。 */
function StartDots() {
  const d = useContext(DiagramContext)!;
  const { state, width } = useCtx();
  const starts = Object.entries(d.layout.starts ?? {});
  if (!starts.length) return null;
  return (
    <svg aria-hidden width={d.width} height={d.height} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 1 }} data-jstart="">
      {starts.map(([id, b]) => {
        const path = walkFind(d, id);
        if (path && path.some((n) => !isSelfVisible(n, state, width))) return null;
        const route = d.layout.edges[startEdgeId(id)];
        return (
          <g key={id}>
            <circle cx={b.x + b.w / 2} cy={b.y + b.h / 2} r={b.w / 2} style={{ fill: INK }} />
            {route ? <path d={edgePath(route.points)} fill="none" style={{ stroke: INK2 }} strokeWidth={1.5} /> : null}
            {route ? <path d={arrowHead(route.points)} style={{ fill: INK2 }} /> : null}
          </g>
        );
      })}
    </svg>
  );
}
/** 按 id 找状态节点（起点圆点跟随它的可见性，也跟随它所在分组的可见性）。返回从根到它的路径。 */
function walkFind(d: DiagramCtxValue, id: string): SceneNode[] | null {
  const rec = (n: SceneNode, path: SceneNode[]): SceneNode[] | null => {
    if (n.id === id && n !== d.rootNode) return [...path, n];
    for (const c of n.children ?? []) {
      const r = rec(c, n === d.rootNode ? path : [...path, n]);
      if (r) return r;
    }
    return null;
  };
  return rec(d.rootNode, []);
}

function DiagramGroup({ node, p }: NodeProps) {
  const d = useContext(DiagramContext);
  const box = d?.layout.groups[node.id];
  const title = d?.layout.titles[node.id];
  const appear = useAppear(d?.mountedAt);
  const exit = useExit();
  const tone = typeof p.tone === 'string' && GROUP_TONE[p.tone] ? GROUP_TONE[p.tone]! : null;
  // trace 经过：分组轻微高亮（D69）。显式写的 state 优先
  const st = effectiveState(p.state, d?.states, node.id).state;
  const accent = st === 'active' ? INFO : st === 'error' ? DANGER : null;
  const edge = accent ?? (tone ? `color-mix(in srgb, ${tone} 60%, ${LINE_STRONG})` : DIMMED);
  const fill = tone ? `color-mix(in srgb, ${tone} 7%, ${SURFACE})` : 'color-mix(in srgb, var(--jp-subtle) 70%, transparent)';
  const root = useRoot(node, p, {
    className: 'jbox [.jstage[data-stroke=clean]_&]:rounded-[14px]',
    style: box ? { position: 'absolute', left: box.x - d!.origin.x, top: box.y - d!.origin.y, width: box.w, height: box.h, background: fill, transition: 'background .3s' } : { display: 'none' },
  });
  if (!d || !box) return null;
  const icon = typeof p.icon === 'string' ? p.icon : null;
  return (
    <motion.div {...root} data-soft="" data-dashed="" data-state={st} data-tone={typeof p.tone === 'string' ? p.tone : undefined} data-appear={appear ? '' : undefined} initial={appear ? { opacity: 0 } : false} animate={{ opacity: 1 }} exit={exit} transition={{ duration: 0.4 }}>
      {/* 分组框与标题不随焦点外调暗（data-jfocus-keep）：镜头推近组里的节点时，归属信息仍然清楚（D69） */}
      <div style={{ position: 'absolute', inset: 0 }} data-jfocus-keep="">
        <Rough seedKey={`${node.id}:${st === 'idle' || st === 'ok' || st === 'dim' ? 'idle' : st}`} shape="roundrect" radius={14} stroke={edge} dashed={!accent} strokeWidth={accent ? 2 : 1.2} />
      </div>
      {title ? (
        <div
          data-jgroup-title=""
          data-jfocus-keep=""
          style={{
            position: 'absolute',
            left: title.x - box.x,
            top: title.y - box.y,
            width: title.w,
            height: title.h,
            zIndex: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '0 7px',
            borderRadius: 6,
            background: accent ? `color-mix(in srgb, ${accent} 14%, ${SURFACE})` : tone ? `color-mix(in srgb, ${tone} 14%, ${SURFACE})` : `color-mix(in srgb, ${SURFACE} 92%, transparent)`,
            color: accent ?? (tone ? `color-mix(in srgb, ${tone} 75%, ${INK})` : INK2),
            fontSize: GROUP_FONT,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            transition: 'background .3s, color .3s',
          }}
        >
          {icon ? <KindIcon kind={icon} size={13} always /> : null}
          <span className="jtrunc">{str(p.label)}</span>
        </div>
      ) : null}
      <DiagramContext.Provider value={{ ...d, origin: { x: box.x, y: box.y } }}>
        <DiagramChildren nodes={node.children} />
      </DiagramContext.Provider>
    </motion.div>
  );
}

function DiagramNode({ node, p }: NodeProps) {
  const d = useContext(DiagramContext);
  const { mode, selectedId } = { mode: useStroke(), selectedId: useCtx().selectedId };
  const box = d?.layout.nodes[node.id];
  // 显式写的 state 优先；没写时用 trace（或状态机 value）推算的状态
  const state = effectiveState(p.state, d?.states, node.id).state;
  const tone = D_TONE[state]!;
  const isState = node.type === 'diagram:StateMachine.State';
  const kind = isState ? 'state' : typeof p.kind === 'string' ? p.kind : 'service';
  const shape = shapeOf(kind);
  const appear = useAppear(d?.mountedAt);
  const exit = useExit();
  const current = isState && d?.current === node.id;
  const final = isState && p.final === true;
  const root = useRoot(node, p, {
    style: box ? { position: 'absolute', left: box.x - d!.origin.x, top: box.y - d!.origin.y, width: box.w, height: box.h, zIndex: 2, opacity: state === 'dim' ? 0.45 : 1, transition: 'opacity .3s' } : { display: 'none' },
  });
  if (!d || !box) return null;
  const desc = str(p.description);
  const sw = state === 'idle' || state === 'dim' ? 1.4 : 2.2;
  const inset = final ? 4 : 0;
  const ix = (v: number) => v + inset;
  return (
    <motion.div {...root} data-state={state} data-kind={kind} data-current={current ? '' : undefined} data-appear={appear ? '' : undefined} initial={appear ? { opacity: 0, scale: 0.88 } : false} animate={{ opacity: 1, scale: 1 }} exit={exit} transition={{ duration: 0.35, ease: 'easeOut' }}>
      {mode === 'rough' ? (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Rough seedKey={node.id} shape="custom" pathOf={SHAPE[shape]} stroke={tone.stroke} strokeWidth={sw} fill={tone.fill} fillStyle="solid" dashed={kind === 'external'} inset={1.5 + inset} />
          {final ? <Rough seedKey={`${node.id}:outer`} shape="custom" pathOf={SHAPE[shape]} stroke={tone.stroke} strokeWidth={1.2} inset={1} /> : null}
        </div>
      ) : (
        <svg aria-hidden width={box.w} height={box.h} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          <path d={SHAPE[shape]!(ix(sw / 2), ix(sw / 2), box.w - sw - 2 * inset, box.h - sw - 2 * inset)} fill={tone.fill} stroke={tone.stroke} strokeWidth={sw} strokeDasharray={kind === 'external' ? '6 4' : undefined} style={{ transition: 'fill .25s, stroke .25s' }} />
          {final ? <path d={SHAPE[shape]!(0.6, 0.6, box.w - 1.2, box.h - 1.2)} fill="none" stroke={tone.stroke} strokeWidth={1.2} /> : null}
        </svg>
      )}
      {selectedId === node.id ? <div aria-hidden style={{ position: 'absolute', inset: -5, border: '2.5px solid var(--sel)', borderRadius: 12 }} /> : null}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: isState ? 'center' : undefined,
          textAlign: isState ? 'center' : undefined,
          gap: 2,
          padding: `${kind === 'database' ? 14 : 6}px ${kind === 'queue' ? 24 : 12 + inset}px 6px`,
          color: tone.text,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <KindIcon kind={kind} />
          <span className="jtrunc" style={{ fontSize: NODE_FONT, fontWeight: current ? 700 : 600, lineHeight: 1.3 }}>
            {str(p.label, node.id)}
          </span>
        </div>
        {desc ? <div data-jdesc="" style={{ fontSize: DESC_FONT, lineHeight: '16px', color: state === 'idle' ? DIMMED : tone.text, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{desc}</div> : null}
      </div>
    </motion.div>
  );
}

/** state 为 active 时沿连线从 from 移到 to 的小点（Motion）；不做动画时停在 3/4 处，截图也看得出“正在调用”的方向。 */
function MovingDot({ d, color, animate: anim, reverse = false }: { d: string; color: string; animate: boolean; reverse?: boolean }) {
  const pathRef = useRef<SVGPathElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const { clock: coarse } = useCtx();
  // 小点逐帧沿线移动：只有这里订阅每一帧（D99）
  const clock = useEngineFrame(anim && !!coarse) ?? coarse;
  useEffect(() => {
    const path = pathRef.current;
    const dot = dotRef.current;
    if (!path || !dot) return;
    const len = path.getTotalLength();
    const place = (t: number) => {
      const pt = path.getPointAtLength(t * len);
      dot.setAttribute('cx', String(pt.x));
      dot.setAttribute('cy', String(pt.y));
    };
    if (!anim || !clock) {
      place(reverse ? 0.25 : 0.75); // 中点通常是连线标签，停在标签与（行进方向上的）终点之间
      return;
    }
    place(reverse ? 1 : 0);
    // 一圈的时长：trace() 效果在编译期用同一个算法声明这一步的 holdMs，自动播放据此等小点至少跑完一圈
    const dur = Math.max(0.9, len / 260);
    const t = (clock.elapsedMs % (dur * 1000)) / (dur * 1000);
    place(reverse ? 1 - t : t);
  }, [d, anim, reverse, clock?.timeMs]);
  return (
    <>
      <path ref={pathRef} d={d} fill="none" stroke="none" />
      <circle ref={dotRef} r={5.5} style={{ fill: color, stroke: SURFACE }} strokeWidth={1.5} data-jdot="" />
    </>
  );
}

function DiagramEdge({ node, p }: NodeProps) {
  const dctx = useContext(DiagramContext);
  const { animate, selectedId } = useCtx();
  const mode = useStroke();
  const attrs = useRootAttrs(node);
  const appear = useAppear(dctx?.mountedAt);
  const exit = useExit();
  const from = str(p.from);
  const to = str(p.to);
  const route = dctx?.layout.edges[node.id];
  if (!dctx || !route || route.points.length < 2) return null;
  // 出现动画：用一条沿路径伸长的遮罩把连线（含手绘线、虚线、箭头）从 from 画到 to
  const maskId = `jdraw-${dctx.key}-${node.id}`.replace(/[^\w-]/g, '_');
  // 显式写的 state 优先；没写时用 trace 推算的状态（D48）；trace 逆着连线方向走时小点逆向流动
  const eff = effectiveState(p.state, dctx.states, node.id);
  const state = eff.state;
  const color = selectedId === node.id ? 'var(--sel)' : EDGE_TONE[state]!;
  const dashed = p.async === true || state === 'error';
  const d = edgePath(route.points);
  // 当前调用一眼可见（D69 补充）：本步有调用线时只有它们突出——加粗、着色、箭头更大、画在节点之上、不随焦点外调暗；
  // 其余连线（包括连着焦点节点的别的线）变细变浅、画在下层。本步没有调用线时，按镜头焦点突出焦点之间的连线。
  const emph = dctx.now.size ? dctx.now.has(node.id) : dctx.focus ? edgeEmphasized(dctx.focus, { id: node.id, from, to }, state) : false;
  const quiet = !emph && (dctx.now.size > 0 || !!dctx.focus);
  const sw = emph ? (state === 'idle' ? 2.6 : 3.4) : quiet ? 1.2 : state === 'idle' || state === 'dim' ? 1.5 : 2.4;
  const tone = quiet && state === 'idle' ? LINE_STRONG : color;
  const head = arrowHead(route.points, emph ? 12 : 9);
  const label = str(p.label);
  const lb = route.label;
  const keep = emph ? '' : undefined;
  return (
    <>
      <motion.svg
        aria-hidden={false}
        width={dctx.width}
        height={dctx.height}
        style={{ position: 'absolute', left: -dctx.origin.x, top: -dctx.origin.y, overflow: 'visible', pointerEvents: 'none', zIndex: emph ? 5 : 1 }}
        data-jfocus-keep={keep}
        data-jedge-svg={node.id}
        initial={false}
        animate={{ opacity: 1 }}
        exit={exit}
      >
        {appear ? (
          <defs>
            <mask id={maskId} maskUnits="userSpaceOnUse" x={-50} y={-50} width={dctx.width + 100} height={dctx.height + 100}>
              <motion.path d={d} fill="none" stroke="#fff" strokeWidth={28} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7, ease: 'easeInOut' }} />
            </mask>
          </defs>
        ) : null}
        <g {...attrs} data-state={state} data-emph={emph ? '' : undefined} data-quiet={quiet ? '' : undefined} data-async={p.async === true ? '' : undefined} data-appear={appear ? '' : undefined} style={{ opacity: state === 'dim' ? 0.5 : 1, transition: 'opacity .25s' }} mask={appear ? `url(#${maskId})` : undefined}>
          {/* 透明的粗线：⌥+单击检查连线时好点中 */}
          <path d={d} fill="none" stroke="transparent" strokeWidth={14} style={{ pointerEvents: 'stroke' }} />
          {mode === 'rough' ? (
            <>
              <RoughPath seedKey={`${node.id}:line`} d={d} stroke={tone} strokeWidth={sw} dashed={dashed} />
              <RoughPath seedKey={`${node.id}:head`} d={head} stroke={tone} strokeWidth={1.2} fill={tone} roughness={0.5} />
            </>
          ) : (
            <>
              <path d={d} fill="none" stroke={tone} strokeWidth={sw} strokeDasharray={dashed ? '7 5' : undefined} style={{ transition: 'stroke .25s' }} />
              <path d={head} fill={tone} stroke="none" />
            </>
          )}
          {state === 'active' ? <MovingDot d={d} color={color} animate={animate} reverse={eff.reverse} /> : null}
        </g>
      </motion.svg>
      {/* 标签单独一层，在所有连线之上（不会被别的连线的点击区盖住）；点它等于点这条连线。位置由编译期布局给出（标签进布局） */}
      {label && lb ? (
        <motion.svg width={dctx.width} height={dctx.height} style={{ position: 'absolute', left: -dctx.origin.x, top: -dctx.origin.y, overflow: 'visible', pointerEvents: 'none', zIndex: emph ? 6 : 3 }} data-jfocus-keep={keep} initial={false} animate={{ opacity: 1 }} exit={exit}>
          <motion.g style={{ pointerEvents: 'all', opacity: state === 'dim' ? 0.5 : 1 }} data-jedge-label="" data-jedge-for={node.id} data-jredact={attrs['data-jredact']} initial={appear ? { opacity: 0 } : false} animate={{ opacity: state === 'dim' ? 0.5 : 1 }} transition={{ duration: 0.3, delay: appear ? 0.45 : 0 }}>
            {/* 标签带底色；当前调用的标签用调用色描边，一眼对上自己的线 */}
            <rect x={lb.x - (emph ? 2 : 0)} y={lb.y - (emph ? 1 : 0)} width={lb.w + (emph ? 4 : 0)} height={lb.h + (emph ? 2 : 0)} rx={4} style={{ fill: SURFACE, stroke: emph ? color : 'none' }} strokeWidth={emph ? 1.4 : 0} fillOpacity={0.96} />
            <text x={lb.x + lb.w / 2} y={lb.y + lb.h / 2} textAnchor="middle" dominantBaseline="central" fontSize={EDGE_FONT} fontWeight={emph || state === 'active' ? 700 : undefined} fill={state === 'idle' ? INK2 : color}>
              {label}
            </text>
          </motion.g>
        </motion.svg>
      ) : null}
    </>
  );
}

// ---------- 时序图（D69） ----------
type SeqCtxValue = { layout: SequenceLayout; structure: SequenceStructure; origin: { x: number; y: number }; width: number; height: number; mountedAt: number; key: string; numbered: boolean };
const SeqDiagramContext = createContext<SeqCtxValue | null>(null);

/** 时序图：坐标来自 IR（纯函数布局），整体缩放到放得下容器；参与者成列、消息成行，trace 点亮这一行。 */
function SequenceDiagram({ node, p }: NodeProps) {
  const { t: i18n } = useI18n<{ thisDiagramHasNoNodesYet: string }>();
  const r = useR(p);
  const { structure, layout } = useMemo(() => sequenceView(node), [node]);
  const ref = useRef<HTMLDivElement | null>(null);
  const { clock } = useCtx();
  const [mountedAt] = useState(() => clock?.timeMs ?? 0);
  const [avail, setAvail] = useState(0);
  const [availH, setAvailH] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      setAvail(el.clientWidth);
      setAvailH(el.clientHeight);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const hRaw = r('h');
  const fill = typeof hRaw === 'string' && /%$/.test(hRaw.trim());
  const hv = Number(hRaw);
  const H = fill ? availH || 420 : Number.isFinite(hv) && hv > 0 ? hv : Math.min(640, Math.max(240, layout.height));
  const { h: _h, numbered: _n, ...rest } = p;
  const { scale } = diagramFit(layout, avail, H);
  const rootProps = useRoot(node, rest, { style: { position: 'relative', width: '100%', height: fill ? String(hRaw) : H, minHeight: fill ? 240 : undefined, overflow: 'hidden' } });
  const W = layout.width * scale;
  const HH = layout.height * scale;
  return (
    <div {...rootProps} ref={(el) => { ref.current = el; }} data-scale={String(scale)}>
      {layout.width === 0 ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: DIMMED, fontSize: 13 }}>{i18n.stage.thisDiagramHasNoNodesYet}</div>
      ) : (
        <div data-jframe-canvas="" style={{ position: 'absolute', left: Math.max(0, (avail - W) / 2), top: Math.max(0, (H - HH) / 2), width: layout.width, height: layout.height, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
          <SeqDiagramContext.Provider value={{ layout, structure, origin: { x: 0, y: 0 }, width: layout.width, height: layout.height, mountedAt, key: node.id, numbered: structure.numbered }}>
            <DiagramChildren nodes={node.children} />
          </SeqDiagramContext.Provider>
        </div>
      )}
    </div>
  );
}

/** 参与者分组（业务域框）与片段框（alt / opt / loop…）：框在后面，标题在左上角。 */
function SequenceFrame({ node, p }: NodeProps) {
  const s = useContext(SeqDiagramContext);
  const { traced } = useCtx();
  const isBlock = node.type === 'diagram:Sequence.Block';
  const box = isBlock ? s?.layout.blocks[node.id] : s?.layout.groups[node.id];
  const title = isBlock ? s?.layout.blockTitles[node.id] : s?.layout.titles[node.id];
  const exit = useExit();
  const st = effectiveState(p.state, traced, node.id).state;
  const accent = st === 'active' ? INFO : st === 'error' ? DANGER : null;
  const root = useRoot(node, p, {
    style: box ? { position: 'absolute', left: box.x - s!.origin.x, top: box.y - s!.origin.y, width: box.w, height: box.h, zIndex: isBlock ? 1 : 0, background: isBlock ? 'transparent' : 'color-mix(in srgb, var(--jp-subtle) 60%, transparent)', borderRadius: isBlock ? 4 : 14 } : { display: 'none' },
  });
  if (!s || !box) return null;
  const kind = typeof p.kind === 'string' ? p.kind : 'opt';
  const icon = typeof p.icon === 'string' ? p.icon : null;
  return (
    // 参与者分组是“归属信息”：镜头聚焦某一行时不随焦点外调暗（片段框照常调暗）
    <motion.div {...root} data-state={st} data-jfocus-keep={isBlock ? undefined : ''} initial={false} animate={{ opacity: 1 }} exit={exit}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} data-jfocus-keep="">
        <Rough seedKey={node.id} shape="roundrect" radius={isBlock ? 4 : 14} stroke={accent ?? (isBlock ? INK2 : DIMMED)} dashed={!isBlock} strokeWidth={accent ? 2 : 1.2} />
      </div>
      {title ? (
        <div
          data-jgroup-title=""
          data-jfocus-keep=""
          style={{
            position: 'absolute',
            left: title.x - box.x,
            top: title.y - box.y,
            width: title.w,
            height: title.h,
            zIndex: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '0 7px',
            fontSize: isBlock ? EDGE_FONT : GROUP_FONT,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            color: accent ?? INK2,
            background: isBlock ? `color-mix(in srgb, ${INK} 8%, ${SURFACE})` : `color-mix(in srgb, ${SURFACE} 92%, transparent)`,
            borderRadius: isBlock ? '4px 0 8px 0' : 6,
          }}
        >
          {icon ? <KindIcon kind={icon} size={13} always /> : null}
          {isBlock ? <span style={{ fontFamily: MONO }}>{kind}</span> : null}
          <span className="jtrunc">{str(p.label)}</span>
        </div>
      ) : null}
      <SeqDiagramContext.Provider value={{ ...s, origin: { x: box.x, y: box.y } }}>
        <DiagramChildren nodes={node.children} />
      </SeqDiagramContext.Provider>
    </motion.div>
  );
}

function SequenceActor({ node, p }: NodeProps) {
  const s = useContext(SeqDiagramContext);
  const { traced, selectedId } = useCtx();
  const mode = useStroke();
  const exit = useExit();
  const box = s?.layout.actors[node.id];
  const life = s?.layout.lifelines[node.id];
  const state = effectiveState(p.state, traced, node.id).state;
  const tone = D_TONE[state]!;
  const root = useRoot(node, p, { style: box ? { position: 'absolute', left: box.x - s!.origin.x, top: box.y - s!.origin.y, width: box.w, height: box.h, zIndex: 2 } : { display: 'none' } });
  if (!s || !box || !life) return null;
  const kind = typeof p.kind === 'string' ? p.kind : 'service';
  const desc = str(p.description);
  const sw = state === 'idle' || state === 'dim' ? 1.4 : 2.2;
  return (
    <>
      {/* 生命线：从头部底边画到最后一行之下 */}
      <motion.svg aria-hidden width={2} height={life.y2 - life.y1} style={{ position: 'absolute', left: life.x - 1 - s.origin.x, top: life.y1 - s.origin.y, overflow: 'visible', pointerEvents: 'none', zIndex: 0 }} initial={false} animate={{ opacity: 1 }} exit={exit}>
        <path d={`M1,0 V${life.y2 - life.y1}`} style={{ stroke: state === 'idle' ? LINE_STRONG : tone.stroke }} strokeWidth={1.3} strokeDasharray="5 5" />
      </motion.svg>
      {/* 参与者头部是“谁在和谁说话”：聚焦某一行时不调暗 */}
      <motion.div {...root} data-state={state} data-kind={kind} data-jfocus-keep="" initial={false} animate={{ opacity: state === 'dim' ? 0.45 : 1 }} exit={exit}>
        {mode === 'rough' ? (
          <div style={{ position: 'absolute', inset: 0 }}>
            <Rough seedKey={node.id} shape="custom" pathOf={SHAPE.rect} stroke={tone.stroke} strokeWidth={sw} fill={tone.fill} fillStyle="solid" inset={1.5} />
          </div>
        ) : (
          <svg aria-hidden width={box.w} height={box.h} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
            <path d={SHAPE.rect!(sw / 2, sw / 2, box.w - sw, box.h - sw)} fill={tone.fill} stroke={tone.stroke} strokeWidth={sw} />
          </svg>
        )}
        {selectedId === node.id ? <div aria-hidden style={{ position: 'absolute', inset: -5, border: '2.5px solid var(--sel)', borderRadius: 12 }} /> : null}
        <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '4px 10px', color: tone.text, textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: '100%' }}>
            <KindIcon kind={kind} size={16} always />
            <span className="jtrunc" style={{ fontSize: NODE_FONT, fontWeight: 600 }}>{str(p.label, node.id)}</span>
          </div>
          {desc ? <div className="jtrunc" style={{ fontSize: DESC_FONT, color: state === 'idle' ? DIMMED : tone.text, maxWidth: '100%' }}>{desc}</div> : null}
        </div>
      </motion.div>
    </>
  );
}

function SequenceMessage({ node, p }: NodeProps) {
  const s = useContext(SeqDiagramContext);
  const { animate, selectedId, traced } = useCtx();
  const mode = useStroke();
  const attrs = useRootAttrs(node);
  const exit = useExit();
  const m = s?.layout.messages[node.id];
  if (!s || !m || m.points.length < 2) return null;
  const eff = effectiveState(p.state, traced, node.id);
  const state = eff.state;
  const color = selectedId === node.id ? 'var(--sel)' : EDGE_TONE[state]!;
  const reply = p.reply === true;
  const open = reply || p.async === true;
  const dashed = reply || state === 'error';
  const d = edgePath(m.points, m.self ? 6 : 0);
  const head = arrowHead(m.points, 9, open);
  const sw = state === 'idle' || state === 'dim' ? 1.5 : 2.4;
  const label = str(p.label);
  const lb = m.label;
  const badge = s.numbered;
  return (
    <motion.svg width={s.width} height={s.height} style={{ position: 'absolute', left: -s.origin.x, top: -s.origin.y, overflow: 'visible', pointerEvents: 'none', zIndex: 3 }} initial={false} animate={{ opacity: 1 }} exit={exit}>
      <g {...attrs} data-state={state} data-reply={reply ? '' : undefined} data-jends={`${str(p.from)} ${str(p.to)}`} style={{ opacity: state === 'dim' ? 0.5 : 1, transition: 'opacity .25s' }}>
        {/* 整行的透明点击区：⌥+单击检查、镜头与高光都按这一行（线 + 标签）定位 */}
        <rect x={Math.min(...m.points.map((q) => q.x)) - 4} y={(lb ? Math.min(lb.y, m.points[0]!.y) : m.points[0]!.y) - 4} width={Math.max(...m.points.map((q) => q.x), lb ? lb.x + lb.w : 0) - Math.min(...m.points.map((q) => q.x)) + 8} height={(m.self ? 24 : 0) + (lb ? m.points[0]!.y - lb.y : 0) + 10} fill="transparent" style={{ pointerEvents: 'all' }} />
        {mode === 'rough' ? (
          <>
            <RoughPath seedKey={`${node.id}:line`} d={d} stroke={color} strokeWidth={sw} dashed={dashed} />
            <RoughPath seedKey={`${node.id}:head`} d={head} stroke={color} strokeWidth={open ? sw : 1.2} fill={open ? undefined : color} roughness={0.5} />
          </>
        ) : (
          <>
            <path d={d} fill="none" stroke={color} strokeWidth={sw} strokeDasharray={dashed ? '7 5' : undefined} style={{ transition: 'stroke .25s' }} />
            <path d={head} fill={open ? 'none' : color} stroke={open ? color : 'none'} strokeWidth={open ? sw : 0} />
          </>
        )}
        {state === 'active' ? <MovingDot d={d} color={color} animate={animate} reverse={eff.reverse} /> : null}
        {lb ? (
          <g data-jedge-label="" data-jedge-for={node.id}>
            {badge ? (
              <>
                <circle cx={lb.x + 9} cy={lb.y + lb.h / 2} r={8.5} style={{ fill: state === 'idle' ? INK2 : color }} />
                <text x={lb.x + 9} y={lb.y + lb.h / 2} textAnchor="middle" dominantBaseline="central" fontSize={10.5} fontWeight={700} style={{ fill: SURFACE }}>
                  {m.n}
                </text>
              </>
            ) : null}
            {label ? (
              <text x={lb.x + (badge ? 22 : 4)} y={lb.y + lb.h / 2} dominantBaseline="central" fontSize={EDGE_FONT} fontWeight={state === 'active' ? 600 : undefined} fill={state === 'idle' ? INK2 : color}>
                {label}
              </text>
            ) : null}
          </g>
        ) : null}
      </g>
    </motion.svg>
  );
}


const IMPL: Record<string, (props: NodeProps) => any> = {
  'diagram:Diagram': Diagram,
  'diagram:Diagram.Group': DiagramGroup,
  'diagram:Diagram.Node': DiagramNode,
  'diagram:Diagram.Edge': DiagramEdge,
  'diagram:StateMachine': Diagram,
  'diagram:StateMachine.Group': DiagramGroup,
  'diagram:StateMachine.State': DiagramNode,
  'diagram:StateMachine.Transition': DiagramEdge,
  'diagram:Sequence': SequenceDiagram,
  'diagram:Sequence.Group': SequenceFrame,
  'diagram:Sequence.Block': SequenceFrame,
  'diagram:Sequence.Actor': SequenceActor,
  'diagram:Sequence.Message': SequenceMessage,
};
export default defineRuntime({ id: 'diagram', components: Object.fromEntries(Object.entries(IMPL).map(([type, Impl]) => [type.slice(8), { react: ({ ctx }) => <Impl node={ctx.model as SceneNode} p={ctx.node.props} disabled={ctx.node.disabled}>{ctx.renderChildren()}</Impl> }])) });
