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
export const gestureProgress = (now: number, start: number, duration: number) => duration <= 0 ? 1 : Math.max(0, Math.min(1, (now - start) / duration));
export const gesturePoint = (from: {x:number;y:number}, to: {x:number;y:number}, t: number) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
