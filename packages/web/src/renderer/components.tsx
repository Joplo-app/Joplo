import { useI18n } from '../i18n/context';
import { en, type Dictionary } from '../i18n/en';
/**
 * 组件目录 v3（@joplo-app/core catalog，名称与属性对齐 Mantine，D35）中每个类型的低保真实现。
 * 运行时不引入 Mantine：手绘主题用 Rough 描边与手写字体，线框主题用 1px 边框。
 *
 * - 每个节点的根 DOM 带 data-jid / data-jtype / data-jat（= node.source，用于“选中 → 文件:行号”）。
 *   输入组件的根包含 label / description / error，真正的控件另带 data-jcontrol=<id>，演示光标对准它。
 * - 绑定、可见性、禁用一律由 core 计算：resolveProps / isSelfVisible（含 Modal / Drawer 的 opened、
 *   visibleFrom / hiddenFrom）/ isNodeDisabled / appShellLayout / choicesOf。
 * - 响应式：所有布局与样式属性都接受 { base, xs, sm, md, lg, xl }，按舞台宽度（RenderCtx.width）取值。
 * - 作者的 className 与 style 原样加到根 DOM（逃生口）。其他属性不透传到 DOM。
 * - 只用 React 文本节点渲染内容，不使用 dangerouslySetInnerHTML；链接不生成真实 href；图片不加载外部地址。
 */
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { animate as animateValue } from 'motion';
import {
  INTERACTIVE_TYPES,
  appShellLayout,
  VIEWPORT_SIZE,
  atWidth,
  childWidth,
  choicesOf,
  isNodeDisabled,
  isSelfVisible,
  nodeLabel,
  resolveProps,
  resolveValue,
  walkNodes,
  type ComponentType,
  type DiagramStates,
  type StateChange,
  type PlayState,
  type Scene,
  type SceneNode,
  type ShellLayout,
} from '@joplo-app/core';
import { cn } from '@/lib/utils';
import { changeFor, dataRows, displayData, stateFlowItems } from './story-data';
import { streamMs } from '../runtime/pace';
import { Rough, RoughPath, ThemeContext, roundRectPath, useStageTheme, useStroke } from './rough';
import { fontStyle } from './appearance';
import { DESC_FONT, EDGE_FONT, FOCUS_EDGE_FONT, FOCUS_MOVE_MS, GROUP_FONT, NODE_FONT, arrowHead, diagramFit, diagramFocus, diagramStructure, edgeEmphasized, effectiveState, focusLayout, focusMembers, type FocusLayout, edgePath, layoutDiagram, structureKey, type DLayout } from './diagram-layout';
import { ACCENT, BG, DANGER, onFill, DIMMED, FONT, INFO, INK, INK2, LINE, LINE_STRONG, MONO, OK, SOFT, SPACING, SUBTLE, SURFACE, TITLE_SIZE, WARN, color, dim, flexVal, fontSize, light, radius, space, spaceNum, styleOf, tint } from './style';

export type RenderMode = 'review' | 'demo' | 'render';

export type RenderCtx = {
  scene: Scene;
  state: PlayState;
  mode: RenderMode;
  selectedId: string | null;
  /** 演示动画中的“示例输入”预览（仅视觉，不是业务状态）。 */
  preview: { nodeId: string; text: string } | null;
  dialogLayer: HTMLElement | null;
  animate: boolean;
  /** 舞台宽度（px）：响应式属性、visibleFrom / hiddenFrom、AppShell 收起都按它计算。 */
  width: number;
  /** 镜头此刻对准的元素（T-director3）：架构图据此突出相关连线；null = 没有聚焦。 */
  focus?: string[] | null;
  /** 由 trace 推算的 Diagram 状态（D48，core 的 diagramStateAt）；节点 / 连线没写 state 时用它。 */
  traced?: DiagramStates;
  /** 流式输出（D56）：正在逐字出现的状态路径（如 ui.reply）；null = 全部直接显示全文。 */
  streaming?: StreamingCtx | null;
  /** 相邻步骤的业务状态差异（只由 DataCard / StateFlow 消费）。 */
  changed?: readonly StateChange[];
};

/** key 变化时重新开始逐字输出；paused 时停住；speed 与自动播放的速度一致。 */
export type StreamingCtx = { paths: ReadonlySet<string>; key: string; paused: boolean; speed: number };

export const RenderContext = createContext<RenderCtx | null>(null);
const useCtx = () => {
  const { t: i18n } = useI18n();

  const c = useContext(RenderContext);
  if (!c) throw new Error(i18n.stage.missingRendercontext);
  return c;
};

/** Tabs / Radio.Group / SegmentedControl 的当前值。 */
const ValueContext = createContext<{ owner: string; value: string | null; disabled: boolean } | null>(null);
/** Accordion：展开的项。 */
const AccordionContext = createContext<{ open: Set<string> } | null>(null);
const AccordionItemContext = createContext<{ value: string; open: boolean } | null>(null);
/** Timeline / Stepper：子项序号与当前进度。 */
const SequenceContext = createContext<{ ids: string[]; active: number; content: HTMLElement | null } | null>(null);
/** AppShell：各区域的尺寸与收起状态。 */
const ShellContext = createContext<{ layout: ShellLayout; autoBurger: boolean } | null>(null);

const str = (v: unknown, fallback = ''): string => (v === undefined || v === null ? fallback : typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(v));
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

type NodeProps = { node: SceneNode; p: Record<string, unknown>; disabled: boolean; children: ReactNode };

/** 每个组件根 DOM 共用的属性。 */
function useRootAttrs(node: SceneNode, disabled = false) {
  const ctx = useCtx();
  const interactive = INTERACTIVE_TYPES.has(node.type);
  return {
    'data-jid': node.id,
    'data-jtype': node.type,
    ...(node.source ? { 'data-jat': node.source } : {}),
    'data-jlabel': nodeLabel(node),
    ...(node.from ? { 'data-jfrom': node.from } : {}),
    ...(interactive ? { 'data-jinteractive': '' } : {}),
    ...(disabled ? { 'data-jdisabled': '', 'aria-disabled': true as const } : {}),
    ...(node.unmodeled ? { 'data-junmodeled': '' } : {}),
    ...(ctx.selectedId === node.id ? { 'data-jselected': '' } : {}),
  };
}

/** 根 DOM 的全部属性：data-j*、样式属性（响应式）、作者 className。 */
function useRoot(node: SceneNode, p: Record<string, unknown>, opts: { disabled?: boolean; className?: string; style?: CSSProperties } = {}) {
  const { width } = useCtx();
  const attrs = useRootAttrs(node, opts.disabled);
  const className = cn(opts.className, typeof p.className === 'string' ? p.className : '');
  return { ...attrs, ...(className ? { className } : {}), style: { ...opts.style, ...styleOf(p, width) } };
}

/** 按舞台宽度取某个属性的值。 */
function useR(p: Record<string, unknown>) {
  const { width } = useCtx();
  return (k: string) => atWidth(p[k], width);
}

/** 可输入组件的显示值：动画预览 > 状态 inputs[id] > 绑定的 value > checked > defaultValue。 */
function useInputValue(node: SceneNode, p: Record<string, unknown>): unknown {
  const { state, preview } = useCtx();
  if (preview && preview.nodeId === node.id) return preview.text;
  if (state.inputs[node.id] !== undefined) return state.inputs[node.id];
  if (p.value !== undefined) return p.value;
  if (p.checked !== undefined) return p.checked;
  return p.defaultValue ?? p.defaultChecked;
}

function textOf(node: SceneNode, state: PlayState): string {
  if (node.type === '#text') return str(resolveValue(node.props?.text, state));
  return (node.children ?? []).map((c) => textOf(c, state)).join('');
}

/** 手绘描边 + 线框边框共用的盒子。 */
function boxStyle(stroke?: string, fill?: string): CSSProperties {
  return { ...(stroke ? { borderColor: stroke } : {}), ...(fill ? { background: fill } : {}) };
}

// ============ 文本与 HTML ============

function TextNode({ node, p }: NodeProps) {
  const attrs = useRootAttrs(node);
  const { streaming } = useCtx();
  const raw = node.props?.text;
  const path = typeof raw === 'string' && raw.startsWith('$') ? raw.slice(1) : null;
  if (streaming && path && streaming.paths.has(path)) return <StreamText key={streaming.key} attrs={attrs} text={str(p.text)} s={streaming} />;
  return <span {...attrs}>{str(p.text)}</span>;
}

/** 逐字出现的文字（D56）：总时长与自动播放的停留用同一个 streamMs；出完之前末尾有光标。 */
function StreamText({ attrs, text, s }: { attrs: Record<string, unknown>; text: string; s: StreamingCtx }) {
  const chars = useMemo(() => [...text], [text]);
  const [n, setN] = useState(0);
  const paused = useRef(s.paused);
  paused.current = s.paused;
  useEffect(() => {
    const per = streamMs(text, s.speed) / Math.max(1, chars.length);
    let elapsed = 0;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      if (!paused.current) elapsed += now - last;
      last = now;
      const k = Math.min(chars.length, Math.floor(elapsed / per));
      setN(k);
      if (k >= chars.length) clearInterval(id);
    }, 30);
    return () => clearInterval(id);
  }, [text, chars, s.speed]);
  const done = n >= chars.length;
  return (
    <span {...attrs} data-jstreaming={done ? undefined : ''}>
      {done ? text : chars.slice(0, n).join('')}
      {done ? null : <span aria-hidden className="jcaret">▍</span>}
    </span>
  );
}

const HTML_TAGS = ['div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'main', 'section', 'header', 'footer', 'nav', 'aside', 'ul', 'ol', 'li', 'strong', 'em', 'small', 'code'] as const;
type HtmlTag = (typeof HTML_TAGS)[number];

function htmlImpl(tag: HtmlTag) {
  return function Html({ node, p, children }: NodeProps) {
    const root = useRoot(node, p, { className: `jh-${tag}` });
    const Tag = tag as 'div';
    return <Tag {...root}>{children}</Tag>;
  };
}

function Title({ node, p, children }: NodeProps) {
  const order = Math.min(6, Math.max(1, Number(p.order ?? 1) || 1));
  const size = fontSize(p.size) ?? `${TITLE_SIZE[order - 1]}px`;
  const root = useRoot(node, p, { className: 'jt-title', style: { fontSize: size, fontWeight: order <= 2 ? 700 : 650, lineHeight: 1.3 } });
  const Tag = `h${order}` as 'h1';
  return <Tag {...root}>{children}</Tag>;
}

function Text({ node, p, children }: NodeProps) {
  const r = useR(p);
  const clamp = typeof p.lineClamp === 'number' ? p.lineClamp : null;
  const style: CSSProperties = {
    fontSize: p.inherit ? undefined : (fontSize(r('size')) ?? `${FONT.md! - 1}px`),
    whiteSpace: p.truncate ? 'nowrap' : 'pre-line',
    lineHeight: 1.55,
    ...(p.truncate ? { overflow: 'hidden', textOverflow: 'ellipsis' } : {}),
    ...(clamp ? { display: '-webkit-box', WebkitLineClamp: clamp, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : {}),
    ...(p.c === undefined && p.color !== undefined ? { color: color(p.color) } : {}),
    ...(p.gradient ? { fontWeight: 700 } : {}),
  };
  const root = useRoot(node, p, { style });
  const inline = p.span === true || p.component === 'span' || p.inline === true;
  return inline ? <span {...root}>{children}</span> : <p {...root}>{children}</p>;
}

function Code({ node, p, children }: NodeProps) {
  const bg = color(p.color);
  const block = p.block === true;
  const root = useRoot(node, p, {
    style: {
      fontFamily: MONO,
      fontSize: block ? 13 : '0.88em',
      background: bg ? light(bg) : SUBTLE,
      borderRadius: 4,
      padding: block ? '10px 12px' : '1px 5px',
      whiteSpace: block ? 'pre-wrap' : 'pre-wrap',
      display: block ? 'block' : 'inline',
      wordBreak: 'break-word',
    },
  });
  return block ? <pre {...root}>{children}</pre> : <code {...root}>{children}</code>;
}

function Kbd({ node, p, children }: NodeProps) {
  const root = useRoot(node, p, { className: 'jbox', style: { display: 'inline-block', fontFamily: MONO, fontSize: 12, padding: '0 6px', borderBottomWidth: 3, borderColor: LINE_STRONG, borderRadius: 4, background: SUBTLE } });
  return (
    <kbd {...root} data-soft="">
      {children}
    </kbd>
  );
}

function Blockquote({ node, p, children }: NodeProps) {
  const c = color(p.color) ?? INFO;
  const root = useRoot(node, p, { style: { borderLeft: `4px solid ${c}`, background: light(c), padding: '12px 16px', borderRadius: 4 } });
  return (
    <blockquote {...root}>
      <div style={{ whiteSpace: 'pre-line' }}>{children}</div>
      {p.cite ? <cite style={{ display: 'block', marginTop: 6, fontSize: 13, color: DIMMED, fontStyle: 'normal' }}>— {str(p.cite)}</cite> : null}
    </blockquote>
  );
}

function List({ node, p, children }: NodeProps) {
  const ordered = p.type === 'ordered';
  const root = useRoot(node, p, { style: { listStyle: ordered ? 'decimal' : 'disc', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: space(p.spacing) ?? '4px', fontSize: fontSize(p.size) } });
  return ordered ? <ol {...root}>{children}</ol> : <ul {...root}>{children}</ul>;
}
function ListItem({ node, p, children }: NodeProps) {
  const root = useRoot(node, p, { style: { whiteSpace: 'pre-line' } });
  return <li {...root}>{children}</li>;
}

function Anchor({ node, p, disabled, children }: NodeProps) {
  const c = color(p.c) ?? INFO;
  const root = useRoot(node, p, { disabled, className: 'cursor-pointer', style: { color: disabled ? DIMMED : c, textDecoration: p.underline === 'never' ? 'none' : 'underline', textUnderlineOffset: 4, fontSize: fontSize(p.size) } });
  return (
    <a {...root} role="link" tabIndex={0}>
      {children}
    </a>
  );
}

// ============ 布局 ============

function Box({ node, p, children }: NodeProps) {
  const root = useRoot(node, p);
  return <div {...root}>{children}</div>;
}

function Space({ node, p }: NodeProps) {
  const r = useR(p);
  const root = useRoot(node, p, { style: { height: space(r('h')), width: space(r('w')), flexShrink: 0 } });
  return <div {...root} aria-hidden />;
}

function Stack({ node, p, children }: NodeProps) {
  const r = useR(p);
  const root = useRoot(node, p, {
    style: { display: 'flex', flexDirection: 'column', gap: space(r('gap')) ?? `${SPACING.md}px`, alignItems: flexVal(r('align'), 'stretch'), justifyContent: flexVal(r('justify'), 'flex-start') },
  });
  return <div {...root}>{children}</div>;
}

function Group({ node, p, children }: NodeProps) {
  const r = useR(p);
  const root = useRoot(node, p, {
    className: r('grow') ? 'jgrow' : undefined,
    style: {
      display: 'flex',
      flexDirection: 'row',
      gap: space(r('gap')) ?? `${SPACING.md}px`,
      alignItems: flexVal(r('align'), 'center'),
      justifyContent: flexVal(r('justify'), 'flex-start'),
      flexWrap: (flexVal(r('wrap'), 'wrap') as CSSProperties['flexWrap']) ?? 'wrap',
    },
  });
  return <div {...root}>{children}</div>;
}

function Flex({ node, p, children }: NodeProps) {
  const r = useR(p);
  const root = useRoot(node, p, {
    style: {
      display: p.inline ? 'inline-flex' : 'flex',
      flexDirection: (flexVal(r('direction'), 'row') as CSSProperties['flexDirection']) ?? 'row',
      flexWrap: (flexVal(r('wrap'), 'nowrap') as CSSProperties['flexWrap']) ?? 'nowrap',
      gap: space(r('gap')),
      rowGap: space(r('rowGap')),
      columnGap: space(r('columnGap')),
      alignItems: flexVal(r('align')),
      justifyContent: flexVal(r('justify')),
    },
  });
  return <div {...root}>{children}</div>;
}

function SimpleGrid({ node, p, children }: NodeProps) {
  const r = useR(p);
  const cols = Math.max(1, Number(r('cols') ?? 1) || 1);
  const gap = space(r('spacing')) ?? `${SPACING.md}px`;
  const root = useRoot(node, p, { style: { display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, columnGap: gap, rowGap: space(r('verticalSpacing')) ?? gap } });
  return (
    <div {...root} data-cols={cols}>
      {children}
    </div>
  );
}

const GridContext = createContext<{ columns: number; gutter: number; grow: boolean }>({ columns: 12, gutter: 16, grow: false });
function Grid({ node, p, children }: NodeProps) {
  const r = useR(p);
  const columns = Math.max(1, Number(r('columns') ?? 12) || 12);
  const gutter = spaceNum(r('gutter'), SPACING.md!);
  const root = useRoot(node, p, { style: { display: 'flex', flexWrap: 'wrap', gap: gutter, alignItems: flexVal(r('align'), 'stretch'), justifyContent: flexVal(r('justify'), 'flex-start') } });
  return (
    <GridContext.Provider value={{ columns, gutter, grow: p.grow === true }}>
      <div {...root}>{children}</div>
    </GridContext.Provider>
  );
}
function GridCol({ node, p, children }: NodeProps) {
  const r = useR(p);
  const g = useContext(GridContext);
  const span = r('span') ?? 12;
  const offset = Number(r('offset') ?? 0) || 0;
  const frac = (n: number) => `calc((100% + ${g.gutter}px) * ${n / g.columns} - ${g.gutter}px)`;
  const style: CSSProperties =
    span === 'auto' ? { flex: '1 1 0', minWidth: 0 } : span === 'content' ? { flex: '0 0 auto' } : { flex: g.grow ? `1 0 ${frac(Number(span) || 12)}` : `0 0 ${frac(Number(span) || 12)}`, maxWidth: g.grow ? undefined : frac(Number(span) || 12), minWidth: 0 };
  if (offset) style.marginLeft = `calc((100% + ${g.gutter}px) * ${offset / g.columns})`;
  const root = useRoot(node, p, { style });
  return <div {...root}>{children}</div>;
}

const CONTAINER: Record<string, number> = { xs: 540, sm: 720, md: 960, lg: 1140, xl: 1320 };
function Container({ node, p, children }: NodeProps) {
  const r = useR(p);
  const size = r('size');
  const max = p.fluid ? '100%' : typeof size === 'number' ? `${size}px` : `${CONTAINER[str(size, 'md')] ?? 960}px`;
  const root = useRoot(node, p, { style: { maxWidth: max, marginLeft: 'auto', marginRight: 'auto', paddingLeft: SPACING.md, paddingRight: SPACING.md, width: '100%' } });
  return <div {...root}>{children}</div>;
}

function Center({ node, p, children }: NodeProps) {
  const root = useRoot(node, p, { style: { display: p.inline ? 'inline-flex' : 'flex', alignItems: 'center', justifyContent: 'center' } });
  return <div {...root}>{children}</div>;
}

function Paper({ node, p, children }: NodeProps) {
  const mode = useStroke();
  const border = p.withBorder === true;
  const shadow = typeof p.shadow === 'string' && p.shadow !== 'none';
  const root = useRoot(node, p, {
    className: border ? 'jbox' : undefined,
    style: { background: SURFACE, borderRadius: p.radius !== undefined ? radius(p.radius) : 'var(--jp-radius)', ...(shadow ? { boxShadow: 'var(--jp-shadow)' } : {}), position: 'relative' },
  });
  return (
    <div {...root} data-soft="">
      {border ? <Rough seedKey={node.id} stroke={SOFT} /> : null}
      {children}
    </div>
  );
}

function Card({ node, p, children }: NodeProps) {
  const r = useR(p);
  const pad = spaceNum(r('padding'), SPACING.md!);
  const border = p.withBorder === true;
  const root = useRoot(node, p, {
    className: 'jbox jcard [.jstage[data-stroke=clean]_&]:rounded-lg',
    style: { display: 'flex', flexDirection: 'column', background: SURFACE, padding: pad, ['--jcard-p' as string]: `${pad}px` },
  });
  return (
    <div {...root} data-soft={border ? undefined : ''}>
      <Rough seedKey={node.id} stroke={border ? INK : SOFT} />
      {children}
    </div>
  );
}
function CardSection({ node, p, children }: NodeProps) {
  const border = p.withBorder === true;
  const root = useRoot(node, p, {
    className: 'jcard-sec',
    style: { marginLeft: 'calc(-1 * var(--jcard-p, 16px))', marginRight: 'calc(-1 * var(--jcard-p, 16px))', ...(p.inheritPadding ? { paddingLeft: 'var(--jcard-p, 16px)', paddingRight: 'var(--jcard-p, 16px)' } : {}), ...(border ? { borderTop: '1px solid #dee2e6', borderBottom: '1px solid #dee2e6' } : {}) },
  });
  return <div {...root}>{children}</div>;
}

function Divider({ node, p }: NodeProps) {
  const vertical = p.orientation === 'vertical';
  const label = p.label !== undefined ? str(p.label) : '';
  const pos = str(p.labelPosition, 'left');
  const c = color(p.color) ?? LINE;
  const root = useRoot(node, p, { style: vertical ? { alignSelf: 'stretch', width: 1, background: c, flexShrink: 0 } : { display: 'flex', alignItems: 'center', gap: 8, width: '100%', color: DIMMED, fontSize: 13 } });
  if (vertical) return <div {...root} role="separator" aria-orientation="vertical" />;
  const line = <span style={{ flex: 1, height: 1, background: c }} />;
  return (
    <div {...root} role="separator">
      {label && pos !== 'left' ? line : null}
      {label ? <span>{label}</span> : null}
      {!label || pos !== 'right' ? line : null}
    </div>
  );
}

function ScrollArea({ node, p, children }: NodeProps) {
  const root = useRoot(node, p, { style: { position: 'relative', overflow: 'auto' } });
  return <div {...root}>{children}</div>;
}

// ============ AppShell ============

function AppShell({ node, p, children }: NodeProps) {
  const { state, width } = useCtx();
  const layout = appShellLayout(node.props, state, width);
  let hasBurger = false;
  walkNodes(node, (n) => {
    if (n.type === 'Burger') hasBurger = true;
  });
  const navW = layout.navbar && !layout.navbar.collapsed && !layout.mobile.navbar ? layout.navbar.size : 0;
  const asideW = layout.aside && !layout.aside.collapsed && !layout.mobile.aside ? layout.aside.size : 0;
  const headH = layout.header && !layout.header.collapsed ? layout.header.size : 0;
  const footH = layout.footer && !layout.footer.collapsed ? layout.footer.size : 0;
  const root = useRoot(node, p, {
    style: {
      display: 'grid',
      height: '100%',
      gridTemplateColumns: `${navW}px minmax(0, 1fr) ${asideW}px`,
      gridTemplateRows: `${headH}px minmax(0, 1fr) ${footH}px`,
      gridTemplateAreas: '"h h h" "n m a" "f f f"',
      position: 'relative',
    },
  });
  return (
    <ShellContext.Provider value={{ layout, autoBurger: !hasBurger && (layout.mobile.navbar || false) && !!layout.navbar }}>
      <div {...root} data-shell-mobile={layout.mobile.navbar ? '' : undefined}>
        {children}
      </div>
    </ShellContext.Provider>
  );
}

function ShellHeader({ node, p, children }: NodeProps) {
  const shell = useContext(ShellContext);
  const root = useRoot(node, p, { style: { gridArea: 'h', borderBottom: `1px solid ${LINE}`, background: SURFACE, minWidth: 0, position: 'relative', zIndex: 2 } });
  if (shell?.layout.header?.collapsed) return null;
  return (
    <header {...root}>
      {shell?.autoBurger ? (
        <span aria-hidden data-jauto-burger="" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}>
          <BurgerIcon opened={false} size={18} />
        </span>
      ) : null}
      <div style={{ height: '100%', paddingLeft: shell?.autoBurger ? 40 : 0 }}>{children}</div>
    </header>
  );
}

function ShellSide({ node, p, children }: NodeProps) {
  const shell = useContext(ShellContext);
  const nav = node.type === 'AppShell.Navbar';
  const region = nav ? shell?.layout.navbar : shell?.layout.aside;
  const mobile = nav ? shell?.layout.mobile.navbar : shell?.layout.mobile.aside;
  const overlay = !!mobile && region && !region.collapsed;
  const root = useRoot(node, p, {
    style: overlay
      ? { position: 'absolute', left: 0, right: 0, top: shell!.layout.header?.size ?? 0, bottom: 0, zIndex: 5, background: SURFACE, overflow: 'auto', display: 'flex', flexDirection: 'column' }
      : { gridArea: nav ? 'n' : 'a', background: SUBTLE, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', [nav ? 'borderRight' : 'borderLeft']: `1px solid ${LINE}` },
  });
  if (region?.collapsed) return null;
  return <nav {...root}>{children}</nav>;
}

function ShellMain({ node, p, children }: NodeProps) {
  const shell = useContext(ShellContext);
  const { width, state } = useCtx();
  const pad = space(atWidth(resolveValue(shell?.layout.padding, state), width)) ?? '0px';
  const root = useRoot(node, p, { style: { gridArea: 'm', minHeight: 0, minWidth: 0, overflow: 'auto', padding: pad } });
  return <main {...root}>{children}</main>;
}

function ShellFooter({ node, p, children }: NodeProps) {
  const shell = useContext(ShellContext);
  const root = useRoot(node, p, { style: { gridArea: 'f', borderTop: `1px solid ${LINE}`, background: SURFACE, minWidth: 0 } });
  if (shell?.layout.footer?.collapsed) return null;
  return <footer {...root}>{children}</footer>;
}

function BurgerIcon({ opened, size = 18 }: { opened: boolean; size?: number }) {
  const bar = (extra: CSSProperties): CSSProperties => ({ position: 'absolute', left: 0, width: size, height: 2, background: INK, borderRadius: 1, transition: 'transform .2s', ...extra });
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: size, height: size * 0.75 }}>
      <span style={bar(opened ? { top: '50%', transform: 'rotate(45deg)' } : { top: 0 })} />
      {opened ? null : <span style={bar({ top: '50%', marginTop: -1 })} />}
      <span style={bar(opened ? { top: '50%', transform: 'rotate(-45deg)' } : { bottom: 0 })} />
    </span>
  );
}

function Burger({ node, p, disabled }: NodeProps) {
  const { t: i18n } = useI18n();

  const root = useRoot(node, p, { disabled, style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, flexShrink: 0 } });
  return (
    <button {...root} type="button" aria-label={str(p['aria-label'], i18n.stage.navigation)} aria-expanded={p.opened === true}>
      <BurgerIcon opened={p.opened === true} size={p.size === 'sm' ? 16 : p.size === 'lg' ? 22 : 18} />
    </button>
  );
}

// ============ 展示 ============

const BADGE_H: Record<string, number> = { xs: 16, sm: 18, md: 20, lg: 26, xl: 32 };
function Badge({ node, p, children }: NodeProps) {
  const mode = useStroke();
  const variant = str(p.variant, 'filled');
  const base = color(p.color) ?? INK;
  const t =
    variant === 'outline' ? { stroke: base, text: base }
    : variant === 'light' ? { stroke: light(base), fill: light(base), text: base }
    : variant === 'dot' || variant === 'default' ? { stroke: LINE_STRONG, text: INK }
    : variant === 'transparent' ? { stroke: 'transparent', text: base }
    : variant === 'white' ? { stroke: SURFACE, fill: SURFACE, text: base }
    : { stroke: base, fill: base, text: onFill(base) };
  const h = BADGE_H[str(p.size, 'md')] ?? 20;
  const root = useRoot(node, p, {
    className: 'jbox',
    style: { display: 'inline-flex', alignItems: 'center', gap: 4, height: h + 4, padding: '0 10px', borderRadius: 999, fontSize: Math.max(11, h - 7), color: t.text, ...(mode === 'clean' ? boxStyle(t.stroke, t.fill) : {}), whiteSpace: 'nowrap', width: p.fullWidth ? '100%' : 'fit-content', justifyContent: 'center' },
  });
  return (
    <span {...root}>
      <Rough seedKey={node.id} shape="ellipse" stroke={t.stroke} fill={t.fill} fillStyle="solid" strokeWidth={1} inset={1} />
      {variant === 'dot' ? <span style={{ width: 6, height: 6, borderRadius: 3, background: base }} /> : null}
      <span className="jtrunc" data-jtext="">
        {children}
      </span>
    </span>
  );
}

const AVATAR: Record<string, number> = { xs: 16, sm: 26, md: 38, lg: 56, xl: 84 };
function initials(name: string): string {
  const t = name.trim();
  if (!t) return '?';
  if (/^[\x00-\x7f]+$/.test(t)) return t.split(/\s+/).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  return t.slice(0, 1);
}
function Avatar({ node, p, children }: NodeProps) {
  const { state } = useCtx();
  const size = typeof p.size === 'number' ? p.size : (AVATAR[str(p.size, 'md')] ?? 38);
  const c = color(p.color) ?? INK2;
  const name = str(p.name ?? p.alt) || textOf(node, state);
  const root = useRoot(node, p, { className: 'jbox', style: { width: size, height: size, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.max(10, size * 0.4), color: c, background: light(c), flexShrink: 0, fontWeight: 600 } });
  return (
    <span {...root}>
      <Rough seedKey={node.id} shape="ellipse" stroke={c} strokeWidth={1.1} />
      <span>{p.name || p.alt || !children ? initials(name) : children}</span>
    </span>
  );
}

function ImageBox({ node, p }: NodeProps) {
  const { t: i18n } = useI18n();

  const r = useR(p);
  const root = useRoot(node, p, { className: 'jbox', style: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: dim(r('w')) ?? '100%', height: dim(r('h')) ?? 160, background: SUBTLE, color: DIMMED, fontSize: 13, borderRadius: radius(p.radius) } });
  return (
    <div {...root} role="img" aria-label={str(p.alt, i18n.stage.image)} data-soft="">
      <Rough seedKey={node.id} stroke={SOFT} fill={LINE} fillStyle="cross-hatch" />
      <span style={{ background: 'rgba(255,255,255,.9)', padding: '0 8px', borderRadius: 4 }}>🖼 {str(p.alt, i18n.stage.image)}</span>
    </div>
  );
}

function ThemeIcon({ node, p, children }: NodeProps) {
  const size = typeof p.size === 'number' ? p.size : (AVATAR[str(p.size, 'md')] ?? 28) * 0.8;
  const c = color(p.color) ?? INK;
  const filled = str(p.variant, 'filled') === 'filled';
  const root = useRoot(node, p, { className: 'jbox', style: { width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: radius(p.radius ?? 'sm'), background: filled ? c : light(c), color: filled ? onFill(c) : c, flexShrink: 0, fontSize: size * 0.55 } });
  return (
    <span {...root}>
      <span>{children}</span>
    </span>
  );
}

function Indicator({ node, p, children }: NodeProps) {
  const c = color(p.color) ?? DANGER;
  const label = p.label !== undefined ? str(p.label) : '';
  const root = useRoot(node, p, { style: { position: 'relative', display: p.inline ? 'inline-block' : 'block', width: 'fit-content' } });
  return (
    <div {...root}>
      {children}
      {p.disabled === true ? null : (
        <span style={{ position: 'absolute', top: -4, right: -4, minWidth: label ? 18 : 10, height: label ? 18 : 10, padding: label ? '0 5px' : 0, borderRadius: 999, background: c, color: '#fff', fontSize: 11, lineHeight: '18px', textAlign: 'center', border: '2px solid #fff', zIndex: 2 }}>{label}</span>
      )}
    </div>
  );
}

function Timeline({ node, p, children }: NodeProps) {
  const active = Number(resolveValue(p.active, useCtx().state) ?? -1);
  const ids = (node.children ?? []).filter((c) => c.type === 'Timeline.Item').map((c) => c.id);
  const root = useRoot(node, p, { style: { display: 'flex', flexDirection: 'column' } });
  return (
    <SequenceContext.Provider value={{ ids, active: Number.isFinite(active) ? active : -1, content: null }}>
      <div {...root}>{children}</div>
    </SequenceContext.Provider>
  );
}
function TimelineItem({ node, p, children }: NodeProps) {
  const seq = useContext(SequenceContext);
  const i = seq ? seq.ids.indexOf(node.id) : 0;
  const done = !!seq && i <= seq.active;
  const last = !!seq && i === seq.ids.length - 1;
  const c = color(p.color) ?? INK;
  const root = useRoot(node, p, { style: { position: 'relative', paddingLeft: 30, paddingBottom: last ? 0 : 18 } });
  return (
    <div {...root} data-active={done ? '' : undefined}>
      {last ? null : <span aria-hidden style={{ position: 'absolute', left: 9, top: 20, bottom: 0, width: 2, background: done && seq && i < seq.active ? c : LINE }} />}
      <span aria-hidden style={{ position: 'absolute', left: 0, top: 2, width: 20, height: 20, borderRadius: 10, border: `2px solid ${done ? c : LINE_STRONG}`, background: done ? c : SURFACE, color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {p.bullet !== undefined ? str(p.bullet) : null}
      </span>
      {p.title !== undefined ? <div style={{ fontWeight: 600, lineHeight: 1.5 }}>{str(p.title)}</div> : null}
      <div style={{ color: INK2, fontSize: 14, whiteSpace: 'pre-line' }}>{children}</div>
    </div>
  );
}

// ============ Table / DataTable ============

const cellPad = '8px 12px';
function TableShell({ node, p, children }: NodeProps & { children: ReactNode }) {
  const root = useRoot(node, p, { className: 'jbox [.jstage[data-stroke=clean]_&]:rounded-md', style: { width: '100%', background: SURFACE, overflowX: 'auto' } });
  return (
    <div {...root} data-soft="">
      <Rough seedKey={node.id} stroke={INK2} strokeWidth={1.1} />
      {children}
    </div>
  );
}

function Table({ node, p, children }: NodeProps) {
  const data = p.data && typeof p.data === 'object' && !Array.isArray(p.data) ? (p.data as Record<string, unknown>) : null;
  const striped = p.striped === true;
  return (
    <TableShell node={node} p={p} disabled={false}>
      <table className={cn('jtable w-full border-collapse text-[14px]', striped && 'jtable-striped')}>
        {data ? (
          <>
            {data.caption ? <caption style={{ captionSide: 'bottom', color: DIMMED, fontSize: 13, padding: 6 }}>{str(data.caption)}</caption> : null}
            {Array.isArray(data.head) ? (
              <thead>
                <tr>
                  {data.head.map((h, i) => (
                    <th key={i}>{str(h)}</th>
                  ))}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {arr(data.body).map((row, i) => (
                <tr key={i}>
                  {arr(row).map((c, j) => (
                    <td key={j}>{str(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </>
        ) : (
          children
        )}
      </table>
    </TableShell>
  );
}
const tablePart = (Tag: 'thead' | 'tbody' | 'tr' | 'th' | 'td') =>
  function TablePart({ node, p, children }: NodeProps) {
    const root = useRoot(node, p);
    return <Tag {...root}>{children}</Tag>;
  };

function getPath(o: unknown, path: string): unknown {
  let cur = o;
  for (const k of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}
const humanize = (s: string) => s.replace(/[_.-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

/** DataTable（mantine-datatable）：records（可绑定）+ columns [{ accessor, title, textAlign, width }] + noRecordsText。 */
function DataTable({ node, p }: NodeProps) {
  const { t: i18n } = useI18n();

  const cols = arr(p.columns)
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object' && (c as Record<string, unknown>).hidden !== true)
    .map((c, i) => {
      const accessor = str(c.accessor ?? c.accessorKey ?? `col${i}`);
      return { accessor, title: c.title !== undefined ? str(c.title) : c.header !== undefined ? str(c.header) : humanize(accessor), align: str(c.textAlign, 'left') as CSSProperties['textAlign'], width: dim(c.width) };
    });
  const rows = arr(p.records ?? p.data);
  return (
    <TableShell node={node} p={p} disabled={false}>
      <table className={cn('jtable w-full border-collapse text-[14px]', p.striped === true && 'jtable-striped')}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.accessor} style={{ textAlign: c.align, width: c.width }}>
                {c.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={Math.max(cols.length, 1)} style={{ padding: '18px 12px', textAlign: 'center', color: DIMMED }} data-jempty="">
                {str(p.noRecordsText ?? p.empty, i18n.stage.noRecords)}
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i} data-jrow-index={i}>
                {cols.map((c) => (
                  <td key={c.accessor} style={{ textAlign: c.align }}>
                    {r && typeof r === 'object' ? str(getPath(r, c.accessor)) : str(r)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </TableShell>
  );
}

// ============ Accordion ============

function Accordion({ node, p, children }: NodeProps) {
  const v = useInputValue(node, p);
  const open = new Set<string>(Array.isArray(v) ? v.map(String) : v !== undefined && v !== null && v !== '' ? [str(v)] : []);
  const root = useRoot(node, p, { className: 'jbox [.jstage[data-stroke=clean]_&]:rounded-md', style: { display: 'flex', flexDirection: 'column', background: SURFACE } });
  return (
    <AccordionContext.Provider value={{ open }}>
      <div {...root} data-soft="">
        <Rough seedKey={node.id} stroke={SOFT} />
        {children}
      </div>
    </AccordionContext.Provider>
  );
}
function AccordionItem({ node, p, children }: NodeProps) {
  const acc = useContext(AccordionContext);
  const value = str(p.value);
  const root = useRoot(node, p, { className: 'jacc-item', style: { borderBottom: `1px solid ${LINE}` } });
  return (
    <AccordionItemContext.Provider value={{ value, open: !!acc?.open.has(value) }}>
      <div {...root}>{children}</div>
    </AccordionItemContext.Provider>
  );
}
function AccordionControl({ node, p, disabled, children }: NodeProps) {
  const item = useContext(AccordionItemContext);
  const root = useRoot(node, p, { disabled, style: { display: 'flex', alignItems: 'center', width: '100%', padding: '10px 14px', gap: 8, fontWeight: 500, textAlign: 'left', color: disabled ? DIMMED : undefined } });
  return (
    <button {...root} type="button" aria-expanded={!!item?.open}>
      <span className="jtrunc" style={{ flex: 1 }} data-jtext="">
        {children}
      </span>
      <span aria-hidden style={{ transform: item?.open ? 'rotate(180deg)' : undefined, color: DIMMED }}>
        ▾
      </span>
    </button>
  );
}
function AccordionPanel({ node, p, children }: NodeProps) {
  const item = useContext(AccordionItemContext);
  const root = useRoot(node, p, { style: { padding: '0 14px 12px', whiteSpace: 'pre-line', fontSize: 14, color: INK2 } });
  if (item && !item.open) return null;
  return <div {...root}>{children}</div>;
}

// ============ Alert / Notification / Loader / Progress ============

function Alert({ node, p, children }: NodeProps) {
  const mode = useStroke();
  const c = color(p.color) ?? INFO;
  const variant = str(p.variant, 'light');
  const filled = variant === 'filled';
  const danger = p.color === 'red';
  const root = useRoot(node, p, {
    className: 'jbox [.jstage[data-stroke=clean]_&]:rounded-md',
    style: { display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', padding: '12px 16px', background: filled ? c : variant === 'outline' || variant === 'white' ? SURFACE : light(c), color: filled ? onFill(c) : INK, ...(mode === 'clean' ? { borderColor: c } : {}) },
  });
  return (
    <div {...root} role={danger ? 'alert' : 'status'}>
      <Rough seedKey={node.id} stroke={c} fill={filled ? c : undefined} fillStyle="solid" />
      <span aria-hidden style={{ width: 20, height: 20, borderRadius: 10, flexShrink: 0, marginTop: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: filled ? '#fff' : c, color: filled ? c : '#fff' }}>
        {p.icon !== undefined ? str(p.icon) : danger ? '!' : 'i'}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
        {p.title !== undefined ? <div style={{ fontWeight: 700, color: filled ? onFill(c) : c, lineHeight: 1.4 }}>{str(p.title)}</div> : null}
        <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-line' }}>{children}</div>
      </div>
      {p.withCloseButton ? (
        <span aria-hidden style={{ color: DIMMED }}>
          ×
        </span>
      ) : null}
    </div>
  );
}

function Notification({ node, p, children }: NodeProps) {
  const c = color(p.color) ?? INFO;
  const root = useRoot(node, p, { className: 'jbox [.jstage[data-stroke=clean]_&]:rounded-md', style: { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px 12px 20px', background: SURFACE, boxShadow: '3px 3px 0 rgba(30,30,30,.1)', position: 'relative' } });
  return (
    <div {...root} role="status" data-soft="">
      <Rough seedKey={node.id} stroke={SOFT} />
      <span aria-hidden style={{ position: 'absolute', left: 6, top: 10, bottom: 10, width: 4, borderRadius: 2, background: c }} />
      {p.loading ? <Spinner size={18} c={c} /> : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        {p.title !== undefined ? <div style={{ fontWeight: 600 }}>{str(p.title)}</div> : null}
        <div style={{ fontSize: 14, color: INK2, whiteSpace: 'pre-line' }}>{children}</div>
      </div>
      {p.withCloseButton === false ? null : (
        <span aria-hidden style={{ color: DIMMED }}>
          ×
        </span>
      )}
    </div>
  );
}

function Spinner({ size = 18, c = INK, kind = 'oval' }: { size?: number; c?: string; kind?: string }) {
  const { animate } = useCtx();
  if (kind === 'dots')
    return (
      <span aria-hidden style={{ display: 'inline-flex', gap: size / 6 }}>
        {[0, 1, 2].map((i) => (
          <motion.span key={i} style={{ width: size / 4, height: size / 4, borderRadius: 99, background: c }} animate={animate ? { opacity: [0.3, 1, 0.3] } : undefined} transition={animate ? { repeat: Infinity, duration: 0.9, delay: i * 0.15 } : undefined} />
        ))}
      </span>
    );
  return (
    <motion.span
      aria-hidden
      style={{ display: 'inline-block', width: size, height: size, flexShrink: 0, borderRadius: 999, border: `2px solid ${c}`, borderTopColor: 'transparent' }}
      animate={animate ? { rotate: 360 } : undefined}
      transition={animate ? { repeat: Infinity, ease: 'linear', duration: 0.9 } : undefined}
    />
  );
}

const LOADER: Record<string, number> = { xs: 14, sm: 18, md: 24, lg: 32, xl: 40 };
function Loader({ node, p, children }: NodeProps) {
  const size = typeof p.size === 'number' ? p.size : (LOADER[str(p.size, 'md')] ?? 24);
  const root = useRoot(node, p, { style: { display: 'inline-flex', alignItems: 'center', gap: 8, color: INK2 } });
  return (
    <div {...root} role="status">
      <Spinner size={size} c={color(p.color) ?? INK} kind={str(p.type, 'oval')} />
      {children ? <span>{children}</span> : null}
    </div>
  );
}

const PROGRESS_H: Record<string, number> = { xs: 3, sm: 5, md: 8, lg: 12, xl: 16 };
function Progress({ node, p }: NodeProps) {
  const v = Math.max(0, Math.min(100, Number(p.value ?? 0) || 0));
  const h = typeof p.size === 'number' ? p.size : (PROGRESS_H[str(p.size, 'md')] ?? 8);
  const c = color(p.color) ?? INK;
  const root = useRoot(node, p, { className: 'jbox', style: { width: '100%', height: h + 4, background: SUBTLE, borderRadius: 999, overflow: 'hidden' } });
  return (
    <div {...root} role="progressbar" aria-valuenow={v} data-soft="">
      <Rough seedKey={node.id} stroke={SOFT} strokeWidth={1} />
      <div style={{ width: `${v}%`, height: '100%', background: c, backgroundImage: p.striped ? 'repeating-linear-gradient(45deg, rgba(255,255,255,.25) 0 6px, transparent 6px 12px)' : undefined }} />
    </div>
  );
}

function RingProgress({ node, p }: NodeProps) {
  const size = typeof p.size === 'number' ? p.size : 120;
  const th = typeof p.thickness === 'number' ? p.thickness : size / 10;
  const rr = (size - th) / 2;
  const L = 2 * Math.PI * rr;
  let acc = 0;
  const sections = arr(p.sections).filter((s): s is Record<string, unknown> => !!s && typeof s === 'object');
  const root = useRoot(node, p, { style: { position: 'relative', width: size, height: size, flexShrink: 0 } });
  return (
    <div {...root} role="img">
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={rr} fill="none" style={{ stroke: LINE }} strokeWidth={th} />
        {sections.map((s, i) => {
          const v = Math.max(0, Math.min(100, Number(s.value) || 0));
          const el = <circle key={i} cx={size / 2} cy={size / 2} r={rr} fill="none" stroke={color(s.color) ?? INK} strokeWidth={th} strokeDasharray={`${(L * v) / 100} ${L}`} strokeDashoffset={(-L * acc) / 100} />;
          acc += v;
          return el;
        })}
      </svg>
      {p.label !== undefined ? <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600 }}>{str(p.label)}</span> : null}
    </div>
  );
}

function Skeleton({ node, p, children }: NodeProps) {
  const r = useR(p);
  const h = dim(r('height') ?? r('h')) ?? (p.circle ? '40px' : '16px');
  const root = useRoot(node, p, { style: { width: p.circle ? h : (dim(r('width') ?? r('w')) ?? '100%'), height: h, borderRadius: p.circle ? 999 : (radius(p.radius) ?? '4px'), background: LINE } });
  if (p.visible === false) return <>{children}</>;
  return <div {...root} aria-hidden />;
}

// ============ Modal / Drawer ============

const OVERLAY_SIZE: Record<string, number> = { xs: 320, sm: 380, md: 440, lg: 620, xl: 780 };
function sizeOf(v: unknown, d: number): string {
  if (typeof v === 'number') return `${v}px`;
  if (typeof v === 'string' && v) return v in OVERLAY_SIZE ? `${OVERLAY_SIZE[v]}px` : v;
  return `${d}px`;
}

/** Modal / Drawer：渲染到舞台内的弹窗层（不 portal 到 body），带遮罩。门控（opened）已由 isSelfVisible 判断。 */
function Overlay({ node, p, children }: NodeProps) {
  const { t: i18n } = useI18n();

  const { dialogLayer, animate } = useCtx();
  const drawer = node.type === 'Drawer';
  const position = str(p.position, 'left');
  const full = p.fullScreen === true;
  const horizontal = drawer && (position === 'left' || position === 'right');
  const title = p.title !== undefined ? str(p.title) : '';
  const panelStyle: CSSProperties = drawer
    ? horizontal
      ? { height: '100%', width: sizeOf(p.size, 440), maxWidth: '90%' }
      : { width: '100%', height: sizeOf(p.size, 320), maxHeight: '90%' }
    : full
      ? { width: '100%', height: '100%' }
      : { width: sizeOf(p.size, 440), maxWidth: '92%', maxHeight: '90%', ...(p.centered ? {} : { marginTop: '6%' }) };
  const root = useRoot(node, p, {
    className: cn('jbox relative z-10 flex flex-col bg-[var(--jp-surface)] shadow-[var(--jp-shadow)] [.jstage[data-stroke=clean]_&]:shadow-xl', !drawer && !full && '[.jstage[data-stroke=clean]_&]:rounded-lg'),
    style: { ...panelStyle, overflow: 'auto' },
  });
  if (!dialogLayer) return null;
  const align: CSSProperties = drawer
    ? { alignItems: position === 'bottom' ? 'flex-end' : 'flex-start', justifyContent: position === 'right' ? 'flex-end' : 'flex-start', flexDirection: horizontal ? 'row' : 'column' }
    : { alignItems: p.centered || full ? 'center' : 'flex-start', justifyContent: 'center' };
  const initial = drawer ? { opacity: 0, x: position === 'left' ? -40 : position === 'right' ? 40 : 0, y: position === 'top' ? -40 : position === 'bottom' ? 40 : 0 } : { opacity: 0, y: 12, scale: 0.98 };
  return createPortal(
    <div className="absolute inset-0 z-20 flex" style={align} data-joverlay-root={node.id}>
      {p.withOverlay === false ? null : (
        <motion.div data-jbackdrop="" className="absolute inset-0 bg-[rgba(30,30,30,0.38)]" initial={animate ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.18 }} />
      )}
      <motion.div {...root} role="dialog" aria-modal="true" aria-label={title || i18n.stage.modal} initial={animate ? initial : false} animate={{ opacity: 1, x: 0, y: 0, scale: 1 }} transition={{ duration: 0.22 }}>
        <Rough seedKey={node.id} strokeWidth={1.8} />
        {title || p.withCloseButton !== false ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px 8px' }}>
            <div style={{ flex: 1, fontSize: 19, fontWeight: 700, lineHeight: 1.35 }}>{title}</div>
            {p.withCloseButton === false ? null : (
              <span aria-hidden style={{ color: DIMMED, fontSize: 20, lineHeight: 1 }}>
                ×
              </span>
            )}
          </div>
        ) : null}
        <div style={{ padding: '8px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
      </motion.div>
    </div>,
    dialogLayer,
  );
}

// ============ 按钮 ============

const BTN_H: Record<string, number> = { xs: 30, sm: 36, md: 40, lg: 48, xl: 56, 'compact-xs': 22, 'compact-sm': 26, 'compact-md': 30, 'compact-lg': 34, 'compact-xl': 40 };

function buttonTone(variant: string, c: string | undefined) {
  const base = c ?? INK;
  switch (variant) {
    case 'light':
      return { stroke: light(base), fill: light(base), text: base };
    case 'outline':
      return { stroke: base, text: base };
    case 'subtle':
    case 'transparent':
      return { stroke: 'transparent', text: base };
    case 'white':
      return { stroke: LINE, fill: SURFACE, text: base };
    case 'default':
      return { stroke: LINE_STRONG, fill: SURFACE, text: INK };
    default:
      return { stroke: base, fill: base, text: onFill(base) };
  }
}

function Button({ node, p, disabled, children }: NodeProps) {
  const mode = useStroke();
  const variant = str(p.variant, 'filled');
  const t = buttonTone(variant, color(p.color));
  const h = BTN_H[str(p.size, 'md')] ?? 40;
  const loading = p.loading === true;
  const stroke = disabled ? SOFT : t.stroke;
  const fill = disabled ? (t.fill && t.fill !== SURFACE ? LINE_STRONG : undefined) : t.fill;
  const text = disabled ? (t.fill && t.fill !== SURFACE ? INK2 : DIMMED) : t.text;
  const root = useRoot(node, p, {
    disabled,
    className: cn('jbox', mode === 'clean' && 'rounded-md', disabled && 'cursor-not-allowed'),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: h,
      padding: `0 ${Math.round(h * 0.45)}px`,
      fontSize: h <= 30 ? 13 : 15,
      fontWeight: 600,
      color: text,
      maxWidth: '100%',
      width: p.fullWidth ? '100%' : undefined,
      flexShrink: 0,
      ...(mode === 'clean' ? { ...boxStyle(stroke, fill), ...(disabled ? { borderStyle: 'dashed' } : {}) } : {}),
    },
  });
  return (
    <button {...root} type="button" data-dashed={disabled ? '' : undefined}>
      {variant === 'subtle' || variant === 'transparent' ? null : <Rough seedKey={node.id} stroke={stroke} fill={fill} fillStyle={fill ? 'solid' : undefined} dashed={disabled} strokeWidth={1.4} />}
      {loading ? <Spinner size={16} c={text} /> : null}
      {p.leftSection !== undefined ? <span aria-hidden>{str(p.leftSection)}</span> : null}
      <span className="jtrunc" data-jtext="">
        {children}
      </span>
      {p.rightSection !== undefined ? <span aria-hidden>{str(p.rightSection)}</span> : null}
    </button>
  );
}

const ICON_SIZE: Record<string, number> = { xs: 18, sm: 22, md: 28, lg: 34, xl: 44 };
function ActionIcon({ node, p, disabled, children }: NodeProps) {
  const mode = useStroke();
  const t = buttonTone(str(p.variant, 'filled'), color(p.color));
  const size = typeof p.size === 'number' ? p.size : (ICON_SIZE[str(p.size, 'md')] ?? 28);
  const round = p.radius === 'xl' || p.radius === 999;
  const fill = disabled ? LINE_STRONG : t.fill;
  const root = useRoot(node, p, {
    disabled,
    className: cn('jbox', disabled && 'cursor-not-allowed'),
    style: { width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: disabled ? INK2 : t.text, fontSize: size * 0.5, fontWeight: 700, borderRadius: round ? 999 : (radius(p.radius) ?? 6), ...(mode === 'clean' ? boxStyle(disabled ? SOFT : t.stroke, fill) : {}) },
  });
  return (
    <button {...root} type="button" aria-label={str(p['aria-label'], nodeLabel(node))}>
      <Rough seedKey={node.id} shape={round ? 'ellipse' : 'rect'} stroke={disabled ? SOFT : t.stroke} fill={fill} fillStyle={fill ? 'solid' : undefined} strokeWidth={1.3} inset={1} />
      <span data-jtext="">{children}</span>
    </button>
  );
}

function CloseButton({ node, p, disabled }: NodeProps) {
  const { t: i18n } = useI18n();

  const root = useRoot(node, p, { disabled, style: { width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: DIMMED, fontSize: 20, lineHeight: 1, flexShrink: 0 } });
  return (
    <button {...root} type="button" aria-label={str(p['aria-label'], i18n.stage.close)}>
      ×
    </button>
  );
}

function NavLink({ node, p, disabled, children }: NodeProps) {
  const { scene } = useCtx();
  const active = p.active === true || (p.active === undefined && typeof p.href === 'string' && p.href === scene.route);
  const c = color(p.color) ?? INK;
  const opened = p.opened === true || p.defaultOpened === true;
  const root = useRoot(node, p, { disabled, style: { display: 'flex', flexDirection: 'column' } });
  return (
    <div {...root} aria-current={active ? 'page' : undefined}>
      <a
        role="link"
        tabIndex={0}
        className={cn('jbox flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-[15px] [.jstage[data-stroke=clean]_&]:rounded-md', !active && 'hover:bg-black/[0.03]')}
        style={{ background: active ? light(c === INK ? INK2 : c) : undefined, fontWeight: active ? 650 : 400, color: disabled ? DIMMED : active && c !== INK ? c : undefined }}
        data-noborder={active ? undefined : ''}
        data-soft=""
        data-jcontrol={node.id}
      >
        {active ? <Rough seedKey={node.id} stroke={SOFT} fill={LINE} fillStyle="solid" strokeWidth={1} /> : null}
        {p.leftSection !== undefined ? <span aria-hidden>{str(p.leftSection)}</span> : null}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="jtrunc" data-jtext="">
            {str(p.label) || null}
          </span>
          {p.description !== undefined ? <span style={{ fontSize: 12, color: DIMMED }}>{str(p.description)}</span> : null}
        </span>
        {p.rightSection !== undefined ? <span aria-hidden>{str(p.rightSection)}</span> : (node.children ?? []).length ? <span aria-hidden style={{ color: DIMMED }}>{opened ? '▾' : '▸'}</span> : null}
      </a>
      {opened && (node.children ?? []).length ? <div style={{ paddingLeft: 16 }}>{children}</div> : null}
    </div>
  );
}

// ============ 输入 ============

/** Mantine 输入组件的外壳：label（withAsterisk）/ description / 控件 / error。根节点包含全部，控件带 data-jcontrol。 */
function Field({ node, p, disabled, control, inline = false }: { node: SceneNode; p: Record<string, unknown>; disabled: boolean; control: ReactNode; inline?: boolean }) {
  const root = useRoot(node, p, { disabled, style: inline ? { display: 'flex', alignItems: 'flex-start', gap: 10 } : { display: 'flex', flexDirection: 'column', gap: 4, width: '100%' } });
  const label = p.label !== undefined && p.label !== '' ? str(p.label) : '';
  const desc = p.description !== undefined ? str(p.description) : '';
  const error = typeof p.error === 'string' && p.error ? p.error : '';
  const star = p.withAsterisk === true || p.required === true;
  const head = label ? (
    <span style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.4 }}>
      {label}
      {star ? <span style={{ color: DANGER }}> *</span> : null}
    </span>
  ) : null;
  if (inline)
    return (
      <div {...root}>
        {control}
        {label || desc ? (
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            {head}
            {desc ? <span style={{ fontSize: 12, color: DIMMED }}>{desc}</span> : null}
          </span>
        ) : null}
      </div>
    );
  return (
    <div {...root}>
      {head}
      {desc ? <span style={{ fontSize: 12, color: DIMMED, marginTop: -2 }}>{desc}</span> : null}
      {control}
      {error ? <span style={{ fontSize: 12, color: DANGER }}>{error}</span> : null}
    </div>
  );
}

/** 输入框外观：手绘描边 / 线框边框；error 时描红。 */
function InputBox({ node, p, disabled, children, minH = 40, open }: { node: SceneNode; p: Record<string, unknown>; disabled: boolean; children: ReactNode; minH?: number; open?: boolean }) {
  const err = typeof p.error === 'string' && p.error !== '';
  return (
    <div
      className="jbox flex w-full items-center gap-2 px-3 [.jstage[data-stroke=clean]_&]:rounded-md"
      style={{ minHeight: minH, background: disabled ? SUBTLE : SURFACE, ...(err ? { borderColor: DANGER } : {}) }}
      data-jcontrol={node.id}
      role={open !== undefined ? 'combobox' : undefined}
      aria-expanded={open}
      tabIndex={0}
    >
      <Rough seedKey={node.id} stroke={err ? DANGER : disabled ? SOFT : INK} />
      {p.leftSection !== undefined ? <span aria-hidden style={{ color: DIMMED }}>{str(p.leftSection)}</span> : null}
      {children}
      {p.rightSection !== undefined ? <span aria-hidden style={{ color: DIMMED }}>{str(p.rightSection)}</span> : null}
    </div>
  );
}

const FIELD_CLASS = 'min-w-0 flex-1 cursor-[inherit] resize-none border-none bg-transparent p-0 text-[15px] text-inherit outline-none placeholder:text-[var(--jp-faint)]';

/** 只读的原生输入框：值来自状态，用户不能直接编辑（输入由步骤驱动）。 */
function NativeInput({ label, value, placeholder, mask = false }: { label: string; value: unknown; placeholder: unknown; mask?: boolean }) {
  return <input readOnly tabIndex={-1} aria-label={label} type={mask ? 'password' : 'text'} value={str(value)} placeholder={str(placeholder)} className={cn(FIELD_CLASS, 'h-9')} style={{ font: 'inherit', fontSize: 15 }} />;
}

function TextInput({ node, p, disabled }: NodeProps) {
  const v = useInputValue(node, p);
  const mask = node.type === 'PasswordInput' || p.type === 'password';
  const prefix = p.prefix !== undefined ? str(p.prefix) : '';
  const suffix = p.suffix !== undefined ? str(p.suffix) : '';
  const has = v !== undefined && v !== null && v !== '';
  const value = has && (prefix || suffix) ? `${prefix}${str(v)}${suffix}` : v;
  return (
    <Field
      node={node}
      p={p}
      disabled={disabled}
      control={
        <InputBox node={node} p={p} disabled={disabled}>
          <NativeInput label={nodeLabel(node)} value={value} placeholder={p.placeholder} mask={mask} />
          {node.type === 'PasswordInput' ? <span aria-hidden style={{ color: DIMMED, fontSize: 13 }}>👁</span> : null}
          {node.type === 'NumberInput' ? <span aria-hidden style={{ color: DIMMED, fontSize: 10, lineHeight: 1 }}>▴<br />▾</span> : null}
          {node.type === 'FileInput' && !has ? <span aria-hidden style={{ color: DIMMED, fontSize: 13 }}>📎</span> : null}
        </InputBox>
      }
    />
  );
}

function Textarea({ node, p, disabled }: NodeProps) {
  const v = useInputValue(node, p);
  const rows = typeof p.minRows === 'number' ? p.minRows : typeof p.rows === 'number' ? p.rows : 3;
  return (
    <Field
      node={node}
      p={p}
      disabled={disabled}
      control={
        <InputBox node={node} p={p} disabled={disabled} minH={rows * 22 + 16}>
          <textarea readOnly tabIndex={-1} aria-label={nodeLabel(node)} value={str(v)} placeholder={str(p.placeholder)} rows={rows} className={cn(FIELD_CLASS, 'self-stretch py-2')} style={{ font: 'inherit', fontSize: 15, lineHeight: '22px' }} />
        </InputBox>
      }
    />
  );
}

/** Select / MultiSelect：选项来自 data；显示 inputs[id]；选择动画期间展开下拉。 */
function Select({ node, p, disabled }: NodeProps) {
  const { t: i18n } = useI18n();

  const { state, preview } = useCtx();
  const v = useInputValue(node, p);
  const choices = choicesOf(node, state) ?? [];
  const multi = node.type === 'MultiSelect';
  const values = multi ? (Array.isArray(v) ? v.map(String) : []) : v !== undefined && v !== null && v !== '' ? [str(v)] : [];
  const labelOf = (x: string) => choices.find((c) => c.value === x)?.label ?? x;
  const pv = preview && preview.nodeId === node.id ? preview.text : null;
  const open = pv !== null;
  const previewChoice = pv !== null ? (choices.find((c) => c.value === pv || c.label === pv)?.value ?? null) : null;
  return (
    <Field
      node={node}
      p={p}
      disabled={disabled}
      control={
        <div className="relative w-full">
          <InputBox node={node} p={p} disabled={disabled} open={open}>
            {multi && values.length ? (
              <span className="flex min-w-0 flex-1 flex-wrap gap-1 py-1.5">
                {values.map((x) => (
                  <span key={x} style={{ background: SUBTLE, borderRadius: 4, padding: '0 6px', fontSize: 13 }}>
                    {labelOf(x)} ×
                  </span>
                ))}
              </span>
            ) : (
              <span className={cn('jtrunc min-w-0 flex-1', values.length ? '' : 'text-[var(--jp-faint)]')} data-jtext="">
                {values.length ? labelOf(values[0]!) : str(p.placeholder, i18n.stage.selectAnOption)}
              </span>
            )}
            <span aria-hidden style={{ color: DIMMED }}>
              ▾
            </span>
          </InputBox>
          {open && choices.length ? (
            <div className="jbox absolute inset-x-0 top-[calc(100%+4px)] z-30 flex flex-col bg-[var(--jp-surface)] py-1 shadow-[var(--jp-shadow)] [.jstage[data-stroke=clean]_&]:rounded-md" role="listbox" data-jdropdown="">
              <Rough seedKey={`${node.id}:list`} stroke={INK2} strokeWidth={1.1} />
              {choices.map((c) => {
                const on = c.value === previewChoice || values.includes(c.value);
                return (
                  <div key={c.value} role="option" aria-selected={on} className={cn('px-3 py-1.5 text-[15px]', on && 'bg-[var(--jp-subtle)] font-semibold')}>
                    {multi && values.includes(c.value) ? '✓ ' : ''}
                    {c.label}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      }
    />
  );
}

function SegmentedControl({ node, p, disabled }: NodeProps) {
  const { state, preview } = useCtx();
  const v = useInputValue(node, p);
  const choices = choicesOf(node, state) ?? [];
  const pv = preview && preview.nodeId === node.id ? preview.text : null;
  const cur = pv !== null ? (choices.find((c) => c.value === pv || c.label === pv)?.value ?? null) : v !== undefined && v !== null && v !== '' ? str(v) : (choices[0]?.value ?? null);
  const root = useRoot(node, p, {
    disabled,
    className: 'jbox [.jstage[data-stroke=clean]_&]:rounded-md',
    style: { display: p.fullWidth ? 'flex' : 'inline-flex', width: p.fullWidth ? '100%' : 'fit-content', padding: 4, gap: 2, background: SUBTLE },
  });
  return (
    <div {...root} role="radiogroup" data-soft="" data-jcontrol={node.id}>
      <Rough seedKey={node.id} stroke={SOFT} strokeWidth={1} />
      {choices.map((c) => {
        const on = c.value === cur;
        return (
          <span key={c.value} role="radio" aria-checked={on} className={cn('relative px-3 py-1 text-[14px] [.jstage[data-stroke=clean]_&]:rounded', on ? 'bg-[var(--jp-surface)] font-semibold shadow-sm' : 'text-[var(--jp-muted)]')} style={{ flex: p.fullWidth ? 1 : undefined, textAlign: 'center' }}>
            {on ? <Rough seedKey={`${node.id}:${c.value}`} stroke={INK} strokeWidth={1.1} /> : null}
            <span className="relative">{c.label}</span>
          </span>
        );
      })}
    </div>
  );
}

function Checkbox({ node, p, disabled }: NodeProps) {
  const checked = useInputValue(node, p) === true;
  return (
    <Field
      node={node}
      p={p}
      disabled={disabled}
      inline
      control={
        <span className="jbox inline-flex shrink-0 items-center justify-center rounded-[3px]" style={{ width: 20, height: 20, marginTop: 1, background: checked ? INK : SURFACE, color: BG, fontSize: 13, lineHeight: 1 }} data-jcontrol={node.id} role="checkbox" aria-checked={checked} tabIndex={0}>
          <Rough seedKey={node.id} inset={1} stroke={disabled ? SOFT : INK} fill={checked ? INK : undefined} fillStyle="solid" />
          {checked ? <span>✓</span> : null}
        </span>
      }
    />
  );
}

function Switch({ node, p, disabled }: NodeProps) {
  const on = useInputValue(node, p) === true;
  const c = color(p.color) ?? INK;
  return (
    <Field
      node={node}
      p={p}
      disabled={disabled}
      inline
      control={
        <span className="relative inline-flex shrink-0 items-center rounded-full" style={{ width: 38, height: 22, background: on ? c : LINE, transition: 'background .2s', marginTop: 1 }} data-jcontrol={node.id} role="switch" aria-checked={on} tabIndex={0}>
          <span style={{ position: 'absolute', left: on ? 18 : 2, width: 18, height: 18, borderRadius: 9, background: SURFACE, boxShadow: '0 1px 2px rgba(0,0,0,.25)', transition: 'left .2s' }} />
        </span>
      }
    />
  );
}

function RadioGroup({ node, p, disabled, children }: NodeProps) {
  const v = useInputValue(node, p);
  const label = p.label !== undefined ? str(p.label) : '';
  const root = useRoot(node, p, { disabled, style: { display: 'flex', flexDirection: 'column', gap: 8 } });
  return (
    <ValueContext.Provider value={{ owner: node.id, value: v === undefined || v === null ? null : str(v), disabled }}>
      <div {...root} role="radiogroup">
        {label ? <span style={{ fontSize: 14, fontWeight: 500 }}>{label}</span> : null}
        {p.description !== undefined ? <span style={{ fontSize: 12, color: DIMMED, marginTop: -4 }}>{str(p.description)}</span> : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-jcontrol={node.id}>
          {children}
        </div>
      </div>
    </ValueContext.Provider>
  );
}
function Radio({ node, p }: NodeProps) {
  const ctx = useContext(ValueContext);
  const on = ctx ? ctx.value !== null && ctx.value === str(p.value) : p.checked === true;
  const root = useRoot(node, p, { style: { display: 'inline-flex', alignItems: 'center', gap: 8 } });
  return (
    <span {...root} role="radio" aria-checked={on}>
      <span className="jbox inline-flex shrink-0 items-center justify-center rounded-full" style={{ width: 20, height: 20 }}>
        <Rough seedKey={node.id} shape="ellipse" inset={1} />
        {on ? <span style={{ width: 9, height: 9, borderRadius: 5, background: INK }} /> : null}
      </span>
      {p.label !== undefined ? <span style={{ fontSize: 14 }}>{str(p.label)}</span> : null}
    </span>
  );
}

// ============ Tabs / Breadcrumbs / Pagination / Stepper ============

function Tabs({ node, p, disabled, children }: NodeProps) {
  const { state } = useCtx();
  const v = useInputValue(node, p);
  const first = choicesOf(node, state)?.[0]?.value ?? null;
  const value = v !== undefined && v !== null && v !== '' ? str(v) : first;
  const root = useRoot(node, p, { disabled, style: { display: 'flex', flexDirection: 'column', gap: 12 } });
  return (
    <ValueContext.Provider value={{ owner: node.id, value, disabled }}>
      <div {...root}>{children}</div>
    </ValueContext.Provider>
  );
}
function TabsList({ node, p, children }: NodeProps) {
  const root = useRoot(node, p, { className: p.grow ? 'jgrow' : undefined, style: { display: 'flex', gap: 2, borderBottom: `2px solid ${LINE}`, justifyContent: p.grow ? 'stretch' : flexVal(p.justify, 'flex-start') } });
  return (
    <div {...root} role="tablist">
      {children}
    </div>
  );
}
function TabsTab({ node, p, disabled, children }: NodeProps) {
  const ctx = useContext(ValueContext);
  const dis = disabled || !!ctx?.disabled;
  const active = ctx?.value !== null && ctx?.value === str(p.value);
  const root = useRoot(node, p, { disabled: dis, style: { position: 'relative', padding: '8px 14px', marginBottom: -2, fontSize: 14, borderBottom: `2px solid ${active ? INK : 'transparent'}`, fontWeight: active ? 650 : 400, color: dis ? SOFT : active ? INK : DIMMED, display: 'inline-flex', gap: 6, alignItems: 'center' } });
  return (
    <button {...root} type="button" role="tab" aria-selected={active}>
      {p.leftSection !== undefined ? <span aria-hidden>{str(p.leftSection)}</span> : null}
      <span className="jtrunc" data-jtext="">
        {children}
      </span>
    </button>
  );
}
function TabsPanel({ node, p, children }: NodeProps) {
  const ctx = useContext(ValueContext);
  const root = useRoot(node, p, { style: { display: 'flex', flexDirection: 'column', gap: 12 } });
  if (ctx && ctx.value !== str(p.value)) return null;
  return (
    <div {...root} role="tabpanel">
      {children}
    </div>
  );
}

function Breadcrumbs({ node, p, children }: NodeProps) {
  const { t: i18n } = useI18n();

  const sep = p.separator !== undefined ? str(p.separator) : '/';
  const items = (Array.isArray(children) ? children : [children]).filter(Boolean);
  const root = useRoot(node, p, { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 14 } });
  return (
    <nav {...root} aria-label={i18n.stage.breadcrumbs}>
      {items.map((c, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {i > 0 ? (
            <span aria-hidden style={{ color: DIMMED }}>
              {sep}
            </span>
          ) : null}
          {c}
        </span>
      ))}
    </nav>
  );
}

function Pagination({ node, p, disabled }: NodeProps) {
  const total = Math.max(1, Number(p.total ?? 1) || 1);
  const v = Number(useInputValue(node, p) ?? 1) || 1;
  const pages: (number | '…')[] = [];
  for (let i = 1; i <= total; i++) if (i === 1 || i === total || Math.abs(i - v) <= 1) pages.push(i);
    else if (pages[pages.length - 1] !== '…') pages.push('…');
  const cell = (label: string, on = false, key?: string | number) => (
    <span key={key ?? label} className="jbox inline-flex items-center justify-center [.jstage[data-stroke=clean]_&]:rounded" style={{ minWidth: 32, height: 32, padding: '0 6px', fontSize: 14, background: on ? INK : SURFACE, color: on ? BG : INK }} data-soft={on ? undefined : ''}>
      <Rough seedKey={`${node.id}:${key ?? label}`} stroke={on ? INK : SOFT} fill={on ? INK : undefined} fillStyle="solid" strokeWidth={1} />
      <span>{label}</span>
    </span>
  );
  const root = useRoot(node, p, { disabled, style: { display: 'inline-flex', gap: 6, alignItems: 'center' } });
  return (
    <div {...root} role="navigation" data-jcontrol={node.id}>
      {cell('‹', false, 'prev')}
      {pages.map((x, i) => (x === '…' ? <span key={`e${i}`}>…</span> : cell(String(x), x === v, x)))}
      {cell('›', false, 'next')}
    </div>
  );
}

function Stepper({ node, p, children }: NodeProps) {
  const { state } = useCtx();
  const active = Number(resolveValue(p.active, state) ?? 0);
  const ids = (node.children ?? []).filter((c) => c.type === 'Stepper.Step').map((c) => c.id);
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const root = useRoot(node, p, { style: { display: 'flex', flexDirection: 'column', gap: 16 } });
  return (
    <SequenceContext.Provider value={{ ids, active: Number.isFinite(active) ? active : 0, content }}>
      <div {...root}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>{children}</div>
        <div ref={setContent} />
      </div>
    </SequenceContext.Provider>
  );
}
function StepperStep({ node, p, children }: NodeProps) {
  const seq = useContext(SequenceContext);
  const i = seq ? seq.ids.indexOf(node.id) : 0;
  const done = !!seq && i < seq.active;
  const cur = !!seq && i === seq.active;
  const last = !!seq && i === seq.ids.length - 1;
  const root = useRoot(node, p, { style: { display: 'flex', alignItems: 'flex-start', gap: 8, flex: last ? '0 0 auto' : '1 1 0', minWidth: 0 } });
  return (
    <div {...root} data-active={cur ? '' : undefined}>
      <span aria-hidden className="jbox inline-flex shrink-0 items-center justify-center rounded-full" style={{ width: 30, height: 30, background: done ? INK : SURFACE, color: done ? BG : INK, fontSize: 13, fontWeight: 700, borderColor: cur || done ? INK : LINE_STRONG }}>
        <Rough seedKey={node.id} shape="ellipse" stroke={cur || done ? INK : SOFT} fill={done ? INK : undefined} fillStyle="solid" inset={1} />
        <span>{done ? '✓' : i + 1}</span>
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {p.label !== undefined ? <span style={{ fontWeight: cur ? 700 : 500, fontSize: 14 }}>{str(p.label)}</span> : null}
        {p.description !== undefined ? <span style={{ fontSize: 12, color: DIMMED }}>{str(p.description)}</span> : null}
      </span>
      {last ? null : <span aria-hidden style={{ flex: 1, height: 2, background: done ? INK : LINE, marginTop: 14, minWidth: 12 }} />}
      {cur && seq?.content ? createPortal(<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>, seq.content) : null}
    </div>
  );
}

// ============ AI 交互 ============

function ChatMessage({ node, p, children }: NodeProps) {
  const user = p.from === 'user';
  const root = useRoot(node, p, { style: { display: 'flex', width: '100%', justifyContent: user ? 'flex-end' : 'flex-start' } });
  return (
    <div {...root} data-from={user ? 'user' : 'assistant'}>
      <div
        className={cn('flex max-w-[82%] flex-col gap-2', user && 'jbox px-4 py-2.5 [.jstage[data-stroke=clean]_&]:rounded-lg')}
        style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, ...(user ? { background: SUBTLE } : { width: '100%' }) }}
        data-soft=""
      >
        {user ? <Rough seedKey={node.id} stroke={SOFT} fill={SUBTLE} fillStyle="solid" /> : null}
        {p.name !== undefined ? <span style={{ fontSize: 12, color: DIMMED }}>{str(p.name)}</span> : null}
        {children}
      </div>
    </div>
  );
}

const TOOL_STATE = (i18n: Dictionary = en): Record<string, { text: string; c: string }> => ({
  running: { text: i18n.stage.running, c: INFO },
  done: { text: i18n.stage.done, c: OK },
  error: { text: i18n.stage.error, c: DANGER },
  'input-streaming': { text: i18n.stage.preparing, c: DIMMED },
  'input-available': { text: i18n.stage.running, c: INFO },
  'output-available': { text: i18n.stage.done, c: OK },
  'output-error': { text: i18n.stage.error, c: DANGER },
});
function ToolCall({ node, p, children }: NodeProps) {
  const { t: i18n } = useI18n();

  const s = TOOL_STATE(i18n)[str(p.state, 'done')] ?? TOOL_STATE(i18n).done!;
  const root = useRoot(node, p, { className: 'jbox [.jstage[data-stroke=clean]_&]:rounded-md', style: { display: 'flex', flexDirection: 'column', gap: 4, width: '100%', background: SUBTLE, padding: '8px 12px', fontFamily: MONO, fontSize: 13 } });
  return (
    <div {...root} data-soft="">
      <Rough seedKey={node.id} stroke={SOFT} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span className="jtrunc">⚙ {str(p.title, i18n.stage.toolCall)}</span>
        <span style={{ color: s.c, flexShrink: 0 }}>{s.text}</span>
      </div>
      <div style={{ whiteSpace: 'pre-wrap', color: INK2 }}>{children}</div>
    </div>
  );
}

/**
 * 思考过程（D56）：标题是此刻在想什么；active 时标题闪动、前面转圈；结束后显示“思考了 {duration}”。
 * opened 时展开子节点（过程），左侧一条细线。
 */
function Thinking({ node, p, children }: NodeProps) {
  const { t: i18n } = useI18n();
  const active = p.active === true;
  const opened = p.opened === true;
  const title = str(p.title);
  const duration = str(p.duration);
  const root = useRoot(node, p, { style: { display: 'flex', flexDirection: 'column', gap: 8, width: '100%', fontSize: 14, color: DIMMED } });
  return (
    <div {...root} data-active={active ? '' : undefined}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {active ? <Spinner size={14} c={DIMMED} /> : <span aria-hidden style={{ width: 14, textAlign: 'center', flexShrink: 0 }}>✦</span>}
        <span className={cn('jtrunc', active && 'jshimmer')} style={{ color: active ? undefined : INK2, fontWeight: 500 }}>
          {title || (active ? i18n.stage.thinkingActive : i18n.stage.thinking)}
        </span>
        {!active && duration ? <span style={{ flexShrink: 0, color: DIMMED }}>{i18n.stage.thoughtFor(duration)}</span> : null}
        {children ? <span aria-hidden style={{ flexShrink: 0, fontSize: 11 }}>{opened ? '▲' : '▼'}</span> : null}
      </div>
      {opened && children ? (
        <div style={{ marginLeft: 6, paddingLeft: 14, borderLeft: `2px solid ${LINE}`, display: 'flex', flexDirection: 'column', gap: 6, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{children}</div>
      ) : null}
    </div>
  );
}

/** 简单外部邮件：自身不可操作，正文里的按钮仍走普通步骤。 */
function Email({ node, p, children }: NodeProps) {
  const { t: i18n } = useI18n();
  const root = useRoot(node, p, { className: 'jbox', style: { background: SURFACE, padding: 16, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 } });
  const from = str(p.from, i18n.stage.sender);
  return <article {...root}>
    <Rough seedKey={node.id} />
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span aria-hidden style={{ width: 34, height: 34, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: '50%', background: SUBTLE, color: INK, fontWeight: 600 }}>{[...from.trim()][0] ?? '?'}</span>
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600 }}>{from}</div><div style={{ color: DIMMED, fontSize: 12 }}>{i18n.stage.recipient(str(p.to, i18n.stage.unspecified))}</div></div>
      {p.time ? <time style={{ color: DIMMED, fontSize: 12 }}>{str(p.time)}</time> : null}
    </div>
    <strong style={{ fontSize: 18 }}>{str(p.subject, i18n.stage.noSubject)}</strong>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{children}</div>
  </article>;
}

function DataCard({ node, p }: NodeProps) {
  const { t: i18n } = useI18n();
  const { changed = [] } = useCtx();
  const rows = dataRows(p.value, p.fields, node.props?.value, changed);
  const root = useRoot(node, p, { className: 'jbox', style: { background: SURFACE, padding: 20, minWidth: 0, width: '100%' } });
  return <section {...root}>
    <Rough seedKey={node.id} />
    <div style={{ fontWeight: 600, fontSize: 20, marginBottom: 14 }}>{str(p.title, i18n.stage.dataRecords)}</div>
    {rows.length ? <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>{rows.map((row, i) => <div key={`${row.key}:${i}`} data-changed={row.change ? '' : undefined} style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 12, padding: '10px 12px', background: row.change ? 'color-mix(in srgb, var(--jp-accent) 15%, var(--jp-surface))' : undefined, borderLeft: row.change ? `3px solid ${ACCENT}` : '3px solid transparent' }}>
      <dt style={{ color: DIMMED, minWidth: 80 }}>{row.label}</dt>
      <dd style={{ margin: 0, overflowWrap: 'anywhere', flex: 1 }}>{displayData(row.value)}{row.change ? <div style={{ color: INK2, fontSize: 13, marginTop: 4 }}><span>{displayData(row.change.before)}</span> → <span>{displayData(row.change.after)}</span></div> : null}</dd>
    </div>)}</dl> : <div style={{ color: DIMMED }}>{i18n.stage.noData}</div>}
  </section>;
}

function StateFlow({ node, p }: NodeProps) {
  const { t: i18n } = useI18n();
  const { changed = [] } = useCtx();
  const items = stateFlowItems(p.value, p.states, p.labels);
  const change = changeFor(node.props?.value, changed);
  const label = (v: unknown) => items.find(item => item.value === v)?.label ?? displayData(v);
  const root = useRoot(node, p, { style: { display: 'flex', flexDirection: 'column', gap: 10 } });
  return <div {...root}>
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
      {items.map((item, i) => <li key={`${item.value}:${i}`} aria-current={item.state === 'current' ? 'step' : undefined} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {i ? <span aria-hidden style={{ color: DIMMED }}>→</span> : null}
        <span className="jbox" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', padding: '8px 14px', color: item.state === 'todo' ? DIMMED : INK, background: item.state === 'current' ? 'color-mix(in srgb, var(--jp-accent) 20%, var(--jp-surface))' : SURFACE, fontWeight: item.state === 'current' ? 600 : 400 }}>
          <Rough seedKey={`${node.id}:${i}`} stroke={item.state === 'current' ? ACCENT : item.state === 'done' ? OK : LINE} />
          {item.state === 'done' ? <span aria-label={i18n.stage.done} style={{ color: OK }}>✓</span> : null}{item.label}
        </span>
      </li>)}
    </ol>
    {change ? <div data-state-change="" style={{ color: INK2, fontSize: 14 }}>{i18n.stage.stateChange(label(change.before), label(change.after))}</div> : null}
    {!items.length ? <span style={{ color: DIMMED }}>{i18n.stage.noStates}</span> : null}
  </div>;
}

const ARTIFACT_ICON: Record<string, string> = { doc: '▤', code: '</>', sheet: '▦', web: '◎', image: '▣' };
const ARTIFACT_KIND = (i18n: Dictionary): Record<string, string> => ({ doc: i18n.stage.document, code: i18n.stage.code, sheet: i18n.stage.sheet, web: i18n.stage.webPage, image: i18n.stage.image });
function ArtifactStatus({ status }: { status: string }) {
  const { t: i18n } = useI18n();
  if (status === 'generating')
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: INFO, flexShrink: 0, fontSize: 13 }}>
        <Spinner size={13} c={INFO} />
        {i18n.stage.generating}
      </span>
    );
  if (status === 'error') return <span style={{ color: DANGER, flexShrink: 0, fontSize: 13 }}>{i18n.stage.generationFailed}</span>;
  return <span style={{ color: OK, flexShrink: 0, fontSize: 13 }}>{i18n.stage.generated}</span>;
}

/** Agent 的侧边产物（D56）：标题栏（类型图标、标题、版本、状态）+ 内容区；默认占满所在容器的高度。 */
function Artifact({ node, p, children }: NodeProps) {
  const { t: i18n } = useI18n();
  const mode = useStroke();
  const kind = str(p.kind, 'doc');
  const root = useRoot(node, p, { className: cn('jbox', mode === 'clean' && 'rounded-xl'), style: { display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: 0, background: SURFACE, overflow: 'hidden' } });
  return (
    <div {...root} data-kind={kind}>
      <Rough seedKey={node.id} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${LINE}`, minWidth: 0 }}>
        <span aria-hidden style={{ fontFamily: MONO, fontSize: 13, color: INK2, flexShrink: 0 }}>{ARTIFACT_ICON[kind] ?? ARTIFACT_ICON.doc}</span>
        <span className="jtrunc" style={{ fontWeight: 600, color: INK }}>{str(p.title, i18n.stage.artifact)}</span>
        {p.version !== undefined ? <span style={{ flexShrink: 0, fontSize: 12, color: DIMMED, border: `1px solid ${LINE_STRONG}`, borderRadius: 999, padding: '0 7px', lineHeight: '18px' }}>{str(p.version)}</span> : null}
        <span style={{ flex: 1 }} />
        <ArtifactStatus status={str(p.status, 'ready')} />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

/** 对话里指向产物的卡片（可点击打开）。 */
function ArtifactRef({ node, p, disabled }: NodeProps) {
  const { t: i18n } = useI18n();
  const mode = useStroke();
  const kind = str(p.kind, 'doc');
  const root = useRoot(node, p, { disabled, className: cn('jbox', mode === 'clean' && 'rounded-lg'), style: { display: 'flex', alignItems: 'center', gap: 12, width: '100%', maxWidth: 360, padding: '10px 14px', background: SURFACE, textAlign: 'left' } });
  return (
    <button {...root} type="button" data-jcontrol={node.id}>
      <Rough seedKey={node.id} />
      <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, flexShrink: 0, borderRadius: 8, background: SUBTLE, fontFamily: MONO, fontSize: 13, color: INK2 }}>{ARTIFACT_ICON[kind] ?? ARTIFACT_ICON.doc}</span>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
        <span className="jtrunc" style={{ fontWeight: 600, color: INK }}>{str(p.title, i18n.stage.artifact)}</span>
        <span style={{ fontSize: 12, color: DIMMED }}>{i18n.stage.artifactSummary(ARTIFACT_KIND(i18n)[kind] ?? i18n.stage.document, p.status === 'generating')}</span>
      </span>
    </button>
  );
}

function PromptInput({ node, p, disabled }: NodeProps) {
  const { t: i18n } = useI18n();

  const v = useInputValue(node, p);
  const has = v !== undefined && v !== null && v !== '';
  const root = useRoot(node, p, { disabled, className: 'jbox [.jstage[data-stroke=clean]_&]:rounded-xl', style: { flex: 1, minWidth: 0, width: '100%', minHeight: 44, padding: '10px 14px', whiteSpace: 'pre-wrap', color: has ? INK : SOFT, background: SURFACE } });
  return (
    <div {...root} role="textbox" aria-readonly="true" tabIndex={0} data-jcontrol={node.id}>
      <Rough seedKey={node.id} />
      <span data-jtext="">{has ? str(v) : str(p.placeholder, i18n.stage.typeAMessage)}</span>
    </div>
  );
}

// ============ 设备外框：终端与手机 ============

const TERM_TONE: Record<string, string> = { plain: INK, ok: OK, warn: WARN, error: DANGER };
const TERM_MONO = '[.jstage[data-stroke=clean]_&]:font-mono';

/**
 * 终端（低保真线框，与其他组件同一风格）：圆角窗口，左上角是 title；里面每条命令、每段输出各是一个带边框的圆角块。
 * 内容超出 h / mah 时在窗口内部滚动。tone 只改输出文字的颜色。
 */
function Terminal({ node, p, children }: NodeProps) {
  // 像真实终端一样停在最新的输出（输入行可见）
  const body = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = body.current;
    if (el) el.scrollTop = el.scrollHeight;
  });
  const root = useRoot(node, p, {
    className: 'jbox [.jstage[data-stroke=clean]_&]:rounded-[18px]',
    style: { display: 'flex', flexDirection: 'column', gap: 10, width: '100%', minHeight: 0, background: SURFACE, padding: '12px 16px 16px' },
  });
  return (
    <div {...root}>
      <Rough seedKey={node.id} shape="roundrect" radius={18} strokeWidth={1.5} />
      <div className="jtrunc" style={{ flexShrink: 0, fontSize: 15 }}>
        {str(p.title, 'Terminal')}
      </div>
      <div ref={body} style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: 2 }} data-jterm-body="">
        {children}
      </div>
    </div>
  );
}

function TerminalCommand({ node, p, children }: NodeProps) {
  const root = useRoot(node, p, {
    className: cn('jbox [.jstage[data-stroke=clean]_&]:rounded-[10px]', TERM_MONO),
    style: { display: 'flex', gap: 8, padding: '10px 16px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: SURFACE, flexShrink: 0 },
  });
  return (
    <div {...root}>
      <Rough seedKey={node.id} shape="roundrect" radius={10} />
      <span aria-hidden style={{ flexShrink: 0 }}>{str(p.prompt, '$')}</span>
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  );
}

function TerminalOutput({ node, p, children }: NodeProps) {
  const tone = str(p.tone, 'plain');
  const root = useRoot(node, p, {
    className: cn('jbox [.jstage[data-stroke=clean]_&]:rounded-[14px]', TERM_MONO),
    style: { padding: '10px 16px', minHeight: 56, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.55, background: SURFACE, color: TERM_TONE[tone] ?? INK, flexShrink: 0 },
  });
  return (
    <div {...root} data-tone={tone in TERM_TONE ? tone : 'plain'}>
      <Rough seedKey={node.id} shape="roundrect" radius={14} />
      <div>{children}</div>
    </div>
  );
}

/** 终端里的输入行（值类型）：与命令块同样的圆角块，type 动作写入；没有值时显示 placeholder 与光标。 */
function TerminalInput({ node, p, disabled }: NodeProps) {
  const v = useInputValue(node, p);
  const has = v !== undefined && v !== null && v !== '';
  const root = useRoot(node, p, {
    disabled,
    className: cn('jbox [.jstage[data-stroke=clean]_&]:rounded-[10px]', TERM_MONO),
    style: { display: 'flex', gap: 8, alignItems: 'baseline', padding: '10px 16px', background: SURFACE, flexShrink: 0 },
  });
  return (
    <div {...root} data-soft="" data-dashed="">
      <Rough seedKey={node.id} shape="roundrect" radius={10} stroke={SOFT} dashed />
      <span aria-hidden style={{ flexShrink: 0 }}>{str(p.prompt, '$')}</span>
      <span role="textbox" aria-readonly="true" tabIndex={0} data-jcontrol={node.id} style={{ minWidth: 0, flex: 1, whiteSpace: 'pre-wrap', color: has ? INK : SOFT }}>
        <span data-jtext="">{has ? str(v) : str(p.placeholder)}</span>
        <span aria-hidden style={{ display: 'inline-block', width: 2, height: '1.1em', marginLeft: 2, verticalAlign: 'text-bottom', background: INK }} />
      </span>
    </div>
  );
}

/** 手机外框的几何尺寸：机身边框，以及屏幕内的安全区（顶部避开听筒与圆角、底部避开圆角与横条、左右避开圆角）。 */
export const PHONE_BEZEL = 12;
export const PHONE_SAFE = { top: 40, bottom: 26, x: 12 } as const;
const PHONE_RADIUS = 54;
const PHONE_BUTTONS: { side: 'left' | 'right'; top: number; h: number }[] = [
  { side: 'left', top: 118, h: 30 },
  { side: 'left', top: 176, h: 58 },
  { side: 'left', top: 246, h: 58 },
  { side: 'right', top: 196, h: 90 },
];

/** 外框占用的总尺寸（含侧键余量），内容区为 width × height。 */
export function phoneFrameSize(width: number, height: number) {
  return { width: width + (PHONE_BEZEL + PHONE_SAFE.x) * 2 + 8, height: height + PHONE_BEZEL * 2 + PHONE_SAFE.top + PHONE_SAFE.bottom };
}

/**
 * 手机外框（Phone 组件与舞台的自动外框共用）：大圆角机身、侧边按键、顶部听筒、底部横条，不显示任何文字。
 * children 放在屏幕安全区以内的内容区，内容区正好是 width × height（断点按 width 计算，不被圆角和听筒遮挡）；
 * scale 只做视觉缩放。主题取外层 ThemeContext（sketch 用手绘描边）。
 */
export function PhoneFrame({ width, height, scale = 1, children, seed = 'phone' }: { width: number; height: number; scale?: number; children: ReactNode; seed?: string }) {
  const mode = useStroke();
  const theme = useStageTheme();
  const font = useContext(ThemeContext).font;
  const sketch = mode === 'rough';
  const screenW = width + PHONE_SAFE.x * 2;
  const screenH = height + PHONE_SAFE.top + PHONE_SAFE.bottom;
  const W = screenW + PHONE_BEZEL * 2;
  const H = screenH + PHONE_BEZEL * 2;
  const ink = INK;
  const size = phoneFrameSize(width, height);
  return (
    // 舞台外的手机外框也跟随主题（.jtheme 在主题的作用范围里）
    <div className="jtheme" style={{ width: size.width * scale, height: size.height * scale, position: 'relative', flexShrink: 0, ...fontStyle(font) }} data-jphone-frame="" data-theme={theme} data-stroke={mode} data-font={font ?? undefined}>
      <div style={{ position: 'absolute', left: 4, top: 0, width: W, height: H, transform: scale === 1 ? undefined : `scale(${scale})`, transformOrigin: '0 0' }}>
        {PHONE_BUTTONS.map((b, i) => (
          <div
            key={i}
            aria-hidden
            data-jphone-button={b.side}
            style={{ position: 'absolute', top: b.top, height: b.h, width: 5, [b.side]: -5, background: sketch ? 'transparent' : ink, borderRadius: b.side === 'left' ? '3px 0 0 3px' : '0 3px 3px 0' }}
          >
            {sketch ? <Rough seedKey={`${seed}:btn${i}`} strokeWidth={1.4} inset={0.5} /> : null}
          </div>
        ))}
        <div style={{ position: 'absolute', inset: 0, borderRadius: PHONE_RADIUS, background: sketch ? SURFACE : ink, boxShadow: sketch ? 'none' : '0 18px 40px rgba(0,0,0,0.18)' }}>
          {sketch ? <Rough seedKey={`${seed}:body`} shape="roundrect" radius={PHONE_RADIUS} strokeWidth={2} roughness={0.8} inset={1.5} /> : null}
        </div>
        <div
          style={{ position: 'absolute', left: PHONE_BEZEL, top: PHONE_BEZEL, width: screenW, height: screenH, borderRadius: PHONE_RADIUS - PHONE_BEZEL, overflow: 'hidden', background: SURFACE, isolation: 'isolate' }}
          data-jphone-screen=""
        >
          {sketch ? null : <div aria-hidden style={{ position: 'absolute', top: 12, left: '50%', width: 96, height: 24, marginLeft: -48, borderRadius: 12, background: ink }} />}
          <div aria-hidden style={{ position: 'absolute', bottom: 9, left: '50%', width: 120, height: 4, marginLeft: -60, borderRadius: 2, background: sketch ? INK2 : LINE_STRONG }} />
          <div style={{ position: 'absolute', left: PHONE_SAFE.x, top: PHONE_SAFE.top, width, height, overflow: 'hidden' }} data-jphone-content-box="">
            {children}
          </div>
        </div>
        {sketch ? <div aria-hidden style={{ position: 'absolute', top: PHONE_BEZEL + 14, left: '50%', width: 64, height: 6, marginLeft: -32, borderRadius: 3, border: `1.5px solid ${INK2}` }} /> : null}
      </div>
    </div>
  );
}

/** Phone 组件：子节点放进手机屏幕，按手机宽度排版（响应式断点按这个宽度计算）；弹窗渲染在屏幕内。 */
function Phone({ node, p, children }: NodeProps) {
  const ctx = useCtx();
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const r = useR(p);
  const width = childWidth('Phone', ctx.width);
  const hv = Number(r('h'));
  const height = Number.isFinite(hv) && hv > 0 ? hv : VIEWPORT_SIZE.mobile.height;
  const sv = Number(r('scale'));
  const scale = Number.isFinite(sv) && sv > 0 ? sv : 1;
  const { h: _h, w: _w, ...rest } = p;
  const root = useRoot(node, rest, { style: { display: 'inline-block', flexShrink: 0 } });
  return (
    <div {...root}>
      <PhoneFrame width={width} height={height} scale={scale} seed={node.id}>
        <RenderContext.Provider value={{ ...ctx, width, dialogLayer: layer }}>
          <div style={{ position: 'absolute', inset: 0, overflow: 'auto' }} data-jphone-content="">
            {children}
          </div>
        </RenderContext.Provider>
        <div ref={setLayer} className="pointer-events-none absolute inset-0 z-20 [&>*]:pointer-events-auto" data-jlayer="dialog" />
      </PhoneFrame>
    </div>
  );
}

// ============ 架构图（D41） ============

type DiagramCtxValue = {
  layout: DLayout;
  origin: { x: number; y: number };
  width: number;
  height: number;
  mountedAt: number;
  key: string;
  focus: { nodes: Set<string>; edges: Set<string> } | null;
  /** 聚焦布局（T-director3）：镜头对准 2 个及以上节点时的小图；null = 全图。 */
  fl: FocusLayout | null;
  /** 挂载之后聚焦布局切换过（之后的切换都播放移动动画；首次显示、renderStep 直接到位）。 */
  switched: boolean;
};

/**
 * 逐段出现：架构图挂载之后才出现的元素（when 由假变真）播放出现动画；首次显示、回放、renderStep 静态截图都直接是最终状态。
 * 布局始终按全部元素计算（when 不参与），所以出现时已有元素不移动。
 */
function useAppear(d: DiagramCtxValue | null): boolean {
  const { animate } = useCtx();
  const [appear] = useState(() => !!d && animate && typeof performance !== 'undefined' && performance.now() - d.mountedAt > 300);
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

/** 节点外形（坐标系：盒子左上角 x,y，宽 w 高 h）。模块级常量，Rough 据此缓存。 */
const SHAPE: Record<string, (x: number, y: number, w: number, h: number) => string> = {
  rect: (x, y, w, h) => roundRectPath(x, y, w, h, 10),
  pill: (x, y, w, h) => roundRectPath(x, y, w, h, h / 2),
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
const shapeOf = (kind: string) => (kind === 'database' ? 'database' : kind === 'queue' ? 'queue' : kind === 'user' ? 'pill' : 'rect');

/** 每种 kind 一个低保真小图标（16×16，描边用 currentColor）。数据库与队列由外形表达，不画图标。 */
function KindIcon({ kind }: { kind: string }) {
  const common = { width: 18, height: 18, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, style: { flexShrink: 0 } };
  switch (kind) {
    case 'client':
      return <svg {...common}><rect x="2" y="3" width="12" height="8" rx="1" /><path d="M6 14h4M8 11v3" /></svg>;
    case 'model':
      return <svg {...common}><path d="M8 1.5l1.6 4.2 4.4.8-3.3 3 .9 4.5L8 11.8 4.4 14l.9-4.5-3.3-3 4.4-.8z" /></svg>;
    case 'storage':
      return <svg {...common}><path d="M2 5l1 9h10l1-9zM2 5h12M5 5V3h6v2" /></svg>;
    case 'external':
      return <svg {...common}><path d="M4.5 12.5h7a3 3 0 0 0 .3-6A4 4 0 0 0 4 6.3a3.1 3.1 0 0 0 .5 6.2z" /></svg>;
    case 'tool':
      return <svg {...common}><path d="M10.5 2.5a3 3 0 0 0-3.4 4L2.5 11.1l2.4 2.4 4.6-4.6a3 3 0 0 0 4-3.4l-1.9 1.9-1.6-.4-.4-1.6z" /></svg>;
    case 'user':
      return <svg {...common}><circle cx="8" cy="5" r="2.6" /><path d="M3 14a5 5 0 0 1 10 0" /></svg>;
    case 'database':
    case 'queue':
      return null;
    default: // service
      return <svg {...common}><rect x="2" y="2.5" width="12" height="4.5" rx="1" /><rect x="2" y="9" width="12" height="4.5" rx="1" /><path d="M4.5 4.75h.01M4.5 11.25h.01" /></svg>;
  }
}

/**
 * Diagram：自动布局（diagram-layout.ts，结构不变就不重新布局），整体缩放到放得下容器宽度与 h。
 * 子节点照常经 RenderNode 渲染（可见性、绑定由 core 计算），位置从 DiagramContext 取。
 */
function Diagram({ node, p, children }: NodeProps) {
  const { t: i18n } = useI18n();

  const r = useR(p);
  const structure = useMemo(() => diagramStructure(node), [node]);
  const key = structureKey(structure);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => layoutDiagram(structure), [key]);
  const ref = useRef<HTMLDivElement | null>(null);
  const [mountedAt] = useState(() => (typeof performance !== 'undefined' ? performance.now() : 0));
  const [avail, setAvail] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setAvail(el.clientWidth);
    const ro = new ResizeObserver(() => setAvail(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const hv = Number(r('h'));
  const H = Number.isFinite(hv) && hv > 0 ? hv : 420;
  const { h: _h, ...rest } = p;
  // 镜头聚焦时（T-director3）：连着焦点的连线与 active / ok / error 的连线突出，其余变淡
  const { focus } = useCtx();
  const focusKey = focus?.join(',') ?? '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dfocus = useMemo(() => diagramFocus(structure, focus, node.id), [key, focusKey, node.id]);
  // 聚焦布局：只由结构 + 聚焦集合决定（缓存）；只对准一个节点时保持全图
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fl = useMemo(() => {
    const m = focusMembers(structure, focus, node.id);
    return m ? focusLayout(structure, layout, m) : null;
  }, [key, focusKey, node.id, layout]);
  const flKey = fl?.key ?? '';
  const firstFl = useRef(flKey);
  const switchedRef = useRef(false);
  if (firstFl.current !== flKey) switchedRef.current = true;
  const { animate: anim } = useCtx();
  // 整图放进容器（T-director2）：不在图内部滚动 / 拖动；看细节用舞台统一的缩放平移，或由镜头推近
  const { scale } = diagramFit(layout, avail, H);
  const root = useRoot(node, rest, { style: { position: 'relative', width: '100%', height: H, overflow: 'hidden' } });
  const W = layout.width * scale;
  const HH = layout.height * scale;
  return (
    <div
      {...root}
      ref={(el) => {
        ref.current = el;
      }}
      data-direction={structure.direction}
      data-scale={String(scale)}
    >
      {layout.width === 0 ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: DIMMED, fontSize: 13 }}>{i18n.stage.thisDiagramHasNoNodesYet}</div>
      ) : (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <div
            data-jdiagram-canvas=""
            style={{
              position: 'absolute',
              left: Math.max(0, (avail - W) / 2),
              top: Math.max(0, (H - HH) / 2),
              width: layout.width,
              height: layout.height,
              transform: `scale(${scale})`,
              transformOrigin: '0 0',
            }}
          >
            {fl ? (
              // 小图背后的浅色底：把背景里变淡的全图隔开
              <motion.div
                key={fl.key}
                data-jfocus-backdrop=""
                style={{ position: 'absolute', left: fl.box.x - 18, top: fl.box.y - 18, width: fl.box.w + 36, height: fl.box.h + 36, borderRadius: 18, background: 'rgba(255,255,255,0.9)', boxShadow: '0 0 0 1px rgba(0,0,0,0.04)', zIndex: 3, pointerEvents: 'none' }}
                initial={anim && switchedRef.current ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
              />
            ) : null}
            <DiagramContext.Provider value={{ layout, origin: { x: 0, y: 0 }, width: layout.width, height: layout.height, mountedAt, key: node.id, focus: dfocus, fl, switched: switchedRef.current }}>{children}</DiagramContext.Provider>
          </div>
        </div>
      )}
    </div>
  );
}

function DiagramGroup({ node, p, children }: NodeProps) {
  const d = useContext(DiagramContext);
  const box = d?.layout.groups[node.id];
  const title = d?.layout.titles[node.id];
  const appear = useAppear(d);
  const root = useRoot(node, p, {
    className: 'jbox [.jstage[data-stroke=clean]_&]:rounded-[14px]',
    style: box
      ? { position: 'absolute', left: box.x - d!.origin.x, top: box.y - d!.origin.y, width: box.w, height: box.h, background: d!.fl ? 'transparent' : 'rgba(248,249,250,0.7)', ...(d!.fl ? { pointerEvents: 'none' as const } : {}) }
      : { display: 'none' },
  });
  if (!d || !box) return null;
  // 聚焦布局时分组留在原位作背景：边框与标题变淡、不参与交互（组内被聚焦的节点照常显示）
  const bgOpacity = d.fl ? 0.25 : 1;
  return (
    <motion.div {...root} data-soft="" data-dashed="" data-appear={appear ? '' : undefined} initial={appear ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
      <div style={{ position: 'absolute', inset: 0, opacity: bgOpacity, transition: 'opacity .4s' }}>
        <Rough seedKey={node.id} shape="roundrect" radius={14} stroke={DIMMED} dashed strokeWidth={1.2} />
      </div>
      {title ? (
        <div
          data-jgroup-title=""
          style={{ position: 'absolute', left: title.x - box.x, top: title.y - box.y, width: title.w, height: title.h, zIndex: d.fl ? 1 : 3, opacity: bgOpacity, transition: 'opacity .4s', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, background: 'rgba(248,249,250,0.95)', fontSize: GROUP_FONT, fontWeight: 600, color: INK2, whiteSpace: 'nowrap' }}
        >
          {str(p.label)}
        </div>
      ) : null}
      <DiagramContext.Provider value={{ ...d, origin: { x: box.x, y: box.y } }}>{children}</DiagramContext.Provider>
    </motion.div>
  );
}

function DiagramNode({ node, p }: NodeProps) {
  const d = useContext(DiagramContext);
  const { mode, selectedId } = { mode: useStroke(), selectedId: useCtx().selectedId };
  // 聚焦布局（T-director3）：小图里的节点移到小图位置；其余节点留在原位作背景（很淡、不参与交互）
  const member = !!d?.fl?.nodes[node.id];
  const bg = !!d?.fl && !member;
  const box = (member ? d!.fl!.nodes[node.id] : undefined) ?? d?.layout.nodes[node.id];
  // 显式写的 state 优先；没写时用 trace 推算的状态（D48）
  const state = effectiveState(p.state, useCtx().traced, node.id).state;
  const tone = D_TONE[state]!;
  const kind = typeof p.kind === 'string' ? p.kind : 'service';
  const shape = shapeOf(kind);
  const appear = useAppear(d);
  const { animate: anim } = useCtx();
  const root = useRoot(node, p, {
    style: box
      ? { position: 'absolute', zIndex: member ? 4 : 2, opacity: bg ? 0.3 : state === 'dim' ? 0.45 : 1, transition: 'opacity .3s', ...(bg ? { pointerEvents: 'none' as const } : {}) }
      : { display: 'none' },
  });
  if (!d || !box) return null;
  const at = { left: box.x - d.origin.x, top: box.y - d.origin.y, width: box.w, height: box.h };
  const desc = str(p.description);
  const sw = state === 'idle' || state === 'dim' ? 1.4 : 2.2;
  return (
    <motion.div
      {...root}
      data-state={state}
      data-kind={kind}
      data-appear={appear ? '' : undefined}
      // 最终位置（架构图画布坐标）：镜头与高光按它对准，不必等节点移动结束
      data-jfinal={`${box.x},${box.y},${box.w},${box.h}`}
      data-jfocus-member={member ? '' : undefined}
      initial={false}
      animate={at}
      transition={{ duration: anim && d.switched ? FOCUS_MOVE_MS / 1000 : 0, ease: [0.4, 0, 0.2, 1] }}
    >
      {/* 出现动画：淡入并轻微放大（只在挂载后出现的节点上播放） */}
      <motion.div style={{ position: 'absolute', inset: 0 }} initial={appear ? { opacity: 0, scale: 0.88 } : false} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35, ease: 'easeOut' }}>
      {mode === 'rough' ? (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Rough seedKey={node.id} shape="custom" pathOf={SHAPE[shape]} stroke={tone.stroke} strokeWidth={sw} fill={tone.fill} fillStyle="solid" dashed={kind === 'external'} inset={1.5} />
        </div>
      ) : (
        <svg aria-hidden width={box.w} height={box.h} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          <path d={SHAPE[shape]!(sw / 2, sw / 2, box.w - sw, box.h - sw)} fill={tone.fill} stroke={tone.stroke} strokeWidth={sw} strokeDasharray={kind === 'external' ? '6 4' : undefined} style={{ transition: 'fill .25s, stroke .25s' }} />
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
          gap: 2,
          padding: `${kind === 'database' ? 14 : 6}px ${kind === 'queue' ? 24 : 12}px 6px`,
          color: tone.text,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <KindIcon kind={kind} />
          <span className="jtrunc" style={{ fontSize: NODE_FONT, fontWeight: 600, lineHeight: 1.3 }}>
            {str(p.label, node.id)}
          </span>
        </div>
        {desc ? <div data-jdesc="" style={{ fontSize: DESC_FONT, lineHeight: '16px', color: state === 'idle' ? DIMMED : tone.text, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{desc}</div> : null}
      </div>
      </motion.div>
    </motion.div>
  );
}

/** state 为 active 时沿连线从 from 移到 to 的小点（Motion）；不做动画时停在 3/4 处，截图也看得出“正在调用”的方向。 */
function MovingDot({ d, color, animate: anim, reverse = false }: { d: string; color: string; animate: boolean; reverse?: boolean }) {
  const pathRef = useRef<SVGPathElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
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
    if (!anim) {
      place(reverse ? 0.25 : 0.75); // 中点通常是连线标签，停在标签与（行进方向上的）终点之间
      return;
    }
    place(reverse ? 1 : 0);
    const dur = Math.max(0.9, len / 260);
    // 一圈的时长写在元素上：自动播放会等本步 active 连线上的小点至少跑完一圈（T-director2）
    dot.setAttribute('data-jdot-ms', String(Math.round(dur * 1000)));
    const ctl = animateValue(0, 1, { duration: dur, ease: 'linear', repeat: Infinity, onUpdate: (t) => place(reverse ? 1 - t : t) });
    return () => ctl.stop();
  }, [d, anim, reverse]);
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
  const appear = useAppear(dctx);
  // 聚焦布局（T-director3）：小图里的连线用小图的走线；连向小图外部的线隐藏；其余留在原位作背景
  const fl = dctx?.fl ?? null;
  const sub = fl?.edges[node.id];
  const from = str(p.from);
  const to = str(p.to);
  const hidden = !!fl && !sub && (fl.members.includes(from) || fl.members.includes(to));
  const bg = !!fl && !sub && !hidden;
  const route = sub ?? dctx?.layout.edges[node.id];
  if (!dctx || !route || route.points.length < 2 || hidden) return null;
  // 出现动画：用一条沿路径伸长的遮罩把连线（含手绘线、虚线、箭头）从 from 画到 to
  const maskId = `jdraw-${dctx.key}-${node.id}`.replace(/[^\w-]/g, '_');
  // 显式写的 state 优先；没写时用 trace 推算的状态（D48）；trace 逆着连线方向走时小点逆向流动
  const eff = effectiveState(p.state, useCtx().traced, node.id);
  const state = eff.state;
  const reverseDot = eff.reverse;
  const color = selectedId === node.id ? 'var(--sel)' : EDGE_TONE[state]!;
  const dashed = p.async === true || state === 'error';
  const d = edgePath(route.points);
  const head = arrowHead(route.points);
  // 聚焦时：突出的连线保持原色、加粗、画在节点之上；其余连线由舞台的调暗规则变淡（data-jfocus-keep 让突出的不被调暗）
  const emph = !!sub || (!bg && dctx.focus ? edgeEmphasized(dctx.focus, { id: node.id, from, to }, state) : false);
  const labelFont = sub ? FOCUS_EDGE_FONT : EDGE_FONT;
  // 切换布局后连线等节点移到位再出现
  const modeKey = fl?.key ?? 'full';
  const fadeIn = animate && dctx.switched;
  const svgOpacity = bg ? 0.2 : 1;
  const sw = (state === 'idle' || state === 'dim' ? 1.5 : 2.4) + (emph ? 1.4 : 0);
  const label = str(p.label);
  const lb = route.label;
  const keep = emph ? '' : undefined;
  return (
    <>
      <motion.svg
      key={`line:${modeKey}`}
      aria-hidden={false}
      width={dctx.width}
      height={dctx.height}
      style={{ position: 'absolute', left: -dctx.origin.x, top: -dctx.origin.y, overflow: 'visible', pointerEvents: 'none', zIndex: emph ? 5 : 1 }}
      data-jfocus-keep={keep}
      data-jedge-svg={node.id}
      initial={fadeIn ? { opacity: 0 } : false}
      animate={{ opacity: svgOpacity }}
      transition={{ duration: 0.3, delay: fadeIn && !bg ? (FOCUS_MOVE_MS / 1000) * 0.8 : 0 }}
    >
      {appear ? (
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x={-50} y={-50} width={dctx.width + 100} height={dctx.height + 100}>
            <motion.path d={d} fill="none" stroke="#fff" strokeWidth={28} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7, ease: 'easeInOut' }} />
          </mask>
        </defs>
      ) : null}
      <g {...attrs} data-state={state} data-async={p.async === true ? '' : undefined} data-appear={appear ? '' : undefined} style={{ opacity: state === 'dim' ? 0.5 : 1, transition: 'opacity .25s' }} mask={appear ? `url(#${maskId})` : undefined}>
        {/* 透明的粗线：⌥+单击检查连线时好点中 */}
        <path d={d} fill="none" stroke="transparent" strokeWidth={14} style={{ pointerEvents: bg ? 'none' : 'stroke' }} />
        {mode === 'rough' ? (
          <>
            <RoughPath seedKey={`${node.id}:line`} d={d} stroke={color} strokeWidth={sw} dashed={dashed} />
            <RoughPath seedKey={`${node.id}:head`} d={head} stroke={color} strokeWidth={1.2} fill={color} roughness={0.5} />
          </>
        ) : (
          <>
            <path d={d} fill="none" stroke={color} strokeWidth={sw} strokeDasharray={dashed ? '7 5' : undefined} style={{ transition: 'stroke .25s' }} />
            <path d={head} fill={color} stroke="none" />
          </>
        )}
        {state === 'active' ? <MovingDot d={d} color={color} animate={animate} reverse={reverseDot} /> : null}
      </g>
      </motion.svg>
      {/* 标签单独一层，在所有连线之上（不会被别的连线的点击区盖住）；点它等于点这条连线 */}
      {label && lb ? (
        <motion.svg
          key={`label:${modeKey}`}
          width={dctx.width}
          height={dctx.height}
          style={{ position: 'absolute', left: -dctx.origin.x, top: -dctx.origin.y, overflow: 'visible', pointerEvents: 'none', zIndex: emph ? 6 : bg ? 1 : 3 }}
          data-jfocus-keep={keep}
          initial={fadeIn ? { opacity: 0 } : false}
          animate={{ opacity: svgOpacity }}
          transition={{ duration: 0.3, delay: fadeIn && !bg ? (FOCUS_MOVE_MS / 1000) * 0.8 : 0 }}
        >
          <motion.g style={{ pointerEvents: bg ? 'none' : 'all', opacity: state === 'dim' ? 0.5 : 1 }} data-jedge-label="" data-jedge-for={node.id} initial={appear ? { opacity: 0 } : false} animate={{ opacity: state === 'dim' ? 0.5 : 1 }} transition={{ duration: 0.3, delay: appear ? 0.45 : 0 }}>
            <rect x={lb.x} y={lb.y} width={lb.w} height={lb.h} rx={4} style={{ fill: SURFACE }} fillOpacity={0.92} />
            <text x={lb.x + lb.w / 2} y={lb.y + lb.h / 2} textAnchor="middle" dominantBaseline="central" fontSize={labelFont} fontWeight={sub ? 600 : undefined} fill={state === 'idle' ? INK2 : color}>
              {label}
            </text>
          </motion.g>
        </motion.svg>
      ) : null}
    </>
  );
}

// ============ Joplo ============

function Placeholder({ node, p }: NodeProps) {
  const { t: i18n } = useI18n();

  const h = dim(p.h ?? p.height) ?? '120px';
  const root = useRoot(node, p, { className: 'jbox', style: { display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'center', background: SUBTLE, fontSize: 14, color: DIMMED, height: h } });
  return (
    <div {...root} data-soft="">
      <Rough seedKey={node.id} stroke={SOFT} fill={LINE} fillStyle="cross-hatch" />
      <span className="rounded bg-[color-mix(in_srgb,var(--jp-surface)_90%,transparent)] px-2">{str(p.label, i18n.stage.placeholder)}</span>
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

// ============ 注册表：目录中每个类型都必须有实现（Record<ComponentType, …> 由类型检查保证） ============

const IMPL: Record<ComponentType, (props: NodeProps) => ReactNode> = {
  AppShell,
  'AppShell.Header': ShellHeader,
  'AppShell.Navbar': ShellSide,
  'AppShell.Main': ShellMain,
  'AppShell.Aside': ShellSide,
  'AppShell.Footer': ShellFooter,
  Container,
  Stack,
  Group,
  Flex,
  Grid,
  'Grid.Col': GridCol,
  SimpleGrid,
  Center,
  Box,
  Space,
  Paper,
  Card,
  'Card.Section': CardSection,
  Divider,
  ScrollArea,
  Title,
  Text,
  Code,
  Kbd,
  Blockquote,
  List,
  'List.Item': ListItem,
  Badge,
  Avatar,
  Image: ImageBox,
  ThemeIcon,
  Indicator,
  Timeline,
  'Timeline.Item': TimelineItem,
  Table,
  'Table.Thead': tablePart('thead'),
  'Table.Tbody': tablePart('tbody'),
  'Table.Tr': tablePart('tr'),
  'Table.Th': tablePart('th'),
  'Table.Td': tablePart('td'),
  DataTable,
  Accordion,
  'Accordion.Item': AccordionItem,
  'Accordion.Panel': AccordionPanel,
  Radio,
  'Tabs.List': TabsList,
  'Tabs.Panel': TabsPanel,
  Breadcrumbs,
  Stepper,
  'Stepper.Step': StepperStep,
  Alert,
  Loader,
  Progress,
  RingProgress,
  Skeleton,
  Notification,
  Modal: Overlay,
  Drawer: Overlay,
  ChatMessage,
  ToolCall,
  Thinking,
  Email,
  DataCard,
  StateFlow,
  Artifact,
  Terminal,
  'Terminal.Command': TerminalCommand,
  'Terminal.Output': TerminalOutput,
  Phone,
  Diagram,
  'Diagram.Group': DiagramGroup,
  'Diagram.Node': DiagramNode,
  'Diagram.Edge': DiagramEdge,
  ...(Object.fromEntries(HTML_TAGS.map((t) => [t, htmlImpl(t)])) as Record<HtmlTag, (props: NodeProps) => ReactNode>),
  Placeholder,
  Custom,
  '#text': TextNode,
  Button,
  ActionIcon,
  CloseButton,
  Anchor,
  a: Anchor,
  NavLink,
  Burger,
  TextInput,
  PasswordInput: TextInput,
  NumberInput: TextInput,
  Textarea,
  Select,
  MultiSelect: Select,
  Checkbox,
  'Radio.Group': RadioGroup,
  Switch,
  SegmentedControl,
  FileInput: TextInput,
  Tabs,
  'Tabs.Tab': TabsTab,
  'Accordion.Control': AccordionControl,
  Pagination,
  PromptInput,
  'Artifact.Ref': ArtifactRef,
  'Terminal.Input': TerminalInput,
};

/** 渲染器实现的类型清单（与 COMPONENT_TYPES 一致，由类型检查保证）。 */
export const IMPLEMENTED_TYPES: readonly string[] = Object.keys(IMPL);

/** 渲染一个场景节点（及其可见的子节点）。 */
export function RenderNode({ node }: { node: SceneNode }) {
  const { state, width } = useCtx();
  if (!isSelfVisible(node, state, width)) return null;
  const p = resolveProps(node, state);
  const disabled = isNodeDisabled(node, state);
  const Impl = IMPL[node.type];
  if (!Impl) return null;
  const children = (node.children ?? []).map((c) => <RenderNode key={c.id} node={c} />);
  return (
    <Impl node={node} p={p} disabled={disabled}>
      {children}
    </Impl>
  );
}
