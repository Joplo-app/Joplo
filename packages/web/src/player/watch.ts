/**
 * 手机上像看视频一样看分享（mobile_watch）的纯逻辑：什么时候算手机、横竖屏，横屏时的手势，连续播放的下一个场景。
 */

/** 手机：粗指针（触屏）且屏幕短边 < 600（平板、电脑窄窗口不算）。返回竖着 / 横着，不是手机时 null。 */
export function phoneLayout(v: { width: number; height: number; coarse: boolean }): 'portrait' | 'landscape' | null {
  if (!v.coarse || Math.min(v.width, v.height) >= 600) return null;
  return v.width > v.height ? 'landscape' : 'portrait';
}

/** 横屏时的一次触摸：点一下（显示 / 隐藏控件）、向左滑（下一步）、向右滑（上一步）；其余不处理。 */
export function gestureOf(t: { dx: number; dy: number; ms: number }): 'tap' | 'next' | 'prev' | null {
  const ax = Math.abs(t.dx);
  const ay = Math.abs(t.dy);
  if (ax < 10 && ay < 10) return t.ms < 500 ? 'tap' : null;
  if (t.ms > 800 || ax < 50 || ax < ay * 1.5) return null;
  return t.dx < 0 ? 'next' : 'prev';
}

/** 按声明顺序连续播放主线；可选支线仍可手动进入，结束后停下。 */
export function nextScenarioId(list: readonly { id: string; autoplay?: boolean }[], id: string): string | null {
  const sequence = list.filter(s => s.autoplay !== false);
  const i = sequence.findIndex((s) => s.id === id);
  return i >= 0 && i + 1 < sequence.length ? sequence[i + 1]!.id : null;
}
