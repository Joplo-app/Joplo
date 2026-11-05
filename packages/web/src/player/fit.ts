/**
 * 画面缩放的纯计算（D43“一屏放下”）：舞台（手机页面含外框）按比例放进可用区域，四周留 pad，最大 1.5 倍。
 * 可用区域就是视口减去顶栏、左栏、层级栏、播放控制和步骤条之后剩下的部分，所以舞台永远不会把页面撑高。
 */
export function fitStage(avail: { w: number; h: number }, frame: { width: number; height: number }, pad = 12): number {
  return Math.max(0.2, Math.min((avail.w - pad * 2) / frame.width, (avail.h - pad * 2) / frame.height, 1.5));
}
