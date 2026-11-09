/**
 * 自动播放的节奏（T-director2）：演示页、发布站与视频录制共用。
 * 阅读时长、流式输出与停留的纯函数在 core（@joplo-app/core 的 pace.ts，D67：`joplo outline` 与 check 也用它估算时长），
 * 这里原样 re-export，并保留只属于界面的速度档位与镜头曲线。
 */
export { CAMERA_MS, LATIN_MS_PER_CHAR, MAX_READ_MS, MIN_DWELL, MS_PER_CHAR, STREAM_MAX, STREAM_MIN, STREAM_MS_PER_CHAR, readChars, readingMs, stepDwell, streamMs, voiceMs } from '@joplo-app/core/runtime';

export const SPEEDS = [0.5, 1, 1.5] as const;
export type Speed = (typeof SPEEDS)[number];
/** 急起缓停、无回弹；镜头动画只读这一份曲线。 */
export const CAMERA_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const asSpeed = (v: unknown): Speed => (SPEEDS as readonly number[]).includes(Number(v)) ? (Number(v) as Speed) : 1;
