/**
 * 媒体插件的纯函数（Node 编译期）：读出片段时长，供 holdMs（D98）与参数校验使用。
 * 素材在编译期是 asset() 的 data URL；只读文件头，不解码画面。
 */

export type ClipFrame = {
  /** 这一步结束时画面停在的时间（秒）。 */
  to: number;
  /** 这一步从哪里开始播（秒）；live = 这一步播放，否则静止在 to。 */
  from: number;
  live: boolean;
};

export function decodeDataUrl(src: unknown): { mime: string; bytes: Uint8Array } | null {
  if (typeof src !== 'string') return null;
  const m = /^data:([a-z0-9.+/-]+)(?:;[^,]*)?;base64,/i.exec(src);
  if (!m) return null;
  return { mime: m[1]!.toLowerCase(), bytes: Uint8Array.from(Buffer.from(src.slice(m[0].length), 'base64')) };
}

const u32 = (b: Uint8Array, i: number) => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;

/** MP4 时长（秒）：读 moov/mvhd 的 timescale 与 duration；找不到时 null。 */
export function mp4DurationSec(bytes: Uint8Array): number | null {
  for (let i = 4; i + 32 < bytes.length; i++) {
    if (bytes[i] !== 0x6d || bytes[i + 1] !== 0x76 || bytes[i + 2] !== 0x68 || bytes[i + 3] !== 0x64) continue; // 'mvhd'
    const version = bytes[i + 4];
    if (version === 0) {
      const scale = u32(bytes, i + 16), duration = u32(bytes, i + 20);
      return scale ? duration / scale : null;
    }
    if (version === 1) {
      const scale = u32(bytes, i + 24), duration = u32(bytes, i + 28) * 2 ** 32 + u32(bytes, i + 32);
      return scale ? duration / scale : null;
    }
    return null;
  }
  return null;
}

/** Lottie 动画信息：帧率、起止帧、尺寸；不是合法的 Lottie JSON 时 null。 */
export function lottieInfo(json: unknown): { fr: number; ip: number; op: number; w: number; h: number; durationSec: number } | null {
  const j = json as Record<string, unknown> | null;
  if (!j || typeof j !== 'object') return null;
  const n = (k: string) => (typeof j[k] === 'number' && Number.isFinite(j[k]) ? (j[k] as number) : null);
  const fr = n('fr'), ip = n('ip'), op = n('op'), w = n('w'), h = n('h');
  if (fr === null || ip === null || op === null || w === null || h === null || fr <= 0 || op <= ip || !Array.isArray(j.layers)) return null;
  return { fr, ip, op, w, h, durationSec: (op - ip) / fr };
}

/** 素材的时长（秒）：MP4 读文件头；Lottie 读 JSON；WebM 等未知时 null（作者要写 to）。 */
export function durationOf(src: unknown): number | null {
  const d = decodeDataUrl(src);
  if (!d) return null;
  if (d.mime === 'video/mp4') return mp4DurationSec(d.bytes);
  if (d.mime === 'application/json') {
    try { return lottieInfo(JSON.parse(Buffer.from(d.bytes).toString('utf8')))?.durationSec ?? null; } catch { return null; }
  }
  return null;
}
