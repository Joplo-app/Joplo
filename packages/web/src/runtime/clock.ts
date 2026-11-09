/** The sole timeline time integrator. RAF/timers may sample it, never accumulate their own timeline time. */
export type ClockFrame = Readonly<{ timeMs: number; elapsedMs: number; rawMs: number; running: boolean; speed: number; paused?: boolean }>;
export type ClockSource = { subscribe: (fn: () => void) => () => void; getSnapshot: () => ClockFrame };
export class EngineClock implements ClockSource {
  private last: number | null = null;
  private anchor = 0;
  private frame: ClockFrame = Object.freeze({ timeMs: 0, elapsedMs: 0, rawMs: 0, running: false, speed: 1 });
  private listeners = new Set<() => void>();
  get time() { return this.frame.timeMs; }
  get rawTime() { return this.frame.rawMs; }
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.frame;
  update(now: number, next: { running: boolean; speed: number; paused?: boolean }): void {
    if (!Number.isFinite(now)) return;
    const delta = this.last === null ? 0 : Math.max(0, now - this.last);
    this.last = Math.max(this.last ?? now, now);
    const timeMs = this.frame.timeMs + (this.frame.running ? delta * this.frame.speed : 0);
    const rawMs = this.frame.rawMs + (this.frame.running ? delta : 0);
    if (timeMs === this.frame.timeMs && next.running === this.frame.running && next.speed === this.frame.speed && !!next.paused === !!this.frame.paused) return;
    this.frame = Object.freeze({ timeMs, elapsedMs: timeMs - this.anchor, rawMs, running: next.running, speed: next.speed, paused: !!next.paused });
    this.listeners.forEach(fn => fn());
  }
  mark(): void {
    this.anchor = this.time;
    this.frame = Object.freeze({ ...this.frame, elapsedMs: 0 });
    this.listeners.forEach(fn => fn());
  }
}
const coarse = new WeakMap<ClockSource, { key: string; frame: ClockFrame }>();
/**
 * 粗粒度时钟快照：只在“运行 / 暂停 / 倍速”变化时换一个对象，时间字段是读取那一刻的实时值。
 * 舞台和普通节点订阅它，播放时不会每帧整树重渲染；真正逐帧画的呈现器（画布镜头、3D、逐字文字、连线小点）
 * 另外用 useEngineFrame() 订阅每一帧。
 */
export function coarseFrame(source: ClockSource): ClockFrame {
  const s = source.getSnapshot();
  const key = `${s.running}|${s.speed}|${!!s.paused}`;
  const hit = coarse.get(source);
  if (hit && hit.key === key) return hit.frame;
  const frame: ClockFrame = Object.freeze({
    get timeMs() { return source.getSnapshot().timeMs; },
    get elapsedMs() { return source.getSnapshot().elapsedMs; },
    get rawMs() { return source.getSnapshot().rawMs; },
    running: s.running, speed: s.speed, paused: !!s.paused,
  });
  coarse.set(source, { key, frame });
  return frame;
}
export const gestureProgress = (now: number, start: number, duration: number) => duration <= 0 ? 1 : Math.max(0, Math.min(1, (now - start) / duration));
export const gesturePoint = (from: {x:number;y:number}, to: {x:number;y:number}, t: number) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
