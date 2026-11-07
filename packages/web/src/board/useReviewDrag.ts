import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { readReviewPosition, REVIEW_DRAG_THRESHOLD, reviewPixelPosition, reviewRelativePosition, saveReviewPosition, type ReviewBounds, type ReviewPoint } from './review-position';

type Drag = { id: number; client: ReviewPoint; origin: ReviewPoint; original: ReviewPoint; moved: boolean };
export function useReviewDrag(onMove: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const [point, setPoint] = useState(readReviewPosition);
  const [bounds, setBounds] = useState<ReviewBounds | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const current = useRef({ point, bounds, onMove });
  current.current = { point, bounds, onMove };
  const update = (next: ReviewPoint) => { current.current.point = next; setPoint(next); };
  useLayoutEffect(() => {
    const control = ref.current, parent = control?.parentElement;
    if (!control || !parent) return;
    const measure = () => setBounds({ width: parent.clientWidth, height: parent.clientHeight, controlWidth: control.offsetWidth, controlHeight: control.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent); observer.observe(control);
    return () => observer.disconnect();
  }, []);
  const finish = (e: PointerEvent<HTMLButtonElement>, cancelled: boolean) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (d.moved) {
      if (cancelled) update(d.original); else saveReviewPosition(current.current.point);
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const pixel = bounds ? reviewPixelPosition(point, bounds) : null;
  const style: CSSProperties = pixel ? { left: pixel.x, top: pixel.y } : { right: 12, top: '50%', transform: 'translateY(-50%)' };
  return {
    ref, style, dragging,
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0 || !e.isPrimary || !current.current.bounds) return;
      suppressClick.current = false;
      drag.current = { id: e.pointerId, client: { x: e.clientX, y: e.clientY }, origin: reviewPixelPosition(current.current.point, current.current.bounds), original: current.current.point, moved: false };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: PointerEvent<HTMLButtonElement>) => {
      const d = drag.current, b = current.current.bounds;
      if (!d || !b || d.id !== e.pointerId) return;
      const dx = e.clientX - d.client.x, dy = e.clientY - d.client.y;
      if (!d.moved && Math.hypot(dx, dy) < REVIEW_DRAG_THRESHOLD) return;
      if (!d.moved) { d.moved = true; suppressClick.current = true; setDragging(true); current.current.onMove(); }
      e.preventDefault();
      update(reviewRelativePosition({ x: d.origin.x + dx, y: d.origin.y + dy }, b));
    },
    onPointerUp: (e: PointerEvent<HTMLButtonElement>) => finish(e, false),
    onPointerCancel: (e: PointerEvent<HTMLButtonElement>) => finish(e, true),
    onLostPointerCapture: (e: PointerEvent<HTMLButtonElement>) => finish(e, true),
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
      const direction: Record<string, ReviewPoint> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
      const delta = direction[e.key], b = current.current.bounds;
      if (!delta || !b || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault(); e.stopPropagation();
      current.current.onMove();
      const origin = reviewPixelPosition(current.current.point, b), amount = e.shiftKey ? 32 : 8;
      const next = reviewRelativePosition({ x: origin.x + delta.x * amount, y: origin.y + delta.y * amount }, b);
      update(next); saveReviewPosition(next);
    },
    click: (e: MouseEvent<HTMLButtonElement>, action: () => void) => {
      if (e.detail !== 0 && suppressClick.current) { suppressClick.current = false; e.preventDefault(); e.stopPropagation(); return; }
      action();
    },
  };
}
