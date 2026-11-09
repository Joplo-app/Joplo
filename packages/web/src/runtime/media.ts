import type { MediaDriver, MediaSnapshot } from '@joplo-app/kit/plugin';
import { pluginStatus } from '../renderer/plugins';
/** Browser host owns permission, clock, gain and lifecycle; plugins only synthesize bytes. */
export class MediaEngine {
  private audio: AudioContext | null = null;
  private slots = new Map<string, { resource: string; gain: GainNode; driver?: MediaDriver; dead: boolean; origin?: number; loop?: boolean; fade?: { start: number; ms: number; volume: number } }>();
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
      const now = frame.timeMs;
      const anchored = slot.origin !== undefined && now !== undefined;
      const offset = anchored ? now - slot.origin! : t.offsetMs + elapsed;
      // 淡入按这条轨道自己的（引擎时间）偏移；淡出在第一次出现时锚定起点、时长与当时的音量（D92 R2）：
      // 之后各步快照里编译期按估算推进的 stopAfterMs / volume 不再改变它，淡完就一直静音，直到快照不再要求淡出（再次 play 同一首）
      const fadeIn = t.fadeInMs ? Math.min(1, offset / t.fadeInMs) : 1;
      if (t.stopAfterMs === undefined) slot.fade = undefined;
      else if (!slot.fade) slot.fade = { start: anchored ? now - elapsed : 0, ms: Math.max(1, t.stopAfterMs), volume: t.volume };
      const fadeOut = !slot.fade ? 1 : anchored ? Math.max(0, 1 - (now - slot.fade.start) / slot.fade.ms) : Math.max(0, 1 - elapsed / Math.max(1, t.stopAfterMs!));
      const volume = slot.fade && anchored ? slot.fade.volume : t.volume;
      const playing = frame.playing && fadeOut > 0;
      slot.gain.gain.setTargetAtTime(playing ? volume * fadeIn * fadeOut * (frame.duck ? .25 : 1) : 0, audio.currentTime, .015);
      slot.loop = t.loop;
      slot.driver?.update({ offsetMs: offset, volume: 1, loop: t.loop, speed: frame.speed, playing });
    }
    for (const [key, slot] of this.slots) {
      if (wanted.has(key)) continue;
      // 编译期按 hold 估算淡出已结束、快照不再列出它，但按引擎时间还没淡完（这一步比 hold 短）：在同一个 seek 里淡完再销毁（D92 R2）
      const now = frame.timeMs;
      const left = slot.fade && slot.origin !== undefined && now !== undefined && key.startsWith(`${frame.identity}:`) && frame.enabled ? 1 - (now - slot.fade.start) / slot.fade.ms : 0;
      if (left <= 0) { this.remove(key); continue; }
      slot.gain.gain.setTargetAtTime(frame.playing ? slot.fade!.volume * left * (frame.duck ? .25 : 1) : 0, audio.currentTime, .015);
      slot.driver?.update({ offsetMs: now! - slot.origin!, volume: 1, loop: slot.loop ?? false, speed: frame.speed, playing: frame.playing });
    }
  }
  private remove(key: string) { const slot = this.slots.get(key); if (!slot) return; slot.dead = true; slot.driver?.destroy(); slot.gain.disconnect(); this.slots.delete(key); }
  destroy() { this.disposed = true; for (const k of this.slots.keys()) this.remove(k); void this.audio?.close().catch(() => {}); this.audio = null; }
  status() { return { state: this.audio?.state ?? 'locked', tracks: [...this.slots.values()].filter(s => s.driver).length, time: this.audio?.currentTime ?? 0 }; }
}
