/**
 * 组件目录 v2（@joplo/core catalog，名称与属性对齐 shadcn/ui 与 AI Elements）中每个类型的低保真实现。
 *
 * - 底座用真实的 shadcn 组件（components/ui/*）；手绘主题叠加 Rough 描边与手写字体，线框主题用 1px 边框。
 * - 每个节点的根 DOM 带 data-jid / data-jtype / data-jat（= node.source，用于“选中 → 文件:行号”）。
 * - 绑定、可见性、禁用一律由 core 计算：resolveProps / isSelfVisible / isNodeDisabled；
 *   Dialog / Sheet / AlertDialog 的门控来自 core 的 GATED_CONTAINERS（isSelfVisible 内部判断）。
 * - 作者的 className 原样加到根 DOM（Tailwind 以项目目录为 @source 编译）。其他属性不透传到 DOM。
 * - 只用 React 文本节点渲染内容，不使用 dangerouslySetInnerHTML；链接不生成真实 href。
 */
import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { INTERACTIVE_TYPES, isNodeDisabled, isSelfVisible, nodeLabel, resolveProps, resolveValue, type ComponentType, type PlayState, type Scene, type SceneNode } from '@joplo/core';
import { Button as UiButton } from '@/components/ui/button';
import { Badge as UiBadge } from '@/components/ui/badge';
import { Input as UiInput } from '@/components/ui/input';
import { Textarea as UiTextarea } from '@/components/ui/textarea';
import { Checkbox as UiCheckbox } from '@/components/ui/checkbox';
import { Switch as UiSwitch } from '@/components/ui/switch';
import { Progress as UiProgress } from '@/components/ui/progress';
import { Avatar as UiAvatar, AvatarFallback } from '@/components/ui/avatar';
import { Table as UiTable, TableBody as UiTableBody, TableCell as UiTableCell, TableHead as UiTableHead, TableHeader as UiTableHeader, TableRow as UiTableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { Rough, useStageTheme } from './rough';

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
};

export const RenderContext = createContext<RenderCtx | null>(null);
const useCtx = () => {
  const c = useContext(RenderContext);
  if (!c) throw new Error('RenderContext 缺失');
  return c;
};

/** Tabs / RadioGroup 的当前值，向下传给 TabsTrigger / TabsContent / RadioGroupItem。 */
const ValueContext = createContext<{ owner: string; value: string | null; disabled: boolean } | null>(null);

const str = (v: unknown, fallback = ''): string => (v === undefined || v === null ? fallback : typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(v));
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const cls = (p: Record<string, unknown>) => (typeof p.className === 'string' ? p.className : '');

const INK = '#1e1e1e';
const SOFT = '#9a9a9a';
const DANGER = '#c92a2a';

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

/** 可输入组件的显示值：动画预览 > 状态 inputs[id] > 绑定的 value > defaultValue。 */
function useInputValue(node: SceneNode, p: Record<string, unknown>): unknown {
  const { state, preview } = useCtx();
  if (preview && preview.nodeId === node.id) return preview.text;
  if (state.inputs[node.id] !== undefined) return state.inputs[node.id];
  if (p.value !== undefined) return p.value;
  if (p.checked !== undefined) return p.checked;
  return p.defaultValue ?? p.defaultChecked;
}

/** 子树中第一个某类型节点。 */
function findDesc(node: SceneNode, type: string): SceneNode | null {
  for (const c of node.children ?? []) {
    if (c.type === type) return c;
    const f = findDesc(c, type);
    if (f) return f;
  }
  return null;
}
function allDesc(node: SceneNode, type: string, out: SceneNode[] = []): SceneNode[] {
  for (const c of node.children ?? []) {
    if (c.type === type) out.push(c);
    allDesc(c, type, out);
  }
  return out;
}
/** 节点子树的纯文本（绑定按当前状态解析）。 */
function textOf(node: SceneNode, state: PlayState): string {
  if (node.type === '#text') return str(resolveValue(node.props?.text, state));
  return (node.children ?? []).map((c) => textOf(c, state)).join('');
}

// ============ 文本与 HTML ============

function TextNode({ node, p }: NodeProps) {
  const attrs = useRootAttrs(node);
  return <span {...attrs}>{str(p.text)}</span>;
}

const HTML_TAGS = ['div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'main', 'section', 'header', 'footer', 'nav', 'aside', 'ul', 'ol', 'li', 'strong', 'em', 'small', 'code'] as const;
type HtmlTag = (typeof HTML_TAGS)[number];

function htmlImpl(tag: HtmlTag) {
  return function Html({ node, p, children }: NodeProps) {
    const attrs = useRootAttrs(node);
    const Tag = tag as 'div';
    return (
      <Tag {...attrs} className={cn(`jh-${tag}`, cls(p))}>
        {children}
      </Tag>
    );
  };
}

function Anchor({ node, p, disabled, children }: NodeProps) {
  const attrs = useRootAttrs(node, disabled);
  return (
    <a {...attrs} role="link" tabIndex={0} className={cn('cursor-pointer text-[#1c5fb8] underline underline-offset-4', disabled && 'text-[#8a8a8a]', cls(p))}>
      {children}
    </a>
  );
}

// ============ Card ============

function Card({ node, p, children }: NodeProps) {
  const attrs = useRootAttrs(node);
  return (
    <div {...attrs} data-slot="card" className={cn('jbox flex flex-col gap-5 bg-white py-5 text-[#1e1e1e] [.jstage[data-theme=clean]_&]:rounded-xl [.jstage[data-theme=clean]_&]:shadow-sm', cls(p))}>
      <Rough seedKey={node.id} />
      {children}
    </div>
  );
}
const slotDiv = (base: string, slot: string) =>
  function Part({ node, p, children }: NodeProps) {
    const attrs = useRootAttrs(node);
    return (
      <div {...attrs} data-slot={slot} className={cn(base, cls(p))}>
        {children}
      </div>
    );
  };
const CardHeader = slotDiv('flex flex-col gap-1.5 px-5', 'card-header');
const CardTitle = slotDiv('text-[17px] font-semibold leading-snug', 'card-title');
const CardDescription = slotDiv('text-[14px] text-[#6b6b6b]', 'card-description');
const CardContent = slotDiv('flex flex-col gap-3 px-5', 'card-content');
const CardFooter = slotDiv('flex items-center gap-2 px-5', 'card-footer');

// ============ Dialog / Sheet / AlertDialog ============

/** 浮层根：渲染到舞台内的弹窗层（不 portal 到 body），带遮罩。门控（open）已由 isSelfVisible 判断。 */
function OverlayRoot({ node, p, children }: NodeProps) {
  const attrs = useRootAttrs(node);
  const { dialogLayer, animate } = useCtx();
  if (!dialogLayer) return null;
  const sheet = node.type === 'Sheet';
  return createPortal(
    <div {...attrs} className={cn('absolute inset-0 z-20 flex', sheet ? 'items-stretch justify-end' : 'items-center justify-center', cls(p))}>
      <motion.div data-jbackdrop="" className="absolute inset-0 bg-[rgba(30,30,30,0.38)]" initial={animate ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.18 }} />
      {children}
    </div>,
    dialogLayer,
  );
}

function OverlayContent({ node, p, children }: NodeProps) {
  const attrs = useRootAttrs(node);
  const { animate } = useCtx();
  const sheet = node.type === 'SheetContent';
  const side = str(p.side, 'right');
  const alert = node.type === 'AlertDialogContent';
  const title = findDesc(node, node.type.replace('Content', 'Title'));
  const { state } = useCtx();
  const initial = sheet ? { opacity: 0, x: side === 'left' ? -40 : 40 } : { opacity: 0, y: 12, scale: 0.98 };
  return (
    <motion.div
      {...attrs}
      role={alert ? 'alertdialog' : 'dialog'}
      aria-modal="true"
      aria-label={title ? textOf(title, state) : '弹窗'}
      className={cn(
        'jbox relative z-10 flex flex-col gap-4 bg-white p-6 shadow-[6px_6px_0_rgba(30,30,30,0.18)] [.jstage[data-theme=clean]_&]:shadow-xl',
        sheet ? cn('h-full w-[420px] max-w-[85%]', side === 'left' && 'mr-auto') : cn('max-h-[90%] max-w-[90%] overflow-auto [.jstage[data-theme=clean]_&]:rounded-lg', alert ? 'w-[440px]' : 'w-[500px]'),
        cls(p),
      )}
      initial={animate ? initial : false}
      animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      transition={{ duration: 0.22 }}
    >
      <Rough seedKey={node.id} strokeWidth={1.8} />
      {children}
    </motion.div>
  );
}

const DialogHeader = slotDiv('flex flex-col gap-1.5', 'dialog-header');
const DialogTitle = slotDiv('text-[20px] font-bold leading-snug', 'dialog-title');
const DialogDescription = slotDiv('text-[14px] text-[#6b6b6b]', 'dialog-description');
const DialogFooter = slotDiv('mt-1 flex items-center justify-end gap-2', 'dialog-footer');

// ============ Tabs ============

function Tabs({ node, p, disabled, children }: NodeProps) {
  const attrs = useRootAttrs(node, disabled);
  const v = useInputValue(node, p);
  const first = findDesc(node, 'TabsTrigger');
  const value = typeof v === 'string' ? v : first ? str(first.props?.value) : null;
  return (
    <ValueContext.Provider value={{ owner: node.id, value, disabled }}>
      <div {...attrs} className={cn('flex flex-col gap-3', cls(p))}>
        {children}
      </div>
    </ValueContext.Provider>
  );
}
function TabsList({ node, p, children }: NodeProps) {
  const attrs = useRootAttrs(node);
  return (
    <div {...attrs} role="tablist" className={cn('jbox inline-flex w-fit items-center gap-1 p-1 [.jstage[data-theme=clean]_&]:rounded-lg [.jstage[data-theme=clean]_&]:border-transparent [.jstage[data-theme=clean]_&]:bg-[#f1f1f1]', cls(p))}>
      <Rough seedKey={node.id} stroke={SOFT} strokeWidth={1} />
      {children}
    </div>
  );
}
function TabsTrigger({ node, p, disabled, children }: NodeProps) {
  const ctx = useContext(ValueContext);
  const dis = disabled || !!ctx?.disabled;
  const attrs = useRootAttrs(node, dis);
  const active = ctx?.value !== null && ctx?.value === str(p.value);
  return (
    <button
      {...attrs}
      type="button"
      role="tab"
      aria-selected={active}
      className={cn(
        'jbox relative px-3 py-1 text-[14px] [.jstage[data-theme=clean]_&]:rounded-md [.jstage[data-theme=clean]_&]:border-transparent',
        active ? 'font-semibold [.jstage[data-theme=clean]_&]:bg-white [.jstage[data-theme=clean]_&]:shadow-sm' : 'text-[#6b6b6b]',
        dis && 'cursor-not-allowed text-[#a0a0a0]',
        cls(p),
      )}
    >
      {active ? <Rough seedKey={`${node.id}:on`} shape="underline" strokeWidth={2.2} /> : null}
      <span className="jtrunc" data-jtext="">
        {children}
      </span>
    </button>
  );
}
function TabsContent({ node, p, children }: NodeProps) {
  const ctx = useContext(ValueContext);
  const attrs = useRootAttrs(node);
  if (ctx && ctx.value !== str(p.value)) return null;
  return (
    <div {...attrs} role="tabpanel" className={cn('flex flex-col gap-3', cls(p))}>
      {children}
    </div>
  );
}

// ============ Table / DataTable ============

function TableBox({ node, children, p }: { node: SceneNode; p: Record<string, unknown>; children: ReactNode }) {
  return (
    <div className={cn('jbox w-full bg-white px-1 [.jstage[data-theme=clean]_&]:rounded-md', cls(p))} data-soft="">
      <Rough seedKey={node.id} stroke="#5a5a5a" strokeWidth={1.1} />
      {children}
    </div>
  );
}
function Table({ node, p, children }: NodeProps) {
  const attrs = useRootAttrs(node);
  return (
    <TableBox node={node} p={p}>
      <UiTable {...attrs} className="text-[14px]">
        {children}
      </UiTable>
    </TableBox>
  );
}
function TableHeader({ node, p, children }: NodeProps) {
  const attrs = useRootAttrs(node);
  return (
    <UiTableHeader {...attrs} className={cn('[&_tr]:border-b-[#d0d0d0]', cls(p))}>
      {children}
    </UiTableHeader>
  );
}
function TableBody({ node, p, children }: NodeProps) {
  const attrs = useRootAttrs(node);
  return (
    <UiTableBody {...attrs} className={cls(p)}>
      {children}
    </UiTableBody>
  );
}
function TableRow({ node, p, children }: NodeProps) {
  const attrs = useRootAttrs(node);
  return (
    <UiTableRow {...attrs} className={cn('border-b-[#e4e4e4] hover:bg-transparent', cls(p))}>
      {children}
    </UiTableRow>
  );
}
function TableHead({ node, p, children }: NodeProps) {
  const attrs = useRootAttrs(node);
  return (
    <UiTableHead {...attrs} className={cn('h-9 font-semibold text-[#1e1e1e]', cls(p))}>
      {children}
    </UiTableHead>
  );
}
function TableCell({ node, p, children }: NodeProps) {
  const attrs = useRootAttrs(node);
  return (
    <UiTableCell {...attrs} className={cn('py-2', cls(p))}>
      {children}
    </UiTableCell>
  );
}

/** DataTable：columns（accessorKey / header）+ data（可绑定）+ empty。 */
function DataTable({ node, p }: NodeProps) {
  const attrs = useRootAttrs(node);
  const cols = arr(p.columns)
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c, i) => ({ key: str(c.accessorKey ?? c.id ?? `col${i}`), header: str(c.header ?? c.accessorKey ?? '') }));
  const rows = arr(p.data);
  return (
    <div {...attrs} className={cn('jbox w-full bg-white px-1 [.jstage[data-theme=clean]_&]:rounded-md', cls(p))} data-soft="">
      <Rough seedKey={node.id} stroke="#5a5a5a" strokeWidth={1.1} />
      <UiTable className="text-[14px]">
        <UiTableHeader>
          <UiTableRow className="border-b-[#d0d0d0] hover:bg-transparent">
            {cols.map((c) => (
              <UiTableHead key={c.key} className="h-9 font-semibold text-[#1e1e1e]">
                {c.header}
              </UiTableHead>
            ))}
          </UiTableRow>
        </UiTableHeader>
        <UiTableBody>
          {rows.length === 0 ? (
            <UiTableRow className="hover:bg-transparent">
              <UiTableCell colSpan={Math.max(cols.length, 1)} className="py-4 text-center text-[#6b6b6b]" data-jempty="">
                {str(p.empty, '暂无数据')}
              </UiTableCell>
            </UiTableRow>
          ) : (
            rows.map((r, i) => (
              <UiTableRow key={i} className="border-b-[#e4e4e4] hover:bg-transparent" data-jrow-index={i}>
                {cols.map((c) => (
                  <UiTableCell key={c.key} className="py-2">
                    {r && typeof r === 'object' ? str((r as Record<string, unknown>)[c.key]) : str(r)}
                  </UiTableCell>
                ))}
              </UiTableRow>
            ))
          )}
        </UiTableBody>
      </UiTable>
    </div>
  );
}

// ============ Alert ============

function Alert({ node, p, children }: NodeProps) {
  const attrs = useRootAttrs(node);
  const danger = p.variant === 'destructive';
  const c = danger ? DANGER : INK;
  return (
    <div
      {...attrs}
      role={danger ? 'alert' : 'status'}
      className={cn('jbox flex w-full items-start gap-3 px-4 py-3 [.jstage[data-theme=clean]_&]:rounded-lg', danger ? 'bg-[#fff3f3] text-[#c92a2a] [.jstage[data-theme=clean]_&]:border-[#c92a2a]' : 'bg-[#fafafa]', cls(p))}
    >
      <Rough seedKey={node.id} stroke={c} />
      <span aria-hidden className="jbox mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[12px] font-bold [.jstage[data-theme=clean]_&]:border-current">
        <Rough seedKey={`${node.id}:i`} shape="ellipse" stroke={c} inset={0.5} strokeWidth={1} />
        <span>{danger ? '!' : 'i'}</span>
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">{children}</div>
    </div>
  );
}
const AlertTitle = slotDiv('font-semibold leading-snug', 'alert-title');
const AlertDescription = slotDiv('text-[14px] leading-snug opacity-90', 'alert-description');

// ============ 小件 ============

const BADGE_TONE: Record<string, { stroke: string; fill?: string; text: string }> = {
  default: { stroke: INK, fill: INK, text: '#fff' },
  secondary: { stroke: SOFT, fill: '#efefef', text: INK },
  destructive: { stroke: DANGER, fill: DANGER, text: '#fff' },
  outline: { stroke: INK, text: INK },
};
function Badge({ node, p, children }: NodeProps) {
  const attrs = useRootAttrs(node);
  const theme = useStageTheme();
  const variant = str(p.variant, 'default');
  const t = BADGE_TONE[variant] ?? BADGE_TONE.default!;
  return (
    <UiBadge
      {...attrs}
      variant={(['default', 'secondary', 'destructive', 'outline'].includes(variant) ? variant : 'default') as 'default'}
      className={cn('jbox rounded-full px-2.5 text-[13px] font-normal', theme === 'sketch' && 'bg-transparent', cls(p))}
      style={theme === 'sketch' ? { color: t.text } : undefined}
    >
      <Rough seedKey={node.id} shape="ellipse" stroke={t.stroke} fill={t.fill} fillStyle="solid" strokeWidth={1} inset={1} />
      <span className="jtrunc" data-jtext="">
        {children}
      </span>
    </UiBadge>
  );
}

function Avatar({ node, p }: NodeProps) {
  const attrs = useRootAttrs(node);
  const { state } = useCtx();
  const name = str(p.fallback ?? p.name ?? p.alt) || textOf(node, state) || '?';
  return (
    <UiAvatar {...attrs} className={cn('jbox size-9 overflow-visible', cls(p))}>
      <Rough seedKey={node.id} shape="ellipse" />
      <AvatarFallback className="bg-transparent text-sm">{name.slice(0, 1)}</AvatarFallback>
    </UiAvatar>
  );
}

function Separator({ node, p }: NodeProps) {
  const attrs = useRootAttrs(node);
  const vertical = p.orientation === 'vertical';
  return (
    <div {...attrs} role="separator" className={cn('jbox shrink-0', vertical ? 'w-2 self-stretch' : 'h-2 w-full', cls(p))} data-noborder="" data-soft="">
      <Rough seedKey={node.id} shape="line" stroke={SOFT} strokeWidth={1} />
      <div className={cn('absolute bg-[#d0d0d0] [.jstage[data-theme=sketch]_&]:hidden', vertical ? 'inset-y-0 left-1/2 w-px' : 'inset-x-0 top-1/2 h-px')} />
    </div>
  );
}

function Skeleton({ node, p }: NodeProps) {
  const attrs = useRootAttrs(node);
  return <div {...attrs} aria-hidden className={cn('h-4 w-full rounded-md bg-[#ececec]', cls(p))} />;
}

function Progress({ node, p }: NodeProps) {
  const attrs = useRootAttrs(node);
  const v = Math.max(0, Math.min(100, Number(p.value ?? 0) || 0));
  return (
    <div {...attrs} className={cn('jbox h-3 w-full', cls(p))}>
      <Rough seedKey={node.id} />
      <UiProgress value={v} className="h-full rounded-none bg-transparent [&>[data-slot=progress-indicator]]:bg-[#1e1e1e]" />
    </div>
  );
}

function Label({ node, p, children }: NodeProps) {
  const attrs = useRootAttrs(node);
  // 不生成真实 htmlFor：避免把点击转发给 DOM 中同名 id 的元素；用 data-jfor 记录关联。
  return (
    <label {...attrs} data-jfor={str(p.htmlFor) || undefined} className={cn('flex items-center gap-2 text-[14px] font-medium leading-none', cls(p))}>
      {children}
    </label>
  );
}

function ScrollArea({ node, p, children }: NodeProps) {
  const attrs = useRootAttrs(node);
  return (
    <div {...attrs} className={cn('relative overflow-auto', cls(p))}>
      {children}
    </div>
  );
}

function Placeholder({ node, p }: NodeProps) {
  const attrs = useRootAttrs(node);
  const h = typeof p.height === 'number' ? p.height : 120;
  return (
    <div {...attrs} className={cn('jbox flex w-full items-center justify-center bg-[#fafafa] text-[14px] text-[#6b6b6b]', cls(p))} data-soft="" style={{ height: h }}>
      <Rough seedKey={node.id} stroke={SOFT} fill="#e9e9e9" fillStyle="cross-hatch" />
      <span className="rounded bg-white/90 px-2">{str(p.label, '占位')}</span>
    </div>
  );
}

function Custom({ node, p }: NodeProps) {
  const attrs = useRootAttrs(node);
  return (
    <div
      {...attrs}
      className={cn('jbox flex min-h-24 w-full flex-col items-center justify-center gap-1 bg-[repeating-linear-gradient(45deg,#fafafa,#fafafa_8px,#f2f2f2_8px,#f2f2f2_16px)] p-4 text-center', cls(p))}
      data-dashed=""
    >
      <Rough seedKey={node.id} dashed stroke="#5a5a5a" />
      <div className="font-semibold">自定义组件：{str(p.kind, '未命名')}（占位）</div>
      <div className="text-[12px] text-[#6b6b6b]">目录中没有的组件，按声明的元素 ID 与状态演示</div>
    </div>
  );
}

// ============ 可操作 ============

const BTN: Record<string, { stroke: string; fill?: string; text: string; ui: 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary' | 'link' }> = {
  default: { stroke: INK, fill: INK, text: '#ffffff', ui: 'default' },
  destructive: { stroke: DANGER, fill: DANGER, text: '#ffffff', ui: 'destructive' },
  outline: { stroke: INK, text: INK, ui: 'outline' },
  secondary: { stroke: SOFT, fill: '#ececec', text: INK, ui: 'secondary' },
  ghost: { stroke: 'transparent', text: INK, ui: 'ghost' },
  link: { stroke: 'transparent', text: '#1c5fb8', ui: 'link' },
};

function Button({ node, p, disabled, children }: NodeProps) {
  const attrs = useRootAttrs(node, disabled);
  const variant = str(p.variant, 'default');
  const v = BTN[variant] ?? BTN.default!;
  const theme = useStageTheme();
  const size = str(p.size, 'default');
  const stroke = disabled ? '#9a9a9a' : v.stroke;
  const fill = disabled ? (v.fill ? '#d4d4d4' : undefined) : v.fill;
  const color = disabled ? (v.fill ? '#5a5a5a' : '#8a8a8a') : v.text;
  return (
    <UiButton
      {...attrs}
      type="button"
      variant={v.ui}
      className={cn(
        'jbox w-fit max-w-full text-[15px] shadow-none',
        size === 'sm' ? 'h-8 px-3' : size === 'lg' ? 'h-11 px-6' : size.startsWith('icon') ? 'size-9 px-0' : 'h-10 px-5',
        theme === 'sketch' && 'border-transparent bg-transparent hover:bg-black/[0.03]',
        theme === 'clean' && disabled && 'border-dashed border-[#9a9a9a] bg-[#ececec] text-[#6b6b6b] hover:bg-[#ececec]',
        disabled && 'cursor-not-allowed',
        cls(p),
      )}
      style={theme === 'sketch' ? { color } : undefined}
      data-dashed={disabled ? '' : undefined}
    >
      {variant !== 'link' ? <Rough seedKey={node.id} stroke={stroke} fill={fill} fillStyle={fill ? 'solid' : undefined} dashed={disabled} strokeWidth={1.4} /> : null}
      <span className="jtrunc inline-flex items-center gap-1.5" data-jtext="">
        {children}
      </span>
    </UiButton>
  );
}

function SidebarMenuButton({ node, p, disabled, children }: NodeProps) {
  const attrs = useRootAttrs(node, disabled);
  const { scene } = useCtx();
  const active = p.isActive === true || (p.isActive === undefined && typeof p.href === 'string' && p.href === scene.route);
  return (
    <a
      {...attrs}
      role="link"
      tabIndex={0}
      aria-current={active ? 'page' : undefined}
      className={cn('jbox flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-[15px]', active ? 'bg-[#ececec] font-semibold' : 'hover:bg-black/[0.03]', disabled && 'text-[#8a8a8a]', cls(p))}
      data-noborder={active ? undefined : ''}
      data-soft=""
    >
      {active ? <Rough seedKey={node.id} stroke={SOFT} fill="#e6e6e6" fillStyle="solid" strokeWidth={1} /> : null}
      <span className="jtrunc" data-jtext="">
        {children}
      </span>
    </a>
  );
}

function Input({ node, p, disabled }: NodeProps) {
  const attrs = useRootAttrs(node, disabled);
  const v = useInputValue(node, p);
  const theme = useStageTheme();
  return (
    <div {...attrs} className={cn('jbox w-full [.jstage[data-theme=clean]_&]:rounded-md', disabled && 'bg-[#f4f4f4]', cls(p))}>
      <Rough seedKey={node.id} stroke={disabled ? SOFT : INK} />
      <UiInput
        readOnly
        tabIndex={0}
        aria-label={str(p.placeholder, '输入框')}
        type={p.type === 'password' ? 'password' : 'text'}
        value={str(v)}
        placeholder={str(p.placeholder)}
        className={cn('h-10 cursor-[inherit] border-none bg-transparent text-[15px] shadow-none placeholder:text-[#9a9a9a] focus-visible:ring-0 md:text-[15px]', theme === 'clean' && 'rounded-md')}
      />
    </div>
  );
}

function Textarea({ node, p, disabled }: NodeProps) {
  const attrs = useRootAttrs(node, disabled);
  const v = useInputValue(node, p);
  return (
    <div {...attrs} className={cn('jbox w-full [.jstage[data-theme=clean]_&]:rounded-md', disabled && 'bg-[#f4f4f4]', cls(p))}>
      <Rough seedKey={node.id} stroke={disabled ? SOFT : INK} />
      <UiTextarea readOnly tabIndex={0} aria-label={str(p.placeholder, '文本域')} value={str(v)} placeholder={str(p.placeholder)} className="min-h-24 resize-none border-none bg-transparent text-[15px] shadow-none placeholder:text-[#9a9a9a] focus-visible:ring-0 md:text-[15px]" />
    </div>
  );
}

/** Select：选项来自 SelectItem 子节点；显示 inputs[id]，没有值时显示 SelectValue 的 placeholder。选择动画期间展开下拉。 */
function Select({ node, p, disabled }: NodeProps) {
  const attrs = useRootAttrs(node, disabled);
  const { state, preview } = useCtx();
  const v = useInputValue(node, p);
  const items = allDesc(node, 'SelectItem').map((it) => ({ value: str(resolveValue(it.props?.value, state)), label: textOf(it, state) || str(it.props?.value) }));
  const ph = findDesc(node, 'SelectValue');
  const has = v !== undefined && v !== null && v !== '';
  const shown = has ? (items.find((i) => i.value === str(v))?.label ?? str(v)) : str(resolveValue(ph?.props?.placeholder, state) ?? p.placeholder, '请选择');
  const open = preview?.nodeId === node.id;
  return (
    <div {...attrs} className={cn('relative w-full', cls(p))}>
      <div className="jbox flex h-10 items-center justify-between px-3 [.jstage[data-theme=clean]_&]:rounded-md" role="combobox" aria-expanded={open} tabIndex={0}>
        <Rough seedKey={node.id} stroke={disabled ? SOFT : INK} />
        <span className={cn('jtrunc', has ? '' : 'text-[#9a9a9a]')} data-jtext="">
          {shown}
        </span>
        <span aria-hidden className="ml-2 text-[#6b6b6b]">
          ▾
        </span>
      </div>
      {open && items.length ? (
        <div className="jbox absolute inset-x-0 top-[calc(100%+4px)] z-30 flex flex-col bg-white py-1 shadow-[4px_4px_0_rgba(30,30,30,0.12)] [.jstage[data-theme=clean]_&]:rounded-md" role="listbox" data-jdropdown="">
          <Rough seedKey={`${node.id}:list`} stroke="#5a5a5a" strokeWidth={1.1} />
          {items.map((it) => (
            <div key={it.value} role="option" aria-selected={it.value === str(v)} className={cn('px-3 py-1.5 text-[15px]', it.value === str(v) && 'bg-[#ececec] font-semibold')}>
              {it.label}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
/** Select 的子节点由 Select 自己读取，不单独渲染。 */
const Hidden = () => null;

function Checkbox({ node, p, disabled }: NodeProps) {
  const attrs = useRootAttrs(node, disabled);
  const checked = useInputValue(node, p) === true;
  return (
    <span {...attrs} className={cn('jbox inline-flex w-fit rounded-[3px]', cls(p))} data-noborder="">
      <Rough seedKey={node.id} inset={1} stroke={disabled ? SOFT : INK} />
      <UiCheckbox
        checked={checked}
        tabIndex={0}
        className="size-[18px] rounded-[3px] border-[#3a3a3a] shadow-none data-[state=checked]:border-[#1e1e1e] data-[state=checked]:bg-[#1e1e1e] [.jstage[data-theme=sketch]_&]:border-transparent [.jstage[data-theme=sketch]_&]:bg-transparent [.jstage[data-theme=sketch]_&]:text-[#1e1e1e]"
      />
    </span>
  );
}

function Switch({ node, p, disabled }: NodeProps) {
  const attrs = useRootAttrs(node, disabled);
  const on = useInputValue(node, p) === true;
  return (
    <span {...attrs} className={cn('inline-flex w-fit', cls(p))}>
      <UiSwitch checked={on} tabIndex={0} className="data-[state=checked]:bg-[#1e1e1e]" />
    </span>
  );
}

function RadioGroup({ node, p, disabled, children }: NodeProps) {
  const attrs = useRootAttrs(node, disabled);
  const v = useInputValue(node, p);
  return (
    <ValueContext.Provider value={{ owner: node.id, value: v === undefined || v === null ? null : str(v), disabled }}>
      <div {...attrs} role="radiogroup" tabIndex={0} className={cn('grid gap-2', cls(p))}>
        {children}
      </div>
    </ValueContext.Provider>
  );
}
function RadioGroupItem({ node, p }: NodeProps) {
  const attrs = useRootAttrs(node);
  const ctx = useContext(ValueContext);
  const on = ctx?.value !== null && ctx?.value === str(p.value);
  return (
    <span {...attrs} role="radio" aria-checked={on} className={cn('jbox inline-flex size-[18px] shrink-0 items-center justify-center rounded-full [.jstage[data-theme=clean]_&]:border-[#3a3a3a]', cls(p))}>
      <Rough seedKey={node.id} shape="ellipse" inset={1} />
      {on ? <span className="size-2 rounded-full bg-[#1e1e1e]" /> : null}
    </span>
  );
}

// ============ Sidebar ============

function Sidebar({ node, p, children }: NodeProps) {
  const attrs = useRootAttrs(node);
  return (
    <aside {...attrs} className={cn('jbox flex w-[220px] shrink-0 flex-col gap-3 self-stretch bg-[#fafafa] p-3 [.jstage[data-theme=clean]_&]:border-y-0 [.jstage[data-theme=clean]_&]:border-l-0', cls(p))} data-soft="">
      <Rough seedKey={node.id} stroke={SOFT} />
      {children}
    </aside>
  );
}
const SidebarHeader = slotDiv('px-2 py-1 text-[16px] font-semibold', 'sidebar-header');
const SidebarContent = slotDiv('flex min-h-0 flex-1 flex-col gap-3 overflow-auto', 'sidebar-content');
const SidebarFooter = slotDiv('mt-auto flex flex-col gap-1', 'sidebar-footer');
const SidebarGroup = slotDiv('flex flex-col gap-1', 'sidebar-group');
const SidebarGroupLabel = slotDiv('px-2 text-[12px] text-[#6b6b6b]', 'sidebar-group-label');
function SidebarMenu({ node, p, children }: NodeProps) {
  const attrs = useRootAttrs(node);
  return (
    <ul {...attrs} className={cn('flex flex-col gap-0.5', cls(p))}>
      {children}
    </ul>
  );
}
function SidebarMenuItem({ node, p, children }: NodeProps) {
  const attrs = useRootAttrs(node);
  return (
    <li {...attrs} className={cn('list-none', cls(p))}>
      {children}
    </li>
  );
}

// ============ AI Elements ============

const Conversation = slotDiv('flex flex-col gap-4 overflow-auto', 'conversation');
function Message({ node, p, children }: NodeProps) {
  const attrs = useRootAttrs(node);
  const user = p.from === 'user';
  return (
    <div {...attrs} data-from={user ? 'user' : 'assistant'} className={cn('group flex w-full', user ? 'justify-end' : 'justify-start', cls(p))}>
      {children}
    </div>
  );
}
function MessageContent({ node, p, children }: NodeProps) {
  const attrs = useRootAttrs(node);
  return (
    <div
      {...attrs}
      className={cn(
        'jbox flex max-w-[80%] flex-col gap-2 px-4 py-2.5 group-data-[from=user]:bg-[#f1f1f1] [.jstage[data-theme=clean]_&]:rounded-lg [.jstage[data-theme=clean]_&]:group-data-[from=assistant]:border-transparent',
        cls(p),
      )}
      data-soft=""
    >
      <Rough seedKey={node.id} stroke={SOFT} />
      {children}
    </div>
  );
}
const Response = slotDiv('whitespace-pre-wrap leading-relaxed', 'response');
function Reasoning({ node, p, children }: NodeProps) {
  const attrs = useRootAttrs(node);
  return (
    <div {...attrs} className={cn('jbox flex flex-col gap-1 px-3 py-2 text-[14px] text-[#6b6b6b] [.jstage[data-theme=clean]_&]:rounded-md', cls(p))} data-dashed="" data-soft="">
      <Rough seedKey={node.id} stroke={SOFT} dashed />
      <div className="text-[12px] font-semibold">思考过程</div>
      <div className="whitespace-pre-wrap">{children}</div>
    </div>
  );
}
function Tool({ node, p, children }: NodeProps) {
  const attrs = useRootAttrs(node);
  return (
    <div {...attrs} className={cn('jbox flex w-full flex-col gap-1 bg-[#fafafa] px-3 py-2 font-mono text-[13px] [.jstage[data-theme=clean]_&]:rounded-md', cls(p))} data-soft="">
      <Rough seedKey={node.id} stroke={SOFT} />
      {children}
    </div>
  );
}
const TOOL_STATE: Record<string, { text: string; c: string }> = {
  'input-streaming': { text: '准备中', c: '#6b6b6b' },
  'input-available': { text: '运行中', c: '#1c5fb8' },
  'output-available': { text: '已完成', c: '#2b8a3e' },
  'output-error': { text: '出错', c: DANGER },
};
function ToolHeader({ node, p, children }: NodeProps) {
  const attrs = useRootAttrs(node);
  const s = TOOL_STATE[str(p.state, 'input-available')] ?? TOOL_STATE['input-available']!;
  const title = str(p.title ?? p.type ?? p.name, '工具调用').replace(/^tool-/, '');
  return (
    <div {...attrs} className={cn('flex items-center justify-between gap-2', cls(p))}>
      <span className="jtrunc">⚙ {title}</span>
      <span style={{ color: s.c }}>{s.text}</span>
      {children}
    </div>
  );
}
const ToolContent = slotDiv('flex flex-col gap-1 whitespace-pre-wrap text-[#4a4a4a]', 'tool-content');
function Loader({ node, p, children }: NodeProps) {
  const attrs = useRootAttrs(node);
  const { animate } = useCtx();
  return (
    <div {...attrs} role="status" className={cn('flex items-center gap-2 text-[#4a4a4a]', cls(p))}>
      <motion.span
        aria-hidden
        className="inline-block size-4 shrink-0 rounded-full border-2 border-[#1e1e1e] border-t-transparent"
        animate={animate ? { rotate: 360 } : undefined}
        transition={animate ? { repeat: Infinity, ease: 'linear', duration: 0.9 } : undefined}
      />
      <span>{children}</span>
    </div>
  );
}
function PromptInput({ node, p, children }: NodeProps) {
  const attrs = useRootAttrs(node);
  return (
    <div {...attrs} className={cn('jbox flex w-full items-end gap-2 p-2 [.jstage[data-theme=clean]_&]:rounded-xl', cls(p))}>
      <Rough seedKey={node.id} />
      {children}
    </div>
  );
}
function PromptInputTextarea({ node, p, disabled }: NodeProps) {
  const attrs = useRootAttrs(node, disabled);
  const v = useInputValue(node, p);
  const has = v !== undefined && v !== null && v !== '';
  return (
    <div {...attrs} role="textbox" aria-readonly="true" tabIndex={0} className={cn('min-h-10 flex-1 whitespace-pre-wrap px-2 py-1.5', has ? '' : 'text-[#9a9a9a]', cls(p))}>
      {has ? str(v) : str(p.placeholder, '输入消息…')}
    </div>
  );
}
function PromptInputSubmit({ node, p, disabled }: NodeProps) {
  const attrs = useRootAttrs(node, disabled);
  return (
    <button {...attrs} type="button" aria-label="发送" className={cn('jbox inline-flex size-9 shrink-0 items-center justify-center rounded-full', disabled && 'cursor-not-allowed', cls(p))}>
      <Rough seedKey={node.id} shape="ellipse" fill={disabled ? '#d4d4d4' : INK} fillStyle="solid" />
      <span className="text-white [.jstage[data-theme=clean]_&]:text-[#1e1e1e]">↑</span>
    </button>
  );
}

// ============ 注册表：目录中每个类型都必须有实现（类型检查保证） ============

const IMPL: Record<ComponentType, (props: NodeProps) => ReactNode> = {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Dialog: OverlayRoot,
  DialogContent: OverlayContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Sheet: OverlayRoot,
  SheetContent: OverlayContent,
  SheetHeader: DialogHeader,
  SheetTitle: DialogTitle,
  SheetDescription: DialogDescription,
  SheetFooter: DialogFooter,
  AlertDialog: OverlayRoot,
  AlertDialogContent: OverlayContent,
  AlertDialogHeader: DialogHeader,
  AlertDialogTitle: DialogTitle,
  AlertDialogDescription: DialogDescription,
  AlertDialogFooter: DialogFooter,
  TabsList,
  TabsContent,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  DataTable,
  Alert,
  AlertTitle,
  AlertDescription,
  Badge,
  Avatar,
  Separator,
  Skeleton,
  Progress,
  Label,
  ScrollArea,
  SelectTrigger: Hidden,
  SelectValue: Hidden,
  SelectContent: Hidden,
  SelectItem: Hidden,
  RadioGroupItem,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  Conversation,
  Message,
  MessageContent,
  Response,
  Reasoning,
  Tool,
  ToolHeader,
  ToolContent,
  Loader,
  PromptInput,
  ...(Object.fromEntries(HTML_TAGS.map((t) => [t, htmlImpl(t)])) as Record<HtmlTag, (props: NodeProps) => ReactNode>),
  Placeholder,
  Custom,
  '#text': TextNode,
  Button,
  Input,
  Textarea,
  Select,
  Checkbox,
  RadioGroup,
  Switch,
  Tabs,
  TabsTrigger,
  SidebarMenuButton,
  Link: Anchor,
  a: Anchor,
  PromptInputTextarea,
  PromptInputSubmit,
};

/** 渲染一个场景节点（及其可见的子节点）。 */
export function RenderNode({ node }: { node: SceneNode }) {
  const { state } = useCtx();
  if (!isSelfVisible(node, state)) return null;
  const p = resolveProps(node, state);
  const disabled = isNodeDisabled(node, state);
  const Impl = IMPL[node.type];
  const children = (node.children ?? []).map((c) => <RenderNode key={c.id} node={c} />);
  return (
    <Impl node={node} p={p} disabled={disabled}>
      {children}
    </Impl>
  );
}
