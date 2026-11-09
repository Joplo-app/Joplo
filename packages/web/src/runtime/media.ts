import type { MediaDriver, MediaSnapshot } from '@joplo-app/kit/plugin';
import { pluginStatus } from '../renderer/plugins';
/** Browser host owns permission, clock, gain and lifecycle; plugins only synthesize bytes. */
export class MediaEngine {
  private audio: AudioContext | null = null;
  private slots = new Map<string, { resource: string; gain: GainNode; driver?: MediaDriver; dead: boolean; origin?: number }>();
  private urls = new Map<string, Promise<Uint8Array | null>>();
  private disposed = false;
  unlock = () => {
    if (this.disposed || typeof AudioContext === 'undefined') return;
    this.audio ??= new AudioContext();
    void this.audio.resume().catch(() => {});
  };
  private bytes(url: string): Promise<Uint8Array | null> {
    if (!this.urls.has(url)) this.urls.set(url, (async () => {
      try {
        const data = url.startsWith('data:') ? url : (await (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-joplo-token': document.querySelector<HTMLMetaElement>('meta[name="joplo-token"]')?.content ?? '' }, body: '{}' })).json()).url;
        if (typeof data !== 'string' || !/^data:[^;,]+;base64,/.test(data)) return null;
        return Uint8Array.from(atob(data.slice(data.indexOf(',') + 1)), c => c.charCodeAt(0));
      } catch { return null; }
    })().then(bytes => { if (!bytes) this.urls.delete(url); return bytes; }));
    return this.urls.get(url)!;
  }
  /**
   * 连续性（D92）：同一个 identity（播放的 epoch，跳转 / 换章重置时才变）里，一条轨道一旦开始，偏移就跟着引擎时钟走
   * （origin = 开始时的引擎时间 − 快照偏移），不再每步按编译期的停留估算回跳；暂停时引擎时钟不走，偏移也不走。
   * 交叉淡化：快照里出现一个还没有槽位的键，而某个不再需要的槽位放的是同一个资源（「轨道>旧资源」淡出键），就把那个槽位
   * 挪过去继续播，不重建驱动、不断音。
   */
  update(snapshot: MediaSnapshot, assets: Record<string, string>, frame: { playing: boolean; enabled: boolean; speed: number; elapsedMs: number; duck: boolean; identity: string; /** 引擎的连续时间（毫秒）；缺省时退回快照偏移。 */ timeMs?: number }) {
    const audio = this.audio;
    if (!audio || audio.state !== 'running') return;
    const keys = new Map<string, string>();
    for (const [id, t] of Object.entries(snapshot)) if (assets[t.resource] && frame.enabled) keys.set(`${frame.identity}:${id}`, assets[t.resource]!);
    for (const [key, url] of keys) {
      if (this.slots.get(key)?.resource === url) continue;
      // 空出来的槽位：快照不再要它，或者它的键现在要放别的资源（换曲时旧曲所在的轨道键）
      const spare = [...this.slots.entries()].find(([k, slot]) => k !== key && keys.get(k) !== slot.resource && slot.resource === url && k.startsWith(`${frame.identity}:`));
      if (!spare) continue;
      const displaced = this.slots.get(key);
      this.slots.delete(spare[0]);
      if (displaced) this.slots.set(spare[0], displaced);
      this.slots.set(key, spare[1]);
    }
    const wanted = new Set<string>();
    for (const [id, t] of Object.entries(snapshot)) {
      const key = `${frame.identity}:${id}`, url = assets[t.resource];
      if (!url || !frame.enabled) continue;
      wanted.add(key);
      let slot = this.slots.get(key);
      if (slot && slot.resource !== url) { this.remove(key); slot = undefined; }
      if (!slot) {
        if (!frame.playing) continue;
        const runtime = pluginStatus(t.plugin);
        if (runtime.state !== 'ready' || !runtime.runtime.media) continue;
        const gain = audio.createGain(); gain.gain.value = 0; gain.connect(audio.destination);
        slot = { resource: url, gain, dead: false, origin: frame.timeMs === undefined ? undefined : frame.timeMs - (t.offsetMs + frame.elapsedMs) }; this.slots.set(key, slot);
        const current = slot;
        void this.bytes(url).then(async bytes => {
          if (!bytes || current.dead) return;
          const driver = await runtime.runtime.media!({ audio, destination: gain, bytes });
          if (current.dead) driver.destroy(); else current.driver = driver;
        }).catch(() => { current.dead = true; current.gain.disconnect(); });
      }
      const elapsed = frame.elapsedMs;
      const offset = slot.origin !== undefined && frame.timeMs !== undefined ? frame.timeMs - slot.origin : t.offsetMs + elapsed;
      const fadeIn = t.fadeInMs ? Math.min(1, (t.offsetMs + elapsed) / t.fadeInMs) : 1;
      const fadeOut = t.stopAfterMs !== undefined ? Math.max(0, 1 - elapsed / Math.max(1, t.stopAfterMs)) : 1;
      const playing = frame.playing && (t.stopAfterMs === undefined || elapsed < t.stopAfterMs);
      slot.gain.gain.setTargetAtTime(playing ? t.volume * fadeIn * fadeOut * (frame.duck ? .25 : 1) : 0, audio.currentTime, .015);
      slot.driver?.update({ offsetMs: offset, volume: 1, loop: t.loop, speed: frame.speed, playing });
    }
    for (const key of this.slots.keys()) if (!wanted.has(key)) this.remove(key);
  }
  private remove(key: string) { const slot = this.slots.get(key); if (!slot) return; slot.dead = true; slot.driver?.destroy(); slot.gain.disconnect(); this.slots.delete(key); }
  destroy() { this.disposed = true; for (const k of this.slots.keys()) this.remove(k); void this.audio?.close().catch(() => {}); this.audio = null; }
  status() { return { state: this.audio?.state ?? 'locked', tracks: [...this.slots.values()].filter(s => s.driver).length, time: this.audio?.currentTime ?? 0 }; }
}
