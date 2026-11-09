/**
 * 自动播放的阅读节奏（T-director2，纯函数）：演示页、发布站、视频录制、`joplo outline` 与 check 共用这一份。
 * - 阅读：说明 + 解说，中文每秒 8 字、拉丁文字每秒 15 个非空白字符，3–7 秒，再按速度缩放；
 * - 同时至少等到镜头过渡结束（CAMERA_MS）、本步 active 连线上的小点跑完一圈（dotMs），这两项与速度无关。
 * 2026-11-06（D67）从 web 的 runtime/pace.ts 搬到 core，web 原地 re-export，数值与行为不变。
 */
export const MS_PER_CHAR = 125;
export const LATIN_MS_PER_CHAR = 1000 / 15;
export const MIN_DWELL = 3000;
export const MAX_READ_MS = 7000;
/** 镜头过渡时长（web 的 camera.tsx 用同一个值）。 */
export const CAMERA_MS = 700;
/** 流式输出（D56）：每个字的时长（1× 速度）；整段至少 STREAM_MIN、至多 STREAM_MAX。 */
export const STREAM_MS_PER_CHAR = 35;
export const STREAM_MIN = 600;
export const STREAM_MAX = 9000;
/** 一段流式文字逐字出现要多久（毫秒，已按速度缩放）。 */
export function streamMs(text: string, speed = 1): number {
  const n = [...text].length;
  if (!n) return 0;
  return Math.round(Math.min(STREAM_MAX, Math.max(STREAM_MIN, n * STREAM_MS_PER_CHAR)) / (speed > 0 ? speed : 1));
}
/** 镜头结束后再留一点余量，避免刚停稳就切走。 */
const SETTLE = 200;

/** “字数”：去掉空白后的字符数（中文一字一个，英文按字母计，标点也算）。 */
export function readChars(...texts: (string | null | undefined)[]): number {
  let n = 0;
  for (const t of texts) if (t) for (const ch of t) if (!/\s/.test(ch)) n++;
  return n;
}

/** 保留 readChars 的非空白字符口径，宽字符 125ms、拉丁字符 1000/15ms；先截断阅读时间，再应用倍速。 */
export function readingMs(...texts: (string | null | undefined)[]): number {
  return Math.min(MAX_READ_MS, Math.max(MIN_DWELL, rawReadingMs(...texts)));
}

/** 不套 3 秒下限的阅读时间（作者用 hold 掌握节奏时，D92）：仍按字数，最多 MAX_READ_MS。 */
export function rawReadingMs(...texts: (string | null | undefined)[]): number {
  let ms = 0;
  for (const t of texts) if (t) for (const ch of t) {
    if (/\s/.test(ch)) continue;
    ms += (ch.codePointAt(0) ?? 0) > 0x2e80 ? MS_PER_CHAR : LATIN_MS_PER_CHAR;
  }
  return Math.min(MAX_READ_MS, ms);
}

/**
 * 这一步提交之后至少停留多久（毫秒）。
 * text：说明与解说；cameraMoved：这一步镜头有变化（切层或换焦点）；dotMs：本步 active 连线上小点跑一圈的最长时间（没有为 0）。
 */
export function stepDwell(o: { texts: (string | null | undefined)[]; speed?: number; cameraMoved?: boolean; dotMs?: number; /** 本步流式输出的文字（D56）：等它们出完再加阅读时间。 */ streams?: string[]; /** 作者写了 hold（D92）：节奏由作者掌握，阅读时间不套 3 秒下限（仍按字数）。 */ paced?: boolean }): number {
  const speed = o.speed && o.speed > 0 ? o.speed : 1;
  const read = (o.paced ? rawReadingMs(...o.texts) : readingMs(...o.texts)) / speed;
  const cam = o.cameraMoved ? CAMERA_MS + SETTLE : 0;
  const dots = o.dotMs && o.dotMs > 0 ? o.dotMs + SETTLE : 0;
  // 流式输出：先等最长的一段出完，再留出读完它的时间（按出完之后再读一遍的一半计）
  const longest = Math.max(0, ...(o.streams ?? []).map((t) => streamMs(t, speed)));
  const streamed = longest ? longest + Math.max((o.paced ? 0 : MIN_DWELL) / speed, read / 2) : 0;
  return Math.round(Math.max(read, cam, dots, streamed));
}

/** 朗读估算（旁白 / 台词）：中日韩约每秒 4.5 字、拉丁文字约每秒 13 个非空白字符（约 2.5 词），读完再留 0.45 秒换气。 */
export const VOICE_CJK_MS = 220;
export const VOICE_LATIN_MS = 75;
const VOICE_EST_BREATH_MS = 450;
/** 一段旁白大约读多久（毫秒，1×）；没有文字时为 0。自动播放以真实读完为准，这个只用于封面、outline 与 check 的估算。 */
export function voiceMs(text: string | null | undefined, speed = 1): number {
  if (!text) return 0;
  let ms = 0;
  for (const ch of text) {
    if (/[\s\p{P}]/u.test(ch)) continue;
    ms += (ch.codePointAt(0) ?? 0) > 0x2e80 ? VOICE_CJK_MS : VOICE_LATIN_MS;
  }
  return ms ? Math.round((ms + VOICE_EST_BREATH_MS) / (speed > 0 ? speed : 1)) : 0;
}
