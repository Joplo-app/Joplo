/**
 * 组件目录（@joplo/core catalog）中每个类型对应的低保真 React 实现。
 * - 根 DOM 带 data-jid / data-jtype；可交互组件带 data-jinteractive。
 * - props 用 resolveProps 解析，可见性用 isSelfVisible，禁用用 isNodeDisabled。
 * - 只用 React 文本节点渲染内容（不可信文本），不使用 dangerouslySetInnerHTML。
 */
import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { INTERACTIVE_TYPES, isNodeDisabled, isSelfVisible, nodeLabel, resolveProps, type PlayState, type Scene, type SceneNode } from '@joplo/core';
import { Button as UiButton } from '@/components/ui/button';
import { Badge as UiBadge } from '@/components/ui/badge';
import { Input as UiInput } from '@/components/ui/input';
import { Textarea as UiTextarea } from '@/components/ui/textarea';
import { Checkbox as UiCheckbox } from '@/components/ui/checkbox';
import { Switch as UiSwitch } from '@/components/ui/switch';
import { Progress as UiProgress } from '@/components/ui/progress';
import { Avatar as UiAvatar, AvatarFallback } from '@/components/ui/avatar';
import { Table as UiTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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

const str = (v: unknown, fallback = ''): string => (v === undefined || v === null ? fallback : typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(v));
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const INK = '#1e1e1e';
const SOFT = '#9a9a9a';
const TONE: Record<string, string> = { default: INK, muted: '#6b6b6b', danger: '#c92a2a', error: '#c92a2a', success: '#2b8a3e', warning: '#b35c00', info: '#1c5fb8' };
const TONE_BG: Record<string, string> = { error: '#fff0f0', danger: '#fff0f0', success: '#effaf1', warning: '#fff7e6', info: '#eef4ff', default: '#f4f4f4', muted: '#f4f4f4' };

type NodeProps = { node: SceneNode; p: Record<string, unknown>; disabled: boolean; children: ReactNode };

/** 每个组件根 DOM 共用的属性。 */
function useRootAttrs(node: SceneNode, p: Record<string, unknown>, disabled: boolean) {
  const ctx = useCtx();
  const interactive = INTERACTIVE_TYPES.has(node.type);
  return {
    'data-jid': node.id,
    'data-jtype': node.type,
    'data-jlabel': nodeLabel({ type: node.type, props: p }),
    ...(interactive ? { 'data-jinteractive': '' } : {}),
    ...(GROW.has(node.type) ? { 'data-jgrow': '' } : {}),
    ...(INLINE.has(node.type) ? { 'data-jinline': '' } : {}),
    ...(disabled ? { 'data-jdisabled': '', 'aria-disabled': true as const } : {}),
    ...(node.unmodeled ? { 'data-junmodeled': '' } : {}),
    ...(ctx.selectedId === node.id ? { 'data-jselected': '' } : {}),
  };
}

function inputValue(node: SceneNode): unknown {
  const { state, preview } = useCtx();
  if (preview && preview.nodeId === node.id) return preview.text;
  return state.inputs[node.id];
}

// ---------------- 结构 ----------------

function Page({ node, p, children }: NodeProps) {
  const attrs = useRootAttrs(node, p, false);
  return (
    <div {...attrs} className="flex h-full w-full flex-col">
      {p.title ? (
        <div className="jbox flex h-10 shrink-0 items-center px-4 text-sm text-[#6b6b6b] [.jstage[data-theme=clean]_&]:border-b-[#c8c8c8]" data-noborder="">
          <Rough seedKey={`${node.id}:bar`} shape="underline" stroke={SOFT} strokeWidth={1} />
          <span className="jtrunc">{str(p.title)}</span>
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-5">{children}</div>
    </div>
  );
}

function Header({ node, p, children }: NodeProps) {
  const attrs = useRootAttrs(node, p, false);
  return (
    <div {...attrs} className="jbox flex items-center justify-between gap-3 px-4 py-3">
      <Rough seedKey={node.id} shape="underline" />
      <span className="jtrunc text-lg font-semibold">{str(p.title)}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function Sidebar({ node, p, children }: NodeProps) {
  const attrs = useRootAttrs(node, p, false);
  return (
    <div {...attrs} className="jbox flex w-[200px] shrink-0 flex-col gap-1 self-stretch p-3" data-soft="">
      <Rough seedKey={node.id} stroke={SOFT} />
      {p.title ? <div className="jtrunc mb-2 px-2 font-semibold">{str(p.title)}</div> : null}
      {children}
    </div>
  );
}

const GROW = new Set(['Stack', 'Card', 'Section', 'Table', 'List', 'Image', 'EmptyState', 'Textarea', 'Custom', 'Progress', 'Tabs', 'PromptInput', 'Input', 'Select']);
const INLINE = new Set(['Button', 'Link', 'Badge', 'Avatar', 'Checkbox', 'Switch', 'Spinner']);

function Stack({ node, p, children }: NodeProps) {
  const attrs = useRootAttrs(node, p, false);
  const row = p.direction === 'row';
  const gap = typeof p.gap === 'number' ? p.gap : 8;
  const align = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' }[str(p.align)] ?? (row ? 'flex-start' : 'stretch');
  const justify = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between' }[str(p.justify)] ?? 'flex-start';
  const style: CSSProperties = { display: 'flex', flexDirection: row ? 'row' : 'column', gap, alignItems: align, justifyContent: justify, flexWrap: p.wrap ? 'wrap' : 'nowrap', minWidth: 0, minHeight: 0 };
  return (
    <div {...attrs} style={style} data-jrow={row ? '' : undefined} className={cn(row ? '[&>[data-jgrow]]:min-w-0 [&>[data-jgrow]]:flex-1' : '[&>[data-jinline]]:self-start')}>
      {children}
    </div>
  );
}

function Card({ node, p, children }: NodeProps) {
  const attrs = useRootAttrs(node, p, false);
  return (
    <div {...attrs} className="jbox flex flex-col gap-3 bg-white p-4 [.jstage[data-theme=clean]_&]:rounded-md">
      <Rough seedKey={node.id} />
      {p.title ? <div className="jtrunc text-base font-semibold">{str(p.title)}</div> : null}
      {children}
    </div>
  );
}

function Section({ node, p, children }: NodeProps) {
  const attrs = useRootAttrs(node, p, false);
  return (
    <div {...attrs} className="flex flex-col gap-2">
      {p.title ? (
        <div className="jbox self-start pb-0.5 pr-2 font-semibold" data-noborder="">
          <Rough seedKey={`${node.id}:u`} shape="underline" stroke={SOFT} strokeWidth={1} />
          <span>{str(p.title)}</span>
        </div>
      ) : null}
      {children}
    </div>
  );
}

function Tabs({ node, p, disabled, children }: NodeProps) {
  const attrs = useRootAttrs(node, p, disabled);
  const items = arr(p.items).map((x) => str(x));
  const v = inputValue(node);
  const active = typeof v === 'string' ? v : typeof p.active === 'string' ? p.active : items[0];
  return (
    <div {...attrs} className="flex flex-col gap-3" role="tablist" tabIndex={0}>
      <div className="flex gap-1">
        {items.map((it) => (
          <div key={it} role="tab" aria-selected={it === active} className={cn('jbox px-3 py-1 text-sm', it === active ? 'font-semibold [.jstage[data-theme=clean]_&]:border-b-2 [.jstage[data-theme=clean]_&]:border-b-[#1e1e1e]' : 'text-[#6b6b6b]')} data-noborder="">
            {it === active ? <Rough seedKey={`${node.id}:${it}`} shape="underline" strokeWidth={2} /> : null}
            <span>{it}</span>
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}

function Divider({ node, p }: NodeProps) {
  const attrs = useRootAttrs(node, p, false);
  return (
    <div {...attrs} className="jbox h-2 w-full" data-soft="" data-noborder="">
      <Rough seedKey={node.id} shape="line" stroke={SOFT} strokeWidth={1} />
      <div className="absolute inset-x-0 top-1/2 h-px bg-[#c8c8c8] [.jstage[data-theme=sketch]_&]:hidden" />
    </div>
  );
}

// ---------------- 内容 ----------------

function Heading({ node, p }: NodeProps) {
  const attrs = useRootAttrs(node, p, false);
  const level = Number(p.level ?? 2);
  const size = level === 1 ? 'text-[26px]' : level === 2 ? 'text-[21px]' : 'text-[18px]';
  return (
    <div {...attrs} role="heading" aria-level={level} className={cn('font-bold leading-tight', size)}>
      {str(p.text)}
    </div>
  );
}

function Text({ node, p }: NodeProps) {
  const attrs = useRootAttrs(node, p, false);
  const size = p.size === 'sm' ? 'text-[13px]' : p.size === 'lg' ? 'text-[18px]' : '';
  return (
    <div {...attrs} className={size} style={{ color: TONE[str(p.tone, 'default')] ?? INK }}>
      {str(p.text)}
    </div>
  );
}

function Image({ node, p }: NodeProps) {
  const attrs = useRootAttrs(node, p, false);
  const h = typeof p.height === 'number' ? p.height : 120;
  return (
    <div {...attrs} className="jbox flex items-center justify-center bg-[#fafafa] text-sm text-[#6b6b6b]" data-soft="" style={{ height: h }}>
      <Rough seedKey={node.id} stroke={SOFT} fill="#e9e9e9" fillStyle="cross-hatch" />
      <span className="rounded bg-white/90 px-2">{str(p.label, '占位图')}</span>
    </div>
  );
}

function List({ node, p }: NodeProps) {
  const attrs = useRootAttrs(node, p, false);
  const items = arr(p.items);
  return (
    <ul {...attrs} className="flex flex-col gap-1 pl-1">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2">
          <span aria-hidden>•</span>
          <span>{it && typeof it === 'object' ? Object.values(it).map((x) => str(x)).join(' · ') : str(it)}</span>
        </li>
      ))}
    </ul>
  );
}

function Table({ node, p }: NodeProps) {
  const attrs = useRootAttrs(node, p, false);
  const cols = arr(p.columns).map((c) => (c && typeof c === 'object' ? (c as { key?: unknown; label?: unknown }) : { key: c, label: c })).map((c) => ({ key: str(c.key), label: str(c.label ?? c.key) }));
  const rows = arr(p.rows);
  return (
    <div {...attrs} className="jbox bg-white px-1 [.jstage[data-theme=clean]_&]:rounded-md" data-soft="">
      <Rough seedKey={node.id} stroke="#5a5a5a" strokeWidth={1.1} />
      <UiTable className="text-[14px]">
        <TableHeader>
          <TableRow className="border-b-[#d0d0d0] hover:bg-transparent">
            {cols.map((c) => (
              <TableHead key={c.key} className="h-9 font-semibold text-[#1e1e1e]">
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={Math.max(cols.length, 1)} className="py-4 text-center text-[#6b6b6b]">
                {str(p.empty, '暂无数据')}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r, i) => (
              <TableRow key={i} className="border-b-[#e4e4e4] hover:bg-transparent" data-jrow-index={i}>
                {cols.map((c) => (
                  <TableCell key={c.key} className="py-2">
                    {r && typeof r === 'object' ? str((r as Record<string, unknown>)[c.key]) : str(r)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </UiTable>
    </div>
  );
}

function Badge({ node, p }: NodeProps) {
  const attrs = useRootAttrs(node, p, false);
  const tone = str(p.tone, 'default');
  return (
    <UiBadge {...attrs} variant="outline" className="jbox rounded-full px-2.5 text-[13px] font-normal" style={{ color: TONE[tone] ?? INK, background: TONE_BG[tone] }}>
      <Rough seedKey={node.id} shape="ellipse" stroke={TONE[tone] ?? INK} strokeWidth={1} inset={1} />
      <span className="jtrunc" data-jtext="">
        {str(p.text)}
      </span>
    </UiBadge>
  );
}

function Avatar({ node, p }: NodeProps) {
  const attrs = useRootAttrs(node, p, false);
  const name = str(p.name, '?');
  return (
    <div {...attrs} className="flex items-center gap-2">
      <UiAvatar className="jbox size-9 overflow-visible">
        <Rough seedKey={node.id} shape="ellipse" />
        <AvatarFallback className="bg-transparent text-sm">{name.slice(0, 1)}</AvatarFallback>
      </UiAvatar>
    </div>
  );
}

// ---------------- 输入 ----------------

const BTN: Record<string, { stroke: string; fill?: string; text: string; ui: 'default' | 'outline' | 'ghost' | 'destructive' }> = {
  primary: { stroke: INK, fill: INK, text: '#ffffff', ui: 'default' },
  secondary: { stroke: INK, text: INK, ui: 'outline' },
  ghost: { stroke: 'transparent', text: INK, ui: 'ghost' },
  danger: { stroke: '#c92a2a', text: '#c92a2a', ui: 'outline' },
};

function Button({ node, p, disabled }: NodeProps) {
  const attrs = useRootAttrs(node, p, disabled);
  const v = BTN[str(p.variant, 'secondary')] ?? BTN.secondary!;
  const theme = useStageTheme();
  const dis = disabled;
  const stroke = dis ? '#9a9a9a' : v.stroke;
  const fill = dis ? (v.fill ? '#d4d4d4' : undefined) : v.fill;
  const color = dis ? (v.fill ? '#5a5a5a' : '#8a8a8a') : v.text;
  return (
    <UiButton
      {...attrs}
      type="button"
      variant={v.ui}
      data-variant={str(p.variant, 'secondary')}
     
      className={cn(
        'jbox h-10 max-w-[260px] shrink-0 px-5 text-[15px] shadow-none',
        theme === 'sketch' && 'border-transparent bg-transparent hover:bg-black/[0.03]',
        theme === 'clean' && dis && 'border-dashed border-[#9a9a9a] bg-[#ececec] text-[#6b6b6b] hover:bg-[#ececec]',
        dis && 'cursor-not-allowed',
      )}
      style={theme === 'sketch' ? { color } : undefined}
      data-dashed={dis ? '' : undefined}
      data-tone={str(p.variant) === 'danger' ? 'danger' : undefined}
    >
      <Rough seedKey={node.id} stroke={stroke} fill={fill} fillStyle={fill ? 'solid' : undefined} dashed={dis} strokeWidth={1.4} />
      <span className="jtrunc" data-jtext="">
        {str(p.label, '按钮')}
      </span>
    </UiButton>
  );
}

function Link({ node, p, disabled }: NodeProps) {
  const attrs = useRootAttrs(node, p, disabled);
  const active = Boolean(p.active);
  return (
    <a
      {...attrs}
      role="link"
      tabIndex={0}
     
      className={cn('jbox block w-full rounded px-2 py-1.5', active ? 'font-semibold' : '', disabled ? 'text-[#8a8a8a]' : '')}
      data-noborder={active ? undefined : ''}
      data-soft=""
      style={active ? { background: '#f1f1f1' } : undefined}
    >
      {active ? <Rough seedKey={node.id} stroke={SOFT} fill="#ececec" fillStyle="solid" strokeWidth={1} /> : null}
      <span className="jtrunc block" data-jtext="">
        {str(p.label)}
      </span>
    </a>
  );
}

function FieldLabel({ text }: { text: unknown }) {
  return text ? <div className="mb-1 text-[14px] font-medium">{str(text)}</div> : null;
}

function Input({ node, p, disabled }: NodeProps) {
  const attrs = useRootAttrs(node, p, disabled);
  const v = inputValue(node);
  const theme = useStageTheme();
  return (
    <div {...attrs} className="flex w-full flex-col">
      <FieldLabel text={p.label} />
      <div className="jbox">
        <Rough seedKey={node.id} stroke={disabled ? SOFT : INK} />
        <UiInput
          readOnly
          tabIndex={0}
          aria-label={str(p.label, '输入框')}
          type={p.inputType === 'password' ? 'password' : 'text'}
          value={str(v)}
          placeholder={str(p.placeholder)}
          className={cn('h-10 cursor-[inherit] text-[15px] md:text-[15px] placeholder:text-[#9a9a9a]', theme === 'sketch' ? 'border-none shadow-none focus-visible:ring-0' : 'rounded-[3px] border-none shadow-none')}
        />
      </div>
    </div>
  );
}

function Textarea({ node, p, disabled }: NodeProps) {
  const attrs = useRootAttrs(node, p, disabled);
  const v = inputValue(node);
  return (
    <div {...attrs} className="flex w-full flex-col">
      <FieldLabel text={p.label} />
      <div className="jbox">
        <Rough seedKey={node.id} stroke={disabled ? SOFT : INK} />
        <UiTextarea readOnly tabIndex={0} aria-label={str(p.label, '文本域')} value={str(v)} placeholder={str(p.placeholder)} className="min-h-20 resize-none border-none text-[15px] shadow-none placeholder:text-[#9a9a9a] focus-visible:ring-0 md:text-[15px]" />
      </div>
    </div>
  );
}

function Select({ node, p, disabled }: NodeProps) {
  const attrs = useRootAttrs(node, p, disabled);
  const v = inputValue(node);
  const has = v !== undefined && v !== null && v !== '';
  return (
    <div {...attrs} className="flex w-full flex-col">
      <FieldLabel text={p.label} />
      <div className="jbox flex h-10 items-center justify-between px-3" role="combobox" aria-expanded={false} aria-label={str(p.label, '选择器')} tabIndex={0}>
        <Rough seedKey={node.id} stroke={disabled ? SOFT : INK} />
        <span className={cn('jtrunc', has ? '' : 'text-[#9a9a9a]')} data-jtext="">
          {has ? str(v) : str(p.placeholder, '请选择')}
        </span>
        <span aria-hidden className="ml-2 text-[#6b6b6b]">
          ▾
        </span>
      </div>
      {arr(p.options).length > 0 ? <div className="mt-1 text-[12px] text-[#8a8a8a]">可选：{arr(p.options).map((o) => str(o)).join(' / ')}</div> : null}
    </div>
  );
}

function Checkbox({ node, p, disabled }: NodeProps) {
  const attrs = useRootAttrs(node, p, disabled);
  const checked = inputValue(node) === true;
  return (
    <div {...attrs} className="flex items-center gap-2">
      <span className="jbox inline-flex rounded-[3px]" data-noborder="">
        <Rough seedKey={node.id} inset={1} stroke={disabled ? SOFT : INK} />
        <UiCheckbox
          checked={checked}
          tabIndex={0}
          aria-label={str(p.label)}
          className="size-[18px] rounded-[3px] border-[#3a3a3a] shadow-none data-[state=checked]:border-[#1e1e1e] data-[state=checked]:bg-[#1e1e1e] [.jstage[data-theme=sketch]_&]:border-transparent [.jstage[data-theme=sketch]_&]:bg-transparent [.jstage[data-theme=sketch]_&]:text-[#1e1e1e]"
        />
      </span>
      <span data-jtext="">{str(p.label)}</span>
    </div>
  );
}

function Radio({ node, p, disabled }: NodeProps) {
  const attrs = useRootAttrs(node, p, disabled);
  const v = inputValue(node);
  return (
    <div {...attrs} className="flex flex-col gap-1.5" role="radiogroup" tabIndex={0}>
      <FieldLabel text={p.label} />
      {arr(p.options).map((o) => {
        const opt = str(o);
        const on = v === opt;
        return (
          <div key={opt} className="flex items-center gap-2" role="radio" aria-checked={on}>
            <span className="jbox inline-flex size-[18px] items-center justify-center rounded-full [.jstage[data-theme=clean]_&]:border-[#3a3a3a]">
              <Rough seedKey={`${node.id}:${opt}`} shape="ellipse" inset={1} />
              {on ? <span className="size-2 rounded-full bg-[#1e1e1e]" /> : null}
            </span>
            <span>{opt}</span>
          </div>
        );
      })}
    </div>
  );
}

function Switch({ node, p, disabled }: NodeProps) {
  const attrs = useRootAttrs(node, p, disabled);
  const on = inputValue(node) === true;
  return (
    <div {...attrs} className="flex items-center gap-2">
      <UiSwitch checked={on} tabIndex={0} aria-label={str(p.label)} className="data-[state=checked]:bg-[#1e1e1e]" />
      <span data-jtext="">{str(p.label)}</span>
    </div>
  );
}

// ---------------- 反馈 ----------------

function Dialog({ node, p, children }: NodeProps) {
  const attrs = useRootAttrs(node, p, false);
  const { dialogLayer, animate } = useCtx();
  if (!dialogLayer) return null;
  return createPortal(
    <div className="absolute inset-0 z-20 flex items-center justify-center">
      <motion.div data-jbackdrop="" className="absolute inset-0 bg-[rgba(30,30,30,0.38)]" initial={animate ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.18 }} />
      <motion.div
        {...attrs}
        role="dialog"
        aria-modal="true"
        aria-label={str(p.title, '弹窗')}
        className="jbox relative flex w-[480px] max-w-[90%] flex-col gap-4 bg-white p-6 shadow-[6px_6px_0_rgba(30,30,30,0.18)] [.jstage[data-theme=clean]_&]:rounded-md [.jstage[data-theme=clean]_&]:shadow-xl"
        initial={animate ? { opacity: 0, y: 12, scale: 0.98 } : false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22 }}
      >
        <Rough seedKey={node.id} strokeWidth={1.8} />
        {p.title ? <div className="text-[21px] font-bold">{str(p.title)}</div> : null}
        <div className="flex flex-col gap-4">{children}</div>
      </motion.div>
    </div>,
    dialogLayer,
  );
}

const ALERT_ICON: Record<string, string> = { error: '!', warning: '!', success: '✓', info: 'i' };

function Alert({ node, p }: NodeProps) {
  const attrs = useRootAttrs(node, p, false);
  const tone = str(p.tone, 'info');
  const c = TONE[tone] ?? INK;
  return (
    <div {...attrs} role={tone === 'error' ? 'alert' : 'status'} className="jbox flex items-start gap-3 px-4 py-3 [.jstage[data-theme=clean]_&]:border-current" style={{ color: c, background: TONE_BG[tone] }}>
      <Rough seedKey={node.id} stroke={c} />
      <span aria-hidden className="jbox mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[12px] font-bold [.jstage[data-theme=clean]_&]:border-current">
        <Rough seedKey={`${node.id}:i`} shape="ellipse" stroke={c} inset={0.5} strokeWidth={1} />
        <span>{ALERT_ICON[tone] ?? 'i'}</span>
      </span>
      <span className="text-[15px] leading-snug">{str(p.text)}</span>
    </div>
  );
}

function Spinner({ node, p }: NodeProps) {
  const attrs = useRootAttrs(node, p, false);
  const { animate } = useCtx();
  return (
    <div {...attrs} className="flex items-center gap-2 text-[#4a4a4a]" role="status">
      <motion.span
        aria-hidden
        className="inline-block size-4 rounded-full border-2 border-[#1e1e1e] border-t-transparent"
        animate={animate ? { rotate: 360 } : undefined}
        transition={animate ? { repeat: Infinity, ease: 'linear', duration: 0.9 } : undefined}
      />
      <span>{str(p.label, '加载中…')}</span>
    </div>
  );
}

function EmptyState({ node, p }: NodeProps) {
  const attrs = useRootAttrs(node, p, false);
  return (
    <div {...attrs} className="jbox flex flex-col items-center gap-1 px-6 py-8 text-center" data-dashed="" data-soft="">
      <Rough seedKey={node.id} stroke={SOFT} dashed />
      <div className="font-semibold">{str(p.title, '暂无内容')}</div>
      {p.text ? <div className="text-sm text-[#6b6b6b]">{str(p.text)}</div> : null}
    </div>
  );
}

function Progress({ node, p }: NodeProps) {
  const attrs = useRootAttrs(node, p, false);
  const v = Math.max(0, Math.min(100, Number(p.value ?? 0) || 0));
  return (
    <div {...attrs} className="flex flex-col gap-1">
      {p.label ? <div className="text-sm">{str(p.label)}</div> : null}
      <div className="jbox h-3">
        <Rough seedKey={node.id} />
        <UiProgress value={v} className="h-full rounded-none bg-transparent [&>[data-slot=progress-indicator]]:bg-[#1e1e1e]" />
      </div>
    </div>
  );
}

function ChatMessage({ node, p }: NodeProps) {
  const attrs = useRootAttrs(node, p, false);
  const user = p.role === 'user';
  return (
    <div {...attrs} className={cn('flex', user ? 'justify-end' : 'justify-start')}>
      <div className="jbox max-w-[80%] px-4 py-2.5" style={{ background: user ? '#f1f1f1' : '#ffffff' }} data-soft={user ? '' : undefined}>
        <Rough seedKey={node.id} stroke={user ? SOFT : INK} fill={user ? '#efefef' : undefined} fillStyle="solid" />
        <div className="mb-0.5 text-[12px] text-[#8a8a8a]">{user ? '用户' : '助手'}</div>
        <div className="whitespace-pre-wrap">{str(p.text)}</div>
      </div>
    </div>
  );
}

const TOOL_STATUS: Record<string, { text: string; tone: string }> = { running: { text: '运行中', tone: 'info' }, done: { text: '已完成', tone: 'success' }, error: { text: '出错', tone: 'error' } };

function ToolCall({ node, p }: NodeProps) {
  const attrs = useRootAttrs(node, p, false);
  const s = TOOL_STATUS[str(p.status, 'running')] ?? TOOL_STATUS.running!;
  return (
    <div {...attrs} className="jbox flex flex-col gap-1 bg-[#fafafa] px-3 py-2 font-mono text-[13px]" data-soft="">
      <Rough seedKey={node.id} stroke={SOFT} />
      <div className="flex items-center justify-between gap-2">
        <span className="jtrunc">⚙ {str(p.name, '工具调用')}</span>
        <span style={{ color: TONE[s.tone] }}>{s.text}</span>
      </div>
      {p.detail ? <div className="text-[#6b6b6b]">{str(p.detail)}</div> : null}
    </div>
  );
}

function PromptInput({ node, p, disabled }: NodeProps) {
  const attrs = useRootAttrs(node, p, disabled);
  const v = inputValue(node);
  const has = v !== undefined && v !== null && v !== '';
  return (
    <div {...attrs} className="jbox flex min-h-12 items-center gap-2 px-3 py-2" tabIndex={0} role="textbox" aria-readonly="true" aria-label={str(p.placeholder, '输入提示词')}>
      <Rough seedKey={node.id} />
      <span className={cn('flex-1', has ? '' : 'text-[#9a9a9a]')}>{has ? str(v) : str(p.placeholder, '输入消息…')}</span>
      <span aria-hidden className="jbox inline-flex size-8 items-center justify-center rounded-full">
        <Rough seedKey={`${node.id}:send`} shape="ellipse" fill={INK} fillStyle="solid" />
        <span className="text-white [.jstage[data-theme=clean]_&]:text-[#1e1e1e]">↑</span>
      </span>
    </div>
  );
}

function Custom({ node, p }: NodeProps) {
  const attrs = useRootAttrs(node, p, false);
  return (
    <div {...attrs} className="jbox flex min-h-24 flex-col items-center justify-center gap-1 bg-[repeating-linear-gradient(45deg,#fafafa,#fafafa_8px,#f2f2f2_8px,#f2f2f2_16px)] p-4 text-center" data-dashed="">
      <Rough seedKey={node.id} dashed stroke="#5a5a5a" />
      <div className="font-semibold">自定义组件：{str(p.kind, '未命名')}（演示占位）</div>
      <div className="text-[12px] text-[#6b6b6b]">目录中没有的组件，按声明的元素 ID 与状态接口演示</div>
    </div>
  );
}

const IMPL: Record<SceneNode['type'], (props: NodeProps) => ReactNode> = {
  Page,
  Header,
  Sidebar,
  Stack,
  Card,
  Section,
  Tabs,
  Divider,
  Heading,
  Text,
  Image,
  List,
  Table,
  Badge,
  Avatar,
  Button,
  Link,
  Input,
  Textarea,
  Select,
  Checkbox,
  Radio,
  Switch,
  Dialog,
  Alert,
  Spinner,
  EmptyState,
  Progress,
  ChatMessage,
  ToolCall,
  PromptInput,
  Custom,
};

/** 渲染一个场景节点（及其可见的子节点）。 */
export function RenderNode({ node }: { node: SceneNode }) {
  const { state } = useCtx();
  if (!isSelfVisible(node, state)) return null;
  const p = resolveProps(node, state);
  const disabled = isNodeDisabled(node, state);
  const Impl = IMPL[node.type];
  const children = (node.children ?? []).map((c) => <RenderNode key={c.id} node={c} />);
  const el = <Impl node={node} p={p} disabled={disabled}>{children}</Impl>;
  return el;
}
