/**
 * 画面缩放的纯计算（D43“一屏放下”）：舞台（手机页面含外框）按比例放进可用区域，四周留 pad，最大 1.5 倍。
 * 可用区域就是视口减去顶栏、左栏、层级栏、播放控制和步骤条之后剩下的部分，所以舞台永远不会把页面撑高。
 */
export function fitStage(avail: { w: number; h: number }, frame: { width: number; height: number }, pad = 12): number {
  return Math.max(0.2, Math.min((avail.w - pad * 2) / frame.width, (avail.h - pad * 2) / frame.height, 1.5));
}

/**
 * 电脑页面的舞台铺满可用区域（T-stage）：不再把固定 1280×800 的画框按比例缩进去、在两侧留出空白，
 * 而是按可用区域的宽高比决定舞台的逻辑尺寸——设计宽度 base.width（1280）对齐可用宽度，高度随可用区域；
 * 缩放限制在 0.35–1.5 倍（超出时逻辑宽度相应变化，仍然铺满）；可用区域很矮时逻辑高度至少 minH，按高度缩放。
 * 镜头、聚焦小图、「适应画面」都按这个舞台尺寸计算。手机页面不用它（固定在 Phone 外框里，见 fitStage）。
 */
export function fillStage(avail: { w: number; h: number }, base: { width: number; height: number }, minH = 360): { width: number; height: number; scale: number } {
  const w = Math.max(1, avail.w);
  const h = Math.max(1, avail.h);
  let scale = Math.min(1.5, Math.max(0.35, w / base.width));
  if (h / scale < minH) scale = Math.max(0.2, h / minH);
  return { width: Math.round(w / scale), height: Math.round(h / scale), scale: w / Math.round(w / scale) };
}

/**
 * 视频式舞台（mobile_watch）：舞台逻辑尺寸固定为设计尺寸（电脑页面 1280×800），整体等比缩放放进可用区域，
 * 像视频一样留黑边；不按可用区域的宽高比改变逻辑尺寸，所以手机上看到的排版和电脑上一样。
 */
export function videoStage(avail: { w: number; h: number }, base: { width: number; height: number }): { width: number; height: number; scale: number } {
  const scale = Math.max(0.05, Math.min(Math.max(1, avail.w) / base.width, Math.max(1, avail.h) / base.height));
  return { width: base.width, height: base.height, scale };
}
