import type { FrameReadiness } from '../runtime/frame-readiness';
import { EngineClockContext, motion as engineMotion } from './engine-motion';
import type { ClockFrame } from '../runtime/clock';
import type { ActionDispatch, EngineFrame, ActionPresentation } from '@joplo-app/kit/plugin';
import { registerRendererServices } from '@joplo-app/kit/renderer';
import { useI18n } from '../i18n/context';
import { Component, createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type JSX, type ComponentType as ReactComponentType, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { resolveResourceProps, disabledReasonOf, isInteractiveType, splitPluginType, type PluginTable, atWidth, childWidth, choicesOf, layoutRegions, evaluateCondition, isNodeDisabled, isSelfVisible, nodeLabel, resolveProps, resolveValue, walkNodes, type ComponentType, type StateChange, type PlayState, type Scene, type SceneNode } from '@joplo-app/core/runtime';
import { cn } from '@/lib/utils';
import { Rough, RoughPath, ThemeContext, roundRectPath, useStroke } from './rough';
import { fontStyle } from './appearance';
import { DIMMED, INK2, styleOf } from './style';
import { rectOf } from './rect';
import { usePluginStatus } from './plugins';
import type { ComponentCtx, ComponentInstance, PluginNode } from '@joplo-app/kit/plugin';
export type RenderMode = 'review' | 'demo' | 'render';

export type RenderCtx = {
  sampling?:boolean;
  frameReadiness?:FrameReadiness;
  assets?: Readonly<Record<string,string>>;
  act?: ActionDispatch;
  hover?: (id: string | null) => void;
  interactive?: boolean;
  draggable?: ReadonlySet<string>;
  clock?: EngineFrame;
  gesture?: ActionPresentation | null;
  resetKey?: string;
  inputs?: number;
  playground?: boolean;
  scene: Scene;
  stage?: HTMLElement | null;
  state: PlayState;
  mode: RenderMode;
  selectedId: string | null;
  /** 演示动画中的“示例输入”预览（仅视觉，不是业务状态）。 */
  preview: { nodeId: string; text: string } | null;
  dialogLayer: HTMLElement | null;
  animate: boolean;
  /** 舞台宽度（px）：响应式属性、visibleFrom / hiddenFrom、区域收起都按它计算。 */
  width: number;
  /** 镜头此刻对准的元素（T-director3）：架构图据此突出相关连线；null = 没有聚焦。 */
  focus?: string[] | null;
  /** 当前步骤的插件派生快照。 */
  ext?: Readonly<Record<string, unknown>>;
  /** 流式输出（D56）：正在逐字出现的状态路径（如 ui.reply）；null = 全部直接显示全文。 */
  streaming?: StreamingCtx | null;
  /** 相邻步骤的业务状态差异（供插件绘制变化）。 */
  changed?: readonly StateChange[];
  /** 启用的插件（D86，IR 的 plugins）：插件组件的可操作声明。 */
  plugins?: PluginTable;
  /** 下一步要操作的元素（插件可以提示观众）。 */
  nextTargetId?: string | null;
};

/** key 变化时重新开始逐字输出；paused 时停住；speed 与自动播放的速度一致。 */
/** plans：每个正在逐字出现的状态路径，开头 keep 个字直接显示，其余的字在 ms（1×）里出完（D100）。 */
export type StreamingCtx = { plans: ReadonlyMap<string, { keep: number; ms: number; voice?: boolean }>; key: string; paused: boolean; speed: number; /** 这一步的朗读读到哪了（0–1，D100）；null = 不知道，按估算时长。 */ voice?: () => number | null };

export const RenderContext = createContext<RenderCtx | null>(null);
export const useCtx = () => {
  const { t: i18n } = useI18n();

  const c = useContext(RenderContext);
  if (!c) throw new Error(i18n.stage.missingRendercontext);
  return c;
};

const str = (v: unknown, fallback = '') => v === undefined || v === null ? fallback : String(v);
export type NodeProps = { node: SceneNode; p: Record<string, unknown>; disabled: boolean; children: ReactNode };

/** 每个组件根 DOM 共用的属性。 */
export function useRootAttrs(node: SceneNode, disabled = false) {
  return rootAttrsOf(node, useCtx(), disabled);
}

/** 根 DOM 属性（纯函数）：插件组件的锚点也用它，引擎的光标、镜头、提示、检查都按这些属性定位。 */
function rootAttrsOf(node: SceneNode, ctx: Pick<RenderCtx, 'state' | 'selectedId' | 'plugins' | 'draggable' | 'interactive'>, disabled: boolean) {
  const interactive = isInteractiveType(node.type, ctx.plugins);
  return {
    ...Object.fromEntries(Object.values(ctx.plugins ?? {}).flatMap(plugin => Object.entries(plugin.properties ?? {}).flatMap(([key, spec]) => {
      const value = node.props?.[key];
      return spec.attribute && value !== undefined ? [[spec.attribute, String(value)]] : [];
    }))),
    ...(node.traits?.hover ? { 'data-jhoverable': '' } : {}),
    ...(node.traits?.draggable || ctx.draggable?.has(node.id) ? { 'data-jdraggable': '', ...(ctx.interactive ? {tabIndex:0} : {}) } : {}),
    ...(node.traits?.frame ? {'data-jframe-container':''} : {}),
    'data-jid': node.id,
    'data-jtype': node.type,
    ...(node.framing?.kind ? { 'data-jframe': node.framing.kind } : {}),
    ...(node.framing?.include?.length ? { 'data-jframe-include': node.framing.include.join(' ') } : {}),
    ...(node.source ? { 'data-jat': node.source } : {}),
    'data-jlabel': nodeLabel(node),
    ...(node.from ? { 'data-jfrom': node.from } : {}),
    ...(interactive ? { 'data-jinteractive': '' } : {}),
    ...(disabled ? { 'data-jdisabled': '', 'aria-disabled': true as const } : {}),
    ...(node.unmodeled ? { 'data-junmodeled': '' } : {}),
    // 敏感信息（D70）：内容模糊显示，布局不变（index.css）
    ...(node.redact === true || (node.redact && typeof node.redact === 'object' && evaluateCondition(node.redact, ctx.state)) ? { 'data-jredact': '' } : {}),
    ...(ctx.selectedId === node.id ? { 'data-jselected': '' } : {}),
  };
}

/** 根 DOM 的全部属性：data-j*、样式属性（响应式）、作者 className。 */
export function useRoot(node: SceneNode, p: Record<string, unknown>, opts: { disabled?: boolean; className?: string; style?: CSSProperties } = {}) {
  const { width } = useCtx();
  const attrs = useRootAttrs(node, opts.disabled);
  const className = cn(opts.className, typeof p.className === 'string' ? p.className : '');
  return { ...attrs, ...(className ? { className } : {}), style: { ...opts.style, ...styleOf(p, width) } };
}

/** 按舞台宽度取某个属性的值。 */
export function useR(p: Record<string, unknown>) {
  const { width } = useCtx();
  return (k: string) => atWidth(p[k], width);
}

function TextNode({ node, p }: NodeProps) {
  const attrs = useRootAttrs(node);
  const { streaming } = useCtx();
  const raw = node.props?.text;
  const path = typeof raw === 'string' && raw.startsWith('$') ? raw.slice(1) : null;
  const plan = streaming && path ? streaming.plans.get(path) : undefined;
  if (streaming && plan) return <StreamText key={streaming.key} attrs={attrs} text={str(p.text)} plan={plan} voice={streaming.voice} />;
  return <span {...attrs}>{str(p.text)}</span>;
}

const noSubscribe = () => () => {};
const noFrame = () => undefined;
/** 逐帧订阅引擎时钟（D99）：只给真正逐帧画的呈现器用；普通节点读 useCtx().clock（粗粒度，时间字段实时）。 */
export function useEngineFrame(enabled = true): ClockFrame | undefined {
  const source = useContext(EngineClockContext);
  const on = enabled && !!source;
  return useSyncExternalStore(on ? source!.subscribe : noSubscribe, on ? source!.getSnapshot : noFrame, noFrame);
}

/**
 * 逐字出现的文字（D56）：总时长与自动播放的停留用同一份出字计划（core streamPlan）；出完之前末尾有光标。
 * 接着往后写（D100）：开头 keep 个字一开始就在，只有后面的字逐字出现。
 * 跟着朗读出字（pace: 'voice'）时不画块状光标。
 */
function StreamText({ attrs, text, plan, voice }: { attrs: Record<string, unknown>; text: string; plan: { keep: number; ms: number; voice?: boolean }; voice?: () => number | null }) {
  const chars = useMemo(() => [...text], [text]);
  const { clock } = useCtx();
  // 逐字出现与跟着朗读都要逐帧更新（D99）：时钟在时订阅每一帧
  const live = useEngineFrame(!!clock);
  const keep = Math.min(plan.keep, chars.length);
  const fresh = chars.length - keep;
  // 跟着朗读出字：正在放这一步的声音时按它读到的比例（真实时长）；没开声音、录制估算朗读时按估算时长
  const spoken = plan.voice && clock ? voice?.() ?? null : null;
  const n = !clock || fresh <= 0 ? chars.length
    : spoken !== null ? Math.min(chars.length, keep + Math.floor(Math.max(0, Math.min(1, spoken)) * fresh))
    : plan.ms > 0 ? Math.min(chars.length, keep + Math.floor((live ?? clock).elapsedMs / (plan.ms / fresh))) : chars.length;
  const done = n >= chars.length;
  return (
    <span {...attrs} data-jstreaming={done ? undefined : ''}>
      {done ? text : chars.slice(0, n).join('')}
      {/* 跟着朗读出的字（语音转写，D100）是“正在听写”，画面自己有光标，不加“模型在输出”的块状光标 */}
      {done || plan.voice ? null : <span aria-hidden className="jcaret">▍</span>}
    </span>
  );
}

class PluginRenderBoundary extends Component<{ children: ReactNode; id: string }, { error: string | null }> {
  state: { error: string | null } = { error: null };
  static getDerivedStateFromError(error: unknown) { return { error: error instanceof Error ? error.message : String(error) }; }
  render() { return this.state.error ? <div data-jplugin-error={this.props.id}>{this.state.error}</div> : this.props.children; }
}

function PluginHost({ node, p }: NodeProps) {
  const { t: i18n } = useI18n();
  const ctx = useCtx();
  const { theme, registry } = useContext(ThemeContext);
  const split = splitPluginType(node.type)!;
  const status = usePluginStatus(split.plugin);
  const comp = status.state === 'ready' ? status.runtime.components[split.name] : undefined;
  const elRef = useRef<HTMLDivElement | null>(null);
  const inst = useRef<ComponentInstance | null>(null);
  const frameOwner=useRef({});
  useLayoutEffect(()=>()=>ctx.frameReadiness?.cancelOwner(frameOwner.current),[ctx.frameReadiness]);
  const [crash, setCrash] = useState<string | null>(null);
  const root = useRoot(node, p, { className: 'relative w-full' });
  // 命令式组件（mount/update，例如 3D）靠每次提交里的 update 推进画面：逐帧订阅时钟
  useEngineFrame(!!comp?.mount);

  // 截图与导出等插件载入（失败也会结束等待）
  useLayoutEffect(() => {
    if (status.state !== 'loading' || !registry) return;
    const token = {};
    registry.add(token);
    return () => registry.done(token);
  }, [status.state, registry]);

  const toNode = (n: SceneNode): PluginNode => ({
    id: n.id,
    type: n.type,
    name: splitPluginType(n.type)?.name ?? n.type,
    props: resolveResourceProps(resolveProps(n, ctx.state), ctx.assets ?? {}),
    label: nodeLabel(n),
    visible: isSelfVisible(n, ctx.state, ctx.width),
    disabled: isNodeDisabled(n, ctx.state),
    disabledReason: disabledReasonOf(n, ctx.state),
    interactive: isInteractiveType(n.type, ctx.plugins),
    attrs: Object.fromEntries(Object.entries(rootAttrsOf(n, ctx, isNodeDisabled(n, ctx.state))).map(([k, v]) => [k, v === true ? 'true' : String(v)])),
    ext: n.ext,
    get children() { return (n.children ?? []).filter((c) => c.type !== '#text').map(toNode); },
  });
  const element = () => elRef.current ?? ctx.stage?.querySelector<HTMLElement>(`[data-jid="${CSS.escape(node.id)}"]`) ?? null;
  const pctx: ComponentCtx = {
    node: toNode(node),
    model: node,
    ext: ctx.ext ?? {},
    renderChildren: (nodes, container) => {
      const descendants = new Map<string, SceneNode>();
      if (nodes) walkNodes(node, n => descendants.set(n.id, n));
      const chosen = nodes ? nodes.flatMap(n => descendants.has(n.id) ? [descendants.get(n.id)!] : []) : node.children ?? [];
      const children = chosen.map(n => <RenderNode key={n.id} node={n} />);
      return container ? createPortal(children, container) : children;
    },
    frame: { sampling:ctx.sampling, clock: ctx.clock, gesture: ctx.gesture, playground: ctx.playground, resetKey: ctx.resetKey, inputs: ctx.inputs, mode: ctx.mode, animate: ctx.animate, scenarioId: ctx.state.scenarioId, sceneId: ctx.scene.id, position: ctx.state.position, focus: ctx.focus ?? null, nextTarget: ctx.nextTargetId ?? null, selectedId: ctx.selectedId, theme },
    css: (name) => { const el = element() ?? ctx.stage; return el ? getComputedStyle(el).getPropertyValue(name).trim() : ''; },
    act: ctx.act,
    hover: ctx.hover,
    click: (id, at) => {
      const el = element();
      const target = el?.querySelector<HTMLElement>(`[data-jid="${CSS.escape(id)}"]`) ?? el;
      target?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: at?.clientX ?? 0, clientY: at?.clientY ?? 0, altKey: at?.altKey ?? false }));
    },
    frameReady: task => {
      if(!ctx.frameReadiness)throw new Error("This host has no sampled-frame readiness registry");
      return ctx.frameReadiness.register(frameOwner.current,task,node.id);
    },
    hold: () => {
      const token = {};
      registry?.add(token);
      let done = false;
      return () => {
        if (done) return;
        done = true;
        registry?.done(token);
      };
    },
  };
  const latest = useRef(pctx);
  latest.current = pctx;

  useLayoutEffect(() => {
    const el = elRef.current;
    if (!comp?.mount || !el) return;
    try {
      inst.current = comp.mount(el, latest.current);
      setCrash(null);
    } catch (e) {
      setCrash(e instanceof Error ? e.message : String(e));
    }
    return () => {
      try {
        inst.current?.destroy();
      } finally {
        inst.current = null;
        el.replaceChildren();
      }
    };
  }, [comp]);
  useLayoutEffect(() => {
    try {
      inst.current?.update(latest.current);
    } catch (e) {
      setCrash(e instanceof Error ? e.message : String(e));
    }
  });

  const problem = crash ?? (status.state === 'error' ? status.message : status.state === 'ready' && !comp ? `${split.name} cannot be shown on its own` : null);
  if (comp?.react && !problem) { const ReactImpl = comp.react; return <PluginRenderBoundary key={split.plugin + node.id} id={split.plugin}><ReactImpl ctx={pctx} /></PluginRenderBoundary>; }
  if (comp && !problem) return <div {...root} ref={elRef} data-jplugin={split.plugin} />;
  return (
    <div {...root} data-jplugin={split.plugin} data-dashed="">
      <div className="jbox flex min-h-24 w-full flex-col items-center justify-center gap-1 p-4 text-center">
        <Rough seedKey={node.id} dashed stroke={INK2} />
        <div className="font-semibold">{problem ? `${i18n.stage.pluginUnavailable}${split.plugin}` : `${i18n.stage.pluginLoading}${split.plugin}…`}</div>
        {problem ? <div className="text-[12px] text-[var(--jp-muted)]">{problem}</div> : null}
      </div>
    </div>
  );
}

function Custom({ node, p }: NodeProps) {
  const { t: i18n } = useI18n();

  const root = useRoot(node, p, { className: 'jbox flex min-h-24 w-full flex-col items-center justify-center gap-1 bg-[repeating-linear-gradient(45deg,var(--jp-subtle),var(--jp-subtle)_8px,var(--jp-surface)_8px,var(--jp-surface)_16px)] p-4 text-center' });
  return (
    <div {...root} data-dashed="">
      <Rough seedKey={node.id} dashed stroke={INK2} />
      <div className="font-semibold">{i18n.stage.customComponent}{str(p.kind, i18n.stage.unnamed)}{i18n.stage.placeholderSuffix}</div>
      <div className="text-[12px] text-[var(--jp-muted)]">{i18n.stage.aComponentOutsideTheCatalogTheDemoFollowsIts}</div>
    </div>
  );
}

const IMPL: Record<ComponentType, (props: NodeProps) => ReactNode> = {
 '#text': TextNode,
 '#fragment': ({node,p,children}) => <div {...useRoot(node,p)}>{children}</div>,
 Custom,
};
export const IMPLEMENTED_TYPES = Object.keys(IMPL);
/** 渲染一个场景节点（及其可见的子节点）。 */
export function RenderNode({ node }: { node: SceneNode }) {
  const { state, width } = useCtx();
  if (!isSelfVisible(node, state, width)) return null;
  const p = resolveProps(node, state);
  const disabled = isNodeDisabled(node, state);
  const Impl = splitPluginType(node.type) ? PluginHost : IMPL[node.type as ComponentType];
  if (!Impl) return null;
  const children = (node.children ?? []).map((c) => <RenderNode key={c.id} node={c} />);
  return (
    <Impl node={node} p={p} disabled={disabled}>
      {children}
    </Impl>
  );
}

registerRendererServices({ useEngineFrame, motion: engineMotion as unknown as Record<keyof JSX.IntrinsicElements, ReactComponentType<any>>, useLook: () => { const {theme,font} = useContext(ThemeContext); return {theme,font:font??null,style:fontStyle(font)}; }, RendererContextProvider: ({value,children}) => <RenderContext.Provider value={{...useCtx(),...value}}>{children}</RenderContext.Provider>, nodeLabel, atWidth, childWidth, choicesOf, layoutRegions, resolveValue, styleOf, useCtx, useI18n, useR, useRoot, useRootAttrs, useStroke, RenderNode, Rough, RoughPath, roundRectPath, rectOf, resolveProps, isSelfVisible, walkNodes });
