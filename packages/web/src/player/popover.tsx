/**
 * 浮层与悬停提示（D55 不变量 8：浮层只有一种 e1，用 portal 渲染，不能被父级的 overflow 裁掉）。
 * - Popover：菜单、外观浮层、悬停卡片共用。挂在 body（全屏时挂在全屏元素里），position: fixed，坐标由 placePopover 计算；
 *   点外面或 Esc 关闭，关闭后焦点回到锚点。
 * - useTip：悬停 / 键盘聚焦一段时间后显示的墨底提示（e2），收起成图标的按钮在这里写全称和快捷键。
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { placePopover, portalHostOf, type Placement } from './popover-place';

function usePortalHost(): Element | null {
  const [host, setHost] = useState<Element | null>(() => (typeof document === 'undefined' ? null : portalHostOf(document)));
  useEffect(() => {
    const on = () => setHost(portalHostOf(document));
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  return host;
}

/** 跟着锚点的 fixed 定位层：锚点移动（滚动、窗口缩放、自身尺寸变化）时重新计算。 */
function Floating({ anchor, placement, children, className, style, onEl, ...rest }: { anchor: HTMLElement; placement: Placement; children: ReactNode; className?: string; style?: CSSProperties; onEl?: (el: HTMLDivElement | null) => void } & Omit<React.HTMLAttributes<HTMLDivElement>, 'style' | 'className' | 'children'>) {
  const host = usePortalHost();
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number; side: 'top' | 'bottom' } | null>(null);
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = anchor.getBoundingClientRect();
    setPos(placePopover(r, { width: el.offsetWidth, height: el.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }, placement));
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
      ref={(el) => {
        ref.current = el;
        onEl?.(el);
      }}
      className={className}
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
  onMouseLeave?: () => void;
};

/** 浮层 e1：1.5px 墨线 + 3px 实色偏移阴影，圆角 10。 */
export function Popover({ open, anchor, onClose, placement = 'bottom-end', children, className, width, role = 'dialog', label, testid, autoFocus = false, ignore = [], onKeyDown, onMouseLeave }: PopoverProps) {
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
  useLayoutEffect(() => {
    if (!open || !autoFocus) return;
    const first = el.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled]),[role="menuitemcheckbox"]:not([disabled]),[role="menuitemradio"]:not([disabled]),button:not([disabled]),[tabindex="0"]');
    (first ?? el.current)?.focus();
  }, [open, autoFocus]);
  if (!open || !anchor) return null;
  return (
    <Floating
      anchor={anchor}
      placement={placement}
      onEl={(x) => (el.current = x)}
      role={role}
      aria-label={label}
      tabIndex={-1}
      data-testid={testid}
      data-jb-pop=""
      className={cn('jb-pop outline-none', className)}
      style={width ? { width } : undefined}
      onKeyDown={onKeyDown}
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
      <Floating anchor={anchor} placement={placement} id={id} role="tooltip" className="jb-tip pointer-events-none max-w-[320px] px-2 py-1 text-[12px] leading-[16px]" data-testid="tooltip">
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
