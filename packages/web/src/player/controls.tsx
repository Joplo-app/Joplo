import { useI18n } from '../i18n/context';
/**
 * 看板控件原语（基于 @tokenroll/juice/primitives 构建，继承看板 Token --jb-*）：
 * - 按钮（Juice Button）、快捷键（Juice Kbd）、分段控件（.j-seg / .j-seg-btn）、下拉菜单（.j-menu-list / .j-menu-item + Juice Separator）、开关（.j-switch）。
 * - 全屏的深色控制条在 .jb-dark 里，Token 自动映射到深色阶梯。
 * - 文字一律不换行（whitespace-nowrap）；收起成图标的按钮，悬停提示里写全称和快捷键（useTip）。
 */
import { useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { Check, ChevronDown, Clapperboard, Ellipsis } from 'lucide-react';
import { Button as JuiceButton, Kbd as JuiceKbd, Separator as JuiceSeparator } from '@tokenroll/juice/primitives';
import { cn } from '@/lib/utils';
import { Popover, useTip } from './popover';
import type { Placement } from './popover-place';

export type MenuItem = { lang?: string; highlight?: boolean; radio?: boolean; id: string; label: string; onClick: () => void; checked?: boolean; disabled?: boolean; icon?: ReactNode; hint?: ReactNode; /** 第二行小字（例如功能的选定方案与缺口数）。 */ description?: string; /** cloud：蓝底白字，单独标出（D76「发布到 Joplo Cloud」）。 */ tone?: 'cloud' };
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
const W: Record<BtnSize, string> = { 28: 'w-7 px-0', 32: 'w-8 px-0', 34: 'w-[34px] px-0', 36: 'w-9 px-0' };
const JUICE_SIZE: Record<BtnSize, 'xs' | 'sm' | 'md'> = { 28: 'xs', 32: 'sm', 34: 'sm', 36: 'md' };
const JUICE_VARIANT: Record<BtnVariant, 'primary' | 'secondary' | 'ghost'> = {
  default: 'secondary',
  primary: 'primary',
  play: 'primary',
  ghost: 'ghost',
};

const base = 'jb-focus shrink-0 gap-1.5 whitespace-nowrap rounded-[8px] font-jb text-[13px] font-medium leading-none disabled:pointer-events-none';
const VARIANT: Record<BtnVariant, { off: string; on: string }> = {
  default: {
    off: 'bg-jb-sunken/70 text-jb-fg hover:bg-jb-press',
    on: 'bg-jb-selected font-semibold text-jb-fg shadow-[inset_0_0_0_1.5px_var(--jb-border-strong)] hover:bg-jb-selected',
  },
  primary: {
    off: 'bg-jb-inverse text-jb-on-inverse hover:bg-jb-inverse-hover active:bg-jb-inverse-press',
    on: 'bg-jb-inverse text-jb-on-inverse',
  },
  play: {
    off: 'bg-jb-accent font-bold text-jb-on-accent shadow-[inset_0_0_0_1.5px_var(--jb-border-strong)] hover:bg-jb-accent-hover active:bg-jb-accent-press',
    on: 'bg-jb-accent font-bold text-jb-on-accent shadow-[inset_0_0_0_1.5px_var(--jb-border-strong)]',
  },
  ghost: {
    off: 'text-jb-fg hover:bg-jb-hover active:bg-jb-press',
    on: 'bg-jb-selected font-semibold text-jb-fg hover:bg-jb-selected',
  },
};

/** 悬停提示的内容：文字 + 可选的快捷键。 */
export function TipText({ text, kbd }: { text: ReactNode; kbd?: string }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span>{text}</span>
      {kbd ? <JuiceKbd className="j-tooltip-kbd">{kbd}</JuiceKbd> : null}
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

/** 按钮（封装 Juice Button）：icon + 文字；iconOnly 时只有图标，文字作为悬停提示与无障碍标签。children 放在文字后面。 */
export function Btn({ icon, label, iconOnly = false, iconAfter = false, size = 32, variant = 'default', selected, title, kbd, tipPlacement, className, children, ref, ...rest }: BtnProps) {
  const tipText = title ?? (iconOnly ? label : null);
  const [tip, tipNode] = useTip(tipText || kbd ? <TipText text={tipText ?? label} kbd={kbd} /> : null, { placement: tipPlacement });
  const v = VARIANT[variant];
  const call = <E,>(a?: (e: E) => void, b?: (e: E) => void) => (a || b ? (e: E) => (a?.(e), b?.(e)) : undefined);
  return (
    <>
      <JuiceButton
        ref={ref}
        variant={JUICE_VARIANT[variant]}
        size={JUICE_SIZE[size]}
        leftIcon={!iconAfter ? icon : undefined}
        rightIcon={iconAfter ? icon : undefined}
        data-full-label={label}
        data-full-padding={size >= 34 ? 24 : 20}
        aria-label={iconOnly ? label : rest['aria-label']}
        aria-pressed={selected === undefined ? rest['aria-pressed'] : selected}
        {...rest}
        onMouseEnter={call(tip.onMouseEnter, rest.onMouseEnter)}
        onMouseLeave={call(tip.onMouseLeave, rest.onMouseLeave)}
        onFocus={call(tip.onFocus, rest.onFocus)}
        onBlur={call(tip.onBlur, rest.onBlur)}
        onPointerDown={call(tip.onPointerDown, rest.onPointerDown)}
        aria-describedby={tip['aria-describedby'] ?? rest['aria-describedby']}
        className={cn(base, selected ? v.on : v.off, H[size], iconOnly ? W[size] : size >= 34 ? 'px-3' : 'px-2.5', '[&>span]:min-w-0 [&>span]:max-w-full', className)}
      >
        <span data-jb-label="" className={cn('min-w-0 truncate', iconOnly && 'hidden')}>{label}</span>
        {children}
      </JuiceButton>
      {tipNode}
    </>
  );
}

/** 快捷键标记：直接使用 Juice Kbd 同心键帽原语。 */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <JuiceKbd className={cn('h-[18px] min-w-[18px] shrink-0 px-[5px] font-jb-mono text-[11px]', className)}>{children}</JuiceKbd>;
}

/** 分段控件（Juice .j-seg / .j-seg-btn 同心槽位，支持 value = null 与每项 testid，见 TokenRollAI/juice#9）。 */
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
    <div role="radiogroup" aria-label={label} className={cn('j-seg shrink-0 rounded-[10px] p-[3px]', size === 32 ? 'h-8' : 'h-9', full && 'flex w-full')} data-testid={testid}>
      {items.map((it, i) => {
        const on = value === it.value;
        return (
          <button
            key={it.value}
            type="button"
            role="radio"
            aria-checked={on}
            data-active={on ? 'true' : undefined}
            tabIndex={on || (value === null && i === 0) ? 0 : -1}
            title={it.title}
            data-testid={it.testid}
            onClick={() => onChange(it.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              'j-seg-btn jb-focus h-full min-w-0 justify-center gap-1.5 whitespace-nowrap rounded-[7px] px-3 font-jb text-[13px] leading-none',
              full && 'flex-1 truncate',
              on && 'font-semibold',
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

/** 菜单项列表（Juice .j-menu-list / .j-menu-item + Juice Separator）：上下方向键移动，Home / End 到头尾。 */
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
    <div className="j-menu-list bg-transparent p-1.5" onKeyDown={onKey} data-testid={testid}>
      {items.map((it) =>
        'divider' in it ? (
          <JuiceSeparator key={it.id} decorative={false} style={{ margin: '4px 4px' }} />
        ) : 'custom' in it ? (
          <div key={it.id}>{it.custom}</div>
        ) : (
          <button
            key={it.id}
            type="button"
            role={it.radio ? 'menuitemradio' : it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            lang={it.lang}
            aria-checked={it.checked}
            disabled={it.disabled}
            data-menu-item=""
            data-testid={`menu-${it.id}`}
            onClick={() => onPick(it)}
            className={cn(
              'j-menu-item jb-focus w-full shrink-0 justify-start gap-2.5 whitespace-nowrap rounded-[9px] px-2.5 text-left font-jb text-[13px] text-jb-fg focus-visible:bg-jb-hover disabled:pointer-events-none disabled:opacity-40',
              it.description ? 'h-auto py-1.5' : 'h-8',
              it.checked && (it.description || it.highlight) && 'bg-jb-selected text-jb-fg hover:bg-jb-selected',
              it.tone === 'cloud' && 'bg-jb-cloud font-semibold text-jb-on-cloud hover:bg-jb-cloud-hover hover:text-jb-on-cloud focus-visible:bg-jb-cloud-hover [&_.text-jb-muted]:text-jb-on-cloud/80',
            )}
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

/** 下拉菜单按钮：「导出 ▾」「速度 ▾」、收起后的层级切换等。菜单是 portal 同心浮层，放不下时自动翻到另一侧。 */
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
        data-full-chevron={chevron === undefined ? 14 : 0}
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
        {!iconOnly ? (chevron ?? <ChevronDown data-jb-chevron="" className="size-3.5 text-jb-muted" aria-hidden />) : null}
      </Btn>
      <Popover open={open} anchor={btn.current} onClose={() => setOpen(false)} placement={placement} role="menu" label={label} width={width} testid={testid ? `${testid}-list` : 'menu'} autoFocus={byKey}>
        <MenuList
          items={items}
          onPick={(it) => {
            setOpen(false);
            it.onClick();
            btn.current?.focus();
          }}
        />
      </Popover>
    </>
  );
}

/** 开关（Juice .j-switch / .j-switch-thumb 弹性轨道 + Joplo 暖黄开启态）：右侧文字，见 TokenRollAI/juice#9。 */
export function Switch({ on, onChange, label, testid, title, className }: { on: boolean; onChange: (on: boolean) => void; label: string; testid?: string; title?: string; className?: string }) {
  const [tip, tipNode] = useTip(title ?? null);
  return (
    <>
      <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} data-testid={testid} className={cn('jb-focus inline-flex h-7 shrink-0 items-center gap-2 whitespace-nowrap rounded-[8px] px-1.5 font-jb text-[13px] font-medium text-jb-fg hover:bg-jb-hover', className)} {...tip}>
        <span aria-hidden data-checked={on ? 'true' : 'false'} className={cn('j-switch pointer-events-none h-[20px] w-[34px] p-[2px]', on && 'bg-jb-accent shadow-[inset_0_0_0_1px_var(--jb-border-strong)]')}>
          <i className={cn('j-switch-thumb size-4', on ? 'translate-x-[14px] bg-jb-on-accent' : 'bg-jb-surface')} />
        </span>
        {label}
      </button>
      {tipNode}
    </>
  );
}

/** 导演状态（全屏控制条用）：开启时“导演 · 后端流转”，点一下转为手动；暂停时“导演已暂停”，点一下恢复。 */
export function DirectorTag({ on, layerTitle, onToggle }: { on: boolean; layerTitle: string; onToggle: () => void }) {
  const { t: i18n } = useI18n();

  return (
    <Btn icon={<Clapperboard className="size-4" aria-hidden />} label={on ? i18n.player.director(layerTitle) : i18n.player.directorPaused} size={32} variant="ghost" selected={on} onClick={onToggle} data-testid="director" title={on ? i18n.player.directorSwitchesLayersAndShotsWithEachStepClick : i18n.player.resumeDirectorReturnToThisStepSDirectorLayer} />
  );
}
