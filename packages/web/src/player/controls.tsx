/**
 * 演示页控件的统一样式（T-polish）：按钮、分段控件、下拉菜单、导演标签，看板与发布站、全屏与非全屏共用。
 * 尺寸规范见 controls-fit.ts：高度 32 / 36、圆角 6、间距 4 的倍数、字号 12 / 14 / 16 / 20、图标 16；文字一律不换行。
 * tone = 'dark' 用在全屏的深色胶囊控制条上。
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Clapperboard, Ellipsis } from 'lucide-react';
import { cn } from '@/lib/utils';

export type Tone = 'light' | 'dark';
export type MenuItem = { id: string; label: string; onClick: () => void; checked?: boolean; disabled?: boolean };

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

const base = 'inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md text-[14px] leading-none transition-colors disabled:pointer-events-none disabled:opacity-40';
const variants = {
  light: {
    default: 'border border-[#dee2e6] bg-white text-[#1e1e1e] hover:bg-[#f1f3f5]',
    primary: 'bg-[#1e1e1e] font-medium text-white hover:bg-[#333]',
    ghost: 'text-[#495057] hover:bg-[#f1f3f5]',
  },
  dark: {
    default: 'text-white hover:bg-white/15',
    primary: 'bg-white font-medium text-[#1e1e1e] hover:bg-white/90',
    ghost: 'text-white/80 hover:bg-white/15',
  },
} as const;

/** 按钮：icon + 文字；iconOnly 时只有图标，文字作为 tooltip 与无障碍标签。 */
export function Btn({
  icon,
  label,
  iconOnly = false,
  iconAfter = false,
  size = 36,
  variant = 'default',
  tone = 'light',
  title,
  className,
  ...rest
}: {
  icon?: ReactNode;
  label: string;
  iconOnly?: boolean;
  iconAfter?: boolean;
  size?: 32 | 36;
  variant?: 'default' | 'primary' | 'ghost';
  tone?: Tone;
  title?: string;
  className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'title'>) {
  return (
    <button
      type="button"
      aria-label={iconOnly ? label : rest['aria-label']}
      title={title ?? (iconOnly ? label : undefined)}
      className={cn(base, variants[tone][variant], size === 32 ? 'h-8' : 'h-9', iconOnly ? (size === 32 ? 'w-8' : 'w-9') : 'px-3', className)}
      {...rest}
    >
      {!iconAfter ? icon : null}
      {iconOnly ? null : <span>{label}</span>}
      {iconAfter ? icon : null}
    </button>
  );
}

/** 分段控件：外框圆角 8、内边距 4，每项高 24 / 28（随 size），文字不换行。value = null 时不高亮任何一项。 */
export function Segmented<T extends string>({ value, items, onChange, label, testid, full, size = 32, tone = 'light' }: { value: T | null; items: { value: T; label: ReactNode; testid?: string; title?: string }[]; onChange: (v: T) => void; label: string; testid?: string; full?: boolean; size?: 32 | 36; tone?: Tone }) {
  const dark = tone === 'dark';
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex shrink-0 items-center gap-0.5 rounded-lg p-1', dark ? 'bg-white/10' : 'bg-[#f1f3f5]', size === 32 ? 'h-8' : 'h-9', full && 'w-full')} data-testid={testid}>
      {items.map((it) => {
        const on = value === it.value;
        return (
          <button
            key={it.value}
            type="button"
            role="radio"
            aria-checked={on}
            title={it.title}
            data-testid={it.testid}
            onClick={() => onChange(it.value)}
            className={cn(
              'flex h-full min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-md px-3 text-[14px] leading-none',
              full && 'flex-1 truncate',
              on ? (dark ? 'bg-white font-medium text-[#1e1e1e]' : 'bg-white font-medium text-[#1e1e1e] shadow-sm') : dark ? 'text-white/75 hover:text-white' : 'text-[#495057] hover:text-[#1e1e1e]',
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/** 下拉菜单按钮：「…」、收起后的层级切换等。placement = 'up' 时向上展开（播放控制在页面底部）。 */
export function MenuButton({ trigger, items, label, testid, placement = 'up', align = 'right', tone = 'light', size = 36, width = 220 }: { trigger: { icon?: ReactNode; label?: string }; items: (MenuItem | { id: string; divider: true })[]; label: string; testid?: string; placement?: 'up' | 'down'; align?: 'left' | 'right'; tone?: Tone; size?: 32 | 36; width?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  const iconOnly = !trigger.label;
  return (
    <div ref={ref} className="relative shrink-0">
      <Btn
        icon={trigger.icon ?? (iconOnly ? <Ellipsis className="size-4" /> : <ChevronDown className="size-4" />)}
        iconAfter={!iconOnly}
        label={trigger.label ?? label}
        iconOnly={iconOnly}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-testid={testid}
        size={size}
        tone={tone}
        variant={tone === 'dark' ? 'ghost' : 'default'}
      />
      {open ? (
        <div role="menu" className={cn('absolute z-50 rounded-lg border bg-white p-1 text-[#1e1e1e] shadow-lg', placement === 'up' ? 'bottom-full mb-2' : 'top-full mt-2', align === 'right' ? 'right-0' : 'left-0')} style={{ width }} data-testid={testid ? `${testid}-list` : 'menu'}>
          {items.map((it) =>
            'divider' in it ? (
              <div key={it.id} className="my-1 h-px bg-[#e9ecef]" />
            ) : (
              <button
                key={it.id}
                type="button"
                role={it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                aria-checked={it.checked}
                disabled={it.disabled}
                data-testid={`menu-${it.id}`}
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className="flex h-8 w-full items-center justify-between gap-2 whitespace-nowrap rounded-md px-3 text-left text-[14px] hover:bg-[#f1f3f5] disabled:opacity-40"
              >
                <span className="truncate">{it.label}</span>
                {it.checked ? <span aria-hidden>✓</span> : null}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

/** 导演状态：一个小标签按钮。开启时“🎬 导演 · 后端流转”（深色），点一下转为手动；暂停时“🎬 导演已暂停”，点一下恢复。 */
export function DirectorTag({ on, layerTitle, onToggle, tone = 'light' }: { on: boolean; layerTitle: string; onToggle: () => void; tone?: Tone }) {
  const dark = tone === 'dark';
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      data-testid="director"
      title={on ? '导演跟随每一步切换层级与镜头；点一下改为手动' : '恢复导演：回到这一步的导演层'}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[14px] leading-none',
        on ? (dark ? 'bg-white text-[#1e1e1e]' : 'bg-[#1e1e1e] text-white') : dark ? 'border border-white/40 text-white/80' : 'border border-[#ced4da] bg-white text-[#495057] hover:bg-[#f1f3f5]',
      )}
    >
      <Clapperboard className="size-4" aria-hidden />
      <span data-testid="director-layer">{on ? `导演 · ${layerTitle}` : '导演已暂停'}</span>
    </button>
  );
}
