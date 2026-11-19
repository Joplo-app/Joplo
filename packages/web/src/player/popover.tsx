/**
 * 浮层与悬停提示（D55 不变量 8 + @tokenroll/juice v0.2.0 FloatingPopover / CenterPopover）：
 * - Popover：菜单、外观浮层、悬停卡片共用。底层由 Juice FloatingPopover 托管 portal（全屏元素优先，否则 body）、
 *   动态坐标翻转（placeFloating）、外部点击与 Esc 关闭、以及焦点归还（restoreFocus="focused-within"）。
 * - CenterPanel：快捷键面板等居中浮层，底层由 Juice CenterPopover 托管。
 * - useTip：悬停 / 键盘聚焦一段时间后显示的墨底胶囊提示（.j-tooltip-pill / .jb-tip）。
 */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { CenterPopover, FloatingPopover, Tooltip } from '@tokenroll/juice/primitives';
import { cn } from '@/lib/utils';
import { placePopover, portalHostOf, type Placement } from './popover-place';

export { CenterPopover, FloatingPopover, Tooltip };

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

/** 轻量无交互悬停锚定层（供 useTip 胶囊提示使用，不进入焦点栈）。 */
function TipFloating({ anchor, placement, children, className, style, ...rest }: { anchor: HTMLElement; placement: Placement; children: ReactNode; className?: string; style?: CSSProperties } & Omit<React.HTMLAttributes<HTMLDivElement>, 'style' | 'className' | 'children'>) {
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
  if (!host) return null;
  return createPortal(
    <div
      ref={ref}
      className={cn(inDark && 'jb-dark', className)}
      data-side={pos?.side}
      style={{ position: 'fixed', left: pos?.x ?? 0, top: pos?.y ?? 0, zIndex: 1001, visibility: pos ? 'visible' : 'hidden', ...style }}
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

const EMPTY_IGNORE: readonly (HTMLElement | null)[] = [];

/** 同心浮层表面（直接基于 @tokenroll/juice v0.2.0 FloatingPopover）。 */
export function Popover({
  open,
  anchor,
  onClose,
  placement = 'bottom-end',
  children,
  className,
  width,
  role = 'dialog',
  label,
  testid,
  autoFocus = false,
  ignore = EMPTY_IGNORE as (HTMLElement | null)[],
  onKeyDown,
  onMouseEnter,
  onMouseLeave,
}: PopoverProps) {
  const everOpened = useRef(false);
  if (open) everOpened.current = true;
  const ignoreRefs = useMemo<ReadonlyArray<RefObject<HTMLElement | null>>>(
    () => (ignore.length ? ignore.map((current) => ({ current })) : []),
    [ignore],
  );
  if (!open && !everOpened.current) return null;
  const inDark = Boolean(anchor?.closest('.jb-dark'));
  return (
    <FloatingPopover
      open={open}
      anchor={anchor}
      onClose={onClose}
      placement={placement}
      width={width ?? 'auto'}
      autoFocus={autoFocus}
      restoreFocus="focused-within"
      ignoreRefs={ignoreRefs}
      role={role}
      aria-label={label}
      data-testid={testid}
      data-jb-pop=""
      className={cn(inDark && 'jb-dark', 'jb-pop max-h-[calc(100dvh-24px)] overflow-y-auto overscroll-contain p-0 outline-none', className)}
      style={{ maxHeight: 'calc(100dvh - 24px)' }}
      onKeyDown={onKeyDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </FloatingPopover>
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
      <TipFloating anchor={anchor} placement={placement} id={id} role="tooltip" className="j-tooltip-pill jb-tip pointer-events-none max-w-[320px] whitespace-normal px-2.5 py-1.5 text-[12px] leading-[16px]" data-testid="tooltip">
        {content}
      </TipFloating>
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

/** 居中的浮层（portal）：快捷键面板等。底层直接采用 @tokenroll/juice v0.2.0 CenterPopover。 */
export function CenterPanel({ open, onClose, label, testid, width, children }: { open: boolean; onClose: () => void; label: string; testid?: string; width: number; children: ReactNode }) {
  return (
    <CenterPopover
      open={open}
      onClose={onClose}
      width={width}
      backdrop
      autoFocus
      restoreFocus="focused-within"
      role="dialog"
      aria-label={label}
      data-testid={testid}
      data-jb-pop=""
      className="jb-pop max-h-[86vh] overflow-y-auto p-1.5 outline-none"
    >
      {children}
    </CenterPopover>
  );
}
