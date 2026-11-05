/**
 * 看板控件原语（D55「设计 Token v1」的“控件与状态”）：按钮、分段控件、下拉菜单、快捷键标记、开关。看板与发布站共用。
 * - 只用看板 Token（bg-jb-* / text-jb-* / border-jb-*）；全屏的深色控制条在 .jb-dark 里，Token 自动换成深色。
 * - 六种状态：默认 / 悬停（只加深底色，不改布局）/ 按下 / 选中或开（浅黄底 + 1.5px 墨线）/ 键盘焦点（2px 深黄环，外移 2px）/ 禁用（40%）。
 * - 文字一律不换行；收起成图标的按钮，悬停提示里写全称和快捷键（useTip）。
 * - 菜单用 Popover（portal），不会被父级的 overflow 裁掉。
 */
import { useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { Check, ChevronDown, Clapperboard, Ellipsis } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, useTip } from './popover';
import type { Placement } from './popover-place';

export type MenuItem = { id: string; label: string; onClick: () => void; checked?: boolean; disabled?: boolean; icon?: ReactNode; hint?: ReactNode; /** 第二行小字（例如功能的选定方案与缺口数）。 */ description?: string };
export type MenuEntry = MenuItem | { id: string; divider: true } | { id: string; custom: ReactNode };

/** 元素的可用宽度（ResizeObserver）。返回回调 ref：元素晚出现（例如进入全屏后才渲染）也能测到。 */
export function useWidth(fallback = 1000): [(el: HTMLElement | null) => void, number] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, w];
}

export type BtnSize = 28 | 32 | 34 | 36;
export type BtnVariant = 'default' | 'primary' | 'play' | 'ghost';
const H: Record<BtnSize, string> = { 28: 'h-7', 32: 'h-8', 34: 'h-[34px]', 36: 'h-9' };
const W: Record<BtnSize, string> = { 28: 'w-7', 32: 'w-8', 34: 'w-[34px]', 36: 'w-9' };

const base = 'jb-focus inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] font-jb text-[13px] font-medium leading-none transition-colors disabled:pointer-events-none disabled:opacity-40';
const VARIANT: Record<BtnVariant, { off: string; on: string }> = {
  default: { off: 'border border-jb-line bg-jb-surface text-jb-fg hover:bg-jb-hover active:bg-jb-press', on: 'border-[1.5px] border-jb-ink bg-jb-selected text-jb-fg' },
  primary: { off: 'bg-jb-inverse text-jb-on-inverse hover:bg-jb-inverse-hover active:bg-jb-inverse-press', on: 'bg-jb-inverse text-jb-on-inverse' },
  play: { off: 'border-[1.5px] border-jb-ink bg-jb-accent font-bold text-jb-on-accent hover:bg-jb-accent-hover active:bg-jb-accent-press', on: 'border-[1.5px] border-jb-ink bg-jb-accent font-bold text-jb-on-accent' },
  ghost: { off: 'text-jb-fg hover:bg-jb-hover active:bg-jb-press', on: 'bg-jb-selected text-jb-fg' },
};

/** 悬停提示的内容：文字 + 可选的快捷键。 */
export function TipText({ text, kbd }: { text: ReactNode; kbd?: string }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span>{text}</span>
      {kbd ? <span className="font-jb-mono text-[11px] opacity-70">{kbd}</span> : null}
    </span>
  );
}

type BtnProps = {
  icon?: ReactNode;
  label: string;
  iconOnly?: boolean;
  iconAfter?: boolean;
  size?: BtnSize;
  variant?: BtnVariant;
  /** 选中 / 开（aria-pressed）。 */
  selected?: boolean;
  /** 悬停提示（缺省：只有图标时写 label）。 */
  title?: string;
  /** 悬停提示里的快捷键。 */
  kbd?: string;
  tipPlacement?: Placement;
  className?: string;
  children?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'title'>;

/** 按钮：icon + 文字；iconOnly 时只有图标，文字作为悬停提示与无障碍标签。children 放在文字后面（例如色块、快捷键）。 */
export function Btn({ icon, label, iconOnly = false, iconAfter = false, size = 32, variant = 'default', selected, title, kbd, tipPlacement, className, children, ref, ...rest }: BtnProps) {
  const tipText = title ?? (iconOnly ? label : null);
  const [tip, tipNode] = useTip(tipText || kbd ? <TipText text={tipText ?? label} kbd={kbd} /> : null, { placement: tipPlacement });
  const v = VARIANT[variant];
  const call = <E,>(a?: (e: E) => void, b?: (e: E) => void) => (a || b ? (e: E) => (a?.(e), b?.(e)) : undefined);
  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={iconOnly ? label : rest['aria-label']}
        aria-pressed={selected === undefined ? rest['aria-pressed'] : selected}
        {...rest}
        onMouseEnter={call(tip.onMouseEnter, rest.onMouseEnter)}
        onMouseLeave={call(tip.onMouseLeave, rest.onMouseLeave)}
        onFocus={call(tip.onFocus, rest.onFocus)}
        onBlur={call(tip.onBlur, rest.onBlur)}
        onPointerDown={call(tip.onPointerDown, rest.onPointerDown)}
        aria-describedby={tip['aria-describedby'] ?? rest['aria-describedby']}
        className={cn(base, selected ? v.on : v.off, H[size], iconOnly ? W[size] : size >= 34 ? 'px-3' : 'px-2.5', className)}
      >
        {!iconAfter ? icon : null}
        {iconOnly ? null : <span>{label}</span>}
        {children}
        {iconAfter ? icon : null}
      </button>
      {tipNode}
    </>
  );
}

/** 快捷键标记：浅灰底、细线、等宽 11px。 */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn('inline-flex h-[17px] min-w-[17px] shrink-0 items-center justify-center rounded-[4px] border border-jb-line bg-jb-sunken px-[5px] font-jb-mono text-[11px] leading-none font-normal text-jb-muted', className)}>{children}</kbd>;
}

/** 分段控件：轨道底色 sunken、圆角 8、内边距 3；选中项白底 + 1.5px 墨线。value = null 时不高亮任何一项。方向键切换。 */
export function Segmented<T extends string>({ value, items, onChange, label, testid, full, size = 32 }: { value: T | null; items: { value: T; label: ReactNode; testid?: string; title?: string; icon?: ReactNode }[]; onChange: (v: T) => void; label: string; testid?: string; full?: boolean; size?: 32 | 36 }) {
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = items[(i + d + items.length) % items.length]!;
    onChange(next.value);
    ((e.currentTarget.parentElement?.children[(i + d + items.length) % items.length] as HTMLElement | undefined) ?? null)?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex shrink-0 items-center gap-[3px] rounded-[8px] bg-jb-sunken p-[3px]', size === 32 ? 'h-8' : 'h-9', full && 'w-full')} data-testid={testid}>
      {items.map((it, i) => {
        const on = value === it.value;
        return (
          <button
            key={it.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (value === null && i === 0) ? 0 : -1}
            title={it.title}
            data-testid={it.testid}
            onClick={() => onChange(it.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              'jb-focus flex h-full min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] px-3 font-jb text-[13px] leading-none',
              full && 'flex-1 truncate',
              on ? 'border-[1.5px] border-jb-ink bg-jb-surface font-semibold text-jb-fg' : 'text-jb-muted hover:bg-jb-hover hover:text-jb-fg',
            )}
          >
            {it.icon}
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/** 菜单项列表（菜单浮层的内容）：上下方向键移动，Home / End 到头尾。 */
export function MenuList({ items, onPick, testid }: { items: MenuEntry[]; onPick: (it: MenuItem) => void; testid?: string }) {
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const list = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-menu-item]:not([disabled])')];
    if (!list.length) return;
    const i = list.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      list[(n + list.length) % list.length]!.focus();
    };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i < 0 ? list.length - 1 : i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(list.length - 1);
  };
  return (
    <div className="flex flex-col p-1" onKeyDown={onKey} data-testid={testid}>
      {items.map((it) =>
        'divider' in it ? (
          <div key={it.id} role="separator" className="mx-1 my-1 h-px bg-jb-line" />
        ) : 'custom' in it ? (
          <div key={it.id}>{it.custom}</div>
        ) : (
          <button
            key={it.id}
            type="button"
            role={it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={it.checked}
            disabled={it.disabled}
            data-menu-item=""
            data-testid={`menu-${it.id}`}
            onClick={() => onPick(it)}
            className={cn('jb-focus flex w-full shrink-0 items-center gap-2.5 whitespace-nowrap rounded-[6px] px-2.5 text-left font-jb text-[13px] text-jb-fg hover:bg-jb-hover focus-visible:bg-jb-hover disabled:pointer-events-none disabled:opacity-40', it.description ? 'py-1.5' : 'h-8', it.checked && it.description && 'bg-jb-selected hover:bg-jb-selected')}
          >
            {it.icon ? <span className="flex size-4 shrink-0 items-center justify-center [&_svg]:size-4">{it.icon}</span> : null}
            {it.description ? (
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={cn('truncate', it.checked && 'font-semibold')}>{it.label}</span>
                <span className="truncate text-[12px] text-jb-muted">{it.description}</span>
              </span>
            ) : (
              <span className="min-w-0 flex-1 truncate">{it.label}</span>
            )}
            {it.hint ? <span className="shrink-0 font-jb-mono text-[11px] text-jb-faint">{it.hint}</span> : null}
            {it.checked ? <Check className="size-4 shrink-0" aria-hidden /> : null}
          </button>
        ),
      )}
    </div>
  );
}

/** 下拉菜单按钮：「导出 ▾」「速度 ▾」、收起后的层级切换等。菜单是 portal 浮层（e1），放不下时自动翻到另一侧。 */
export function MenuButton({
  trigger,
  items,
  label,
  testid,
  placement = 'bottom-end',
  size = 32,
  width = 240,
  variant = 'default',
  kbd,
  className,
  tipPlacement,
  chevron,
}: {
  trigger: { icon?: ReactNode; label?: string; iconOnly?: boolean; extra?: ReactNode };
  items: MenuEntry[];
  label: string;
  testid?: string;
  placement?: Placement;
  size?: BtnSize;
  width?: number;
  variant?: BtnVariant;
  kbd?: string;
  className?: string;
  tipPlacement?: Placement;
  /** 展开标记（缺省 ▾）。 */
  chevron?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [byKey, setByKey] = useState(false);
  const btn = useRef<HTMLButtonElement | null>(null);
  const iconOnly = trigger.iconOnly ?? !trigger.label;
  return (
    <>
      <Btn
        ref={btn}
        icon={iconOnly ? (trigger.icon ?? <Ellipsis className="size-4" />) : trigger.icon}
        label={trigger.label ?? label}
        title={iconOnly ? label : undefined}
        kbd={kbd}
        iconOnly={iconOnly}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        selected={open || undefined}
        onClick={(e) => {
          setByKey(e.detail === 0);
          setOpen((o) => !o);
        }}
        data-testid={testid}
        size={size}
        variant={variant}
        className={className}
        tipPlacement={tipPlacement}
      >
        {trigger.extra}
        {!iconOnly ? (chevron ?? <ChevronDown className="size-3.5 text-jb-muted" aria-hidden />) : null}
      </Btn>
      <Popover open={open} anchor={btn.current} onClose={() => setOpen(false)} placement={placement} role="menu" label={label} width={width} testid={testid ? `${testid}-list` : 'menu'} autoFocus={byKey}>
        <MenuList
          items={items}
          onPick={(it) => {
            setOpen(false);
            it.onClick();
          }}
        />
      </Popover>
    </>
  );
}

/** 开关：胶囊轨道（开 = 黄底墨线），右侧文字。 */
export function Switch({ on, onChange, label, testid, title, className }: { on: boolean; onChange: (on: boolean) => void; label: string; testid?: string; title?: string; className?: string }) {
  const [tip, tipNode] = useTip(title ?? null);
  return (
    <>
      <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} data-testid={testid} className={cn('jb-focus inline-flex h-7 shrink-0 items-center gap-2 whitespace-nowrap rounded-[6px] px-1.5 font-jb text-[13px] font-medium text-jb-fg hover:bg-jb-hover', className)} {...tip}>
        <span aria-hidden className={cn('relative h-[18px] w-[30px] shrink-0 rounded-full border-[1.5px] border-jb-ink transition-colors', on ? 'bg-jb-accent' : 'bg-jb-surface')}>
          <span className={cn('absolute top-[1.5px] size-3 rounded-full bg-jb-inverse transition-[left]', on ? 'left-[13.5px]' : 'left-[1.5px]')} />
        </span>
        {label}
      </button>
      {tipNode}
    </>
  );
}

/** 导演状态（全屏控制条用）：开启时“🎬 导演 · 后端流转”，点一下转为手动；暂停时“🎬 导演已暂停”，点一下恢复。 */
export function DirectorTag({ on, layerTitle, onToggle }: { on: boolean; layerTitle: string; onToggle: () => void }) {
  return (
    <Btn icon={<Clapperboard className="size-4" aria-hidden />} label={on ? `导演 · ${layerTitle}` : '导演已暂停'} size={32} variant="ghost" selected={on} onClick={onToggle} data-testid="director" title={on ? '导演跟随每一步切换层级与镜头；点一下改为手动' : '恢复导演：回到这一步的导演层'} />
  );
}
