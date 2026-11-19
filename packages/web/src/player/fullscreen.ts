/**
 * 全屏模式（T-stage）：浏览器 Fullscreen API；状态只在本页（不写进 URL）。Esc 由浏览器退出全屏。
 * 全屏时播放控制浮在画面下方，鼠标静止约 FULLSCREEN_IDLE_MS 后淡出，移动鼠标重新出现（基于 Juice v0.2.0 useIdleVisibility）。
 */
import { useCallback, useEffect, useState, type RefObject } from 'react';
import { useIdleVisibility } from '@tokenroll/juice/primitives';

export const FULLSCREEN_IDLE_MS = 2500;

/** F 键切换全屏：输入框、可编辑区域聚焦或按着修饰键时不触发。 */
export function isFullscreenKey(e: { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean }, target: { closest?: (s: string) => unknown } | null): boolean {
  if (e.key !== 'f' && e.key !== 'F') return false;
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  return !target?.closest?.('input,textarea,select,[contenteditable]');
}

export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [full, setFull] = useState(false);
  useEffect(() => {
    const on = () => setFull(!!ref.current && document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, [ref]);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void ref.current?.requestFullscreen?.().catch(() => undefined);
  }, [ref]);
  return { full, toggle };
}

/** 鼠标静止 ms 毫秒后返回 false；poke() 表示鼠标动了。active = false 时总是 true。 */
export function useIdleVisible(active: boolean, ms = FULLSCREEN_IDLE_MS) {
  return useIdleVisibility(active, ms);
}
