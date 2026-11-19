/**
 * 浮层与悬停提示（D55 不变量 8 + Juice UI portal 同心浮层）：
 * - Popover：菜单、外观浮层、悬停卡片共用。挂在 body（全屏时挂在全屏元素里），position: fixed，坐标由 placePopover（底层 Juice placeFloating）计算；
 *   点外面或 Esc 关闭，焦点在浮层内时还给锚点（悬停卡片关闭不抢焦点，见 TokenRollAI/juice#7）。
 * - useTip：悬停 / 键盘聚焦一段时间后显示的墨底胶囊提示（.j-tooltip-pill / .jb-tip）。
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { FloatingPopover, Tooltip } from '@tokenroll/juice/primitives';
import { cn } from '@/lib/utils';
import { placePopover, portalHostOf, type Placement } from './popover-place';

export { FloatingPopover, Tooltip };

const PORTAL_TOKENS = [
  '--fill-slab',
  '--fill-on',
  '--juice-font-ui',
  '--juice-font-mono',
  '--juice-signal',
  '--juice-ok',
  '--juice-warn',
  '--juice-danger',
  '--juice-soft',
  '--juice-mute',
  '--juice-faint',
  '--juice-w4',
  '--juice-w6',
  '--juice-w12',
  '--juice-w20',
  '--juice-edge',
  '--juice-r-inner',
  '--juice-r-control',
  '--juice-out',
] as const;

function usePortalHost(): Element | null {
  const [host, setHost] = useState<Element | null>(() => (typeof document === 'undefined' ? null : portalHostOf(document)));
  useEffect(() => {
    const on = () => setHost(portalHostOf(document));
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  return host;
}

/** 跟着锚点的 fixed 定位层：同步锚点所在作用域的 Juice / 看板 Token，锚点移动或尺寸变化时重新计算。 */
function Floating({ anchor, placement, children, className, style, onEl, autoFocus = false, ...rest }: { anchor: HTMLElement; placement: Placement; children: ReactNode; className?: string; style?: CSSProperties; onEl?: (el: HTMLDivElement | null) => void; autoFocus?: boolean } & Omit<React.HTMLAttributes<HTMLDivElement>, 'style' | 'className' | 'children'>) {
  const host = usePortalHost();
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<ReturnType<typeof placePopover> | null>(null);
  const inDark = Boolean(anchor.closest('.jb-dark'));
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const computed = window.getComputedStyle(anchor);
    for (const token of PORTAL_TOKENS) {
      const val = computed.getPropertyValue(token);
      if (val) el.style.setProperty(token, val);
    }
    const r = anchor.getBoundingClientRect();
    const next = placePopover(r, { width: el.offsetWidth, height: el.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }, placement);
    const originX = Math.max(0, Math.min(el.offsetWidth, (r.left + r.right) / 2 - next.x));
    const originY = Math.max(0, Math.min(el.offsetHeight, (r.top + r.bottom) / 2 - next.y));
    el.style.transformOrigin = next.side === 'top' || next.side === 'bottom'
      ? `${originX}px ${next.side === 'top' ? '100%' : '0%'}`
      : `${next.side === 'left' ? '100%' : '0%'} ${originY}px`;
    setPos(next);
  }, [anchor, placement]);
  useLayoutEffect(() => {
    update();
    const ro = new ResizeObserver(update);
    if (ref.current) ro.observe(ref.current);
    ro.observe(anchor);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [update, anchor]);
  // A hidden measuring pass cannot accept focus. Wait until the positioned surface is visible.
  const positioned = pos !== null;
  useLayoutEffect(() => {
    if (!positioned || !autoFocus) return;
    const first = ref.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled]),[role="menuitemcheckbox"]:not([disabled]),[role="menuitemradio"]:not([disabled]),button:not([disabled]),[tabindex="0"]');
    (first ?? ref.current)?.focus();
  }, [positioned, autoFocus]);
  if (!host) return null;
  return createPortal(
    <div
      ref={(el) => {
        ref.current = el;
        onEl?.(el);
      }}
      className={cn(inDark && 'jb-dark', className)}
      data-side={pos?.side}
      style={{ position: 'fixed', left: pos?.x ?? 0, top: pos?.y ?? 0, zIndex: 1000, visibility: pos ? 'visible' : 'hidden', ...style }}
      {...rest}
    >
      {children}
    </div>,
    host,
  );
}

export type PopoverProps = {
  open: boolean;
  anchor: HTMLElement | null;
  onClose: () => void;
  placement?: Placement;
  children: ReactNode;
  className?: string;
  width?: number;
  role?: 'menu' | 'dialog';
  label?: string;
  testid?: string;
  /** 打开时聚焦浮层里的第一个可聚焦元素（键盘打开时）。 */
  autoFocus?: boolean;
  /** 点击这些元素不算“点外面”（例如锚点本身，由锚点自己切换开关）。 */
  ignore?: (HTMLElement | null)[];
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
};

/** 同心浮层表面（对齐 Juice .j-floating-pop 与 .jb-pop）。 */
export function Popover({ open, anchor, onClose, placement = 'bottom-end', children, className, width, role = 'dialog', label, testid, autoFocus = false, ignore = [], onKeyDown, onMouseEnter, onMouseLeave }: PopoverProps) {
  const el = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const ignoreRef = useRef(ignore);
  ignoreRef.current = ignore;
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (el.current?.contains(t) || anchor?.contains(t) || ignoreRef.current.some((x) => x?.contains(t))) return;
      closeRef.current();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      closeRef.current();
      anchor?.focus();
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key);
    };
  }, [open, anchor]);
  // 关闭时，如果焦点在浮层里，还给锚点
  const focused = useRef(false);
  useEffect(() => {
    if (!open) return;
    return () => {
      if (focused.current) anchor?.focus();
      focused.current = false;
    };
  }, [open, anchor]);
  if (!open || !anchor) return null;
  return (
    <Floating
      anchor={anchor}
      placement={placement}
      autoFocus={autoFocus}
      onEl={(x) => (el.current = x)}
      role={role}
      aria-label={label}
      tabIndex={-1}
      data-testid={testid}
      data-jb-pop=""
      data-floating-popover=""
      className={cn('j-floating-pop jb-pop max-h-[calc(100dvh-24px)] overflow-y-auto overscroll-contain p-0 outline-none', className)}
      style={width ? { width } : undefined}
      onKeyDown={onKeyDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocusCapture={() => (focused.current = true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) focused.current = false;
      }}
    >
      {children}
    </Floating>
  );
}

const TIP_DELAY = 400;

/**
 * 悬停提示：返回要展开到触发元素上的事件属性，以及提示节点（放在同一个组件里渲染）。
 * 鼠标悬停 400ms 或键盘聚焦时显示；按下、离开、失焦时隐藏。content 为空时不显示。
 */
export function useTip(content: ReactNode | null | undefined, { placement = 'bottom-center', delay = TIP_DELAY }: { placement?: Placement; delay?: number } = {}) {
  const id = useId();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  const show = (el: HTMLElement, wait: number) => {
    clear();
    timer.current = setTimeout(() => setAnchor(el), wait);
  };
  const hide = () => {
    clear();
    setAnchor(null);
  };
  const props = content
    ? {
        onMouseEnter: (e: React.MouseEvent<HTMLElement>) => show(e.currentTarget, delay),
        onMouseLeave: hide,
        onFocus: (e: React.FocusEvent<HTMLElement>) => {
          if (e.currentTarget.matches(':focus-visible')) show(e.currentTarget, 0);
        },
        onBlur: hide,
        onPointerDown: hide,
        'aria-describedby': anchor ? id : undefined,
      }
    : {};
  const node =
    content && anchor && anchor.isConnected ? (
      <Floating anchor={anchor} placement={placement} id={id} role="tooltip" className="j-tooltip-pill jb-tip pointer-events-none max-w-[320px] whitespace-normal px-2.5 py-1.5 text-[12px] leading-[16px]" data-testid="tooltip">
        {content}
      </Floating>
    ) : null;
  return [props, node] as const;
}

/** 包一层的悬停提示（给不方便展开事件属性的元素用）。 */
export function Tip({ content, children, placement, className }: { content: ReactNode | null | undefined; children: ReactNode; placement?: Placement; className?: string }) {
  const [props, node] = useTip(content, { placement });
  return (
    <span className={cn('inline-flex shrink-0', className)} {...props}>
      {children}
      {node}
    </span>
  );
}

/**
 * 悬停卡片（左栏的情况行、方案行）：悬停 350ms 打开，移到卡片上保持打开，离开锚点和卡片 150ms 后关闭。
 * 卡片本身是 Popover（portal）。
 */
export function useHoverCard(delay = 350) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  const leave = () => {
    clear();
    timer.current = setTimeout(() => setAnchor(null), 150);
  };
  const close = () => {
    clear();
    setAnchor(null);
  };
  return {
    anchor,
    close,
    trigger: {
      onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
        const el = e.currentTarget;
        clear();
        timer.current = setTimeout(() => setAnchor(el), anchor ? 0 : delay);
      },
      onMouseLeave: leave,
    },
    card: { onMouseEnter: clear, onMouseLeave: leave },
  };
}

/** 居中的浮层（portal）：快捷键面板等。点外面或 Esc 关闭。 */
export function CenterPanel({ open, onClose, label, testid, width, children }: { open: boolean; onClose: () => void; label: string; testid?: string; width: number; children: ReactNode }) {
  const host = usePortalHost();
  const el = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!el.current?.contains(e.target as Node)) closeRef.current();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key);
    el.current?.focus();
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key);
    };
  }, [open]);
  if (!open || !host) return null;
  return createPortal(
    <div ref={el} role="dialog" aria-label={label} tabIndex={-1} data-testid={testid} data-jb-pop="" data-floating-popover="" className="j-floating-pop jb-pop fixed left-1/2 top-1/2 z-[1000] max-h-[86vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-1.5 outline-none" style={{ width }}>
      {children}
    </div>,
    host,
  );
}
