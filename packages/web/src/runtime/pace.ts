/**
 * 自动播放的节奏（T-director2，纯函数）：演示页、发布站与视频录制共用。
 * - 每一步提交之后停留：按说明 + 解说的字数，约 60ms/字，下限 3 秒，再按速度（0.5× / 1× / 1.5×）缩放；
 * - 同时至少等到镜头过渡结束（CAMERA_MS）、本步 active 连线上的小点跑完一圈（dotMs），这两项与速度无关。
 */
export const SPEEDS = [0.5, 1, 1.5] as const;
export type Speed = (typeof SPEEDS)[number];
export const MS_PER_CHAR = 60;
export const MIN_DWELL = 3000;
/** 镜头过渡时长（camera.tsx 用同一个值）。 */
export const CAMERA_MS = 1000;
/** 镜头结束后再留一点余量，避免刚停稳就切走。 */
const SETTLE = 200;

/** “字数”：去掉空白后的字符数（中文一字一个，英文按字母计，标点也算）。 */
export function readChars(...texts: (string | null | undefined)[]): number {
  let n = 0;
  for (const t of texts) if (t) for (const ch of t) if (!/\s/.test(ch)) n++;
  return n;
}

export const asSpeed = (v: unknown): Speed => (SPEEDS as readonly number[]).includes(Number(v)) ? (Number(v) as Speed) : 1;

/**
 * 这一步提交之后至少停留多久（毫秒）。
 * text：说明与解说；cameraMoved：这一步镜头有变化（切层或换焦点）；dotMs：本步 active 连线上小点跑一圈的最长时间（没有为 0）。
 */
export function stepDwell(o: { texts: (string | null | undefined)[]; speed?: number; cameraMoved?: boolean; dotMs?: number }): number {
  const speed = o.speed && o.speed > 0 ? o.speed : 1;
  const read = Math.max(MIN_DWELL, readChars(...o.texts) * MS_PER_CHAR) / speed;
  const cam = o.cameraMoved ? CAMERA_MS + SETTLE : 0;
  const dots = o.dotMs && o.dotMs > 0 ? o.dotMs + SETTLE : 0;
  return Math.round(Math.max(read, cam, dots));
}
