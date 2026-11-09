import type { MediaDriver, MediaSnapshot } from '@joplo-app/kit/plugin';
import { pluginStatus } from '../renderer/plugins';
/** Browser host owns permission, clock, gain and lifecycle; plugins only synthesize bytes. */
export class MediaEngine {
  private audio: AudioContext | null = null;
  private slots = new Map<string, { resource: string; gain: GainNode; driver?: MediaDriver; dead: boolean }>();
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
  update(snapshot: MediaSnapshot, assets: Record<string, string>, frame: { playing: boolean; enabled: boolean; speed: number; elapsedMs: number; duck: boolean; identity: string }) {
    const audio = this.audio;
    if (!audio || audio.state !== 'running') return;
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
        slot = { resource: url, gain, dead: false }; this.slots.set(key, slot);
        const current = slot;
        void this.bytes(url).then(async bytes => {
          if (!bytes || current.dead) return;
          const driver = await runtime.runtime.media!({ audio, destination: gain, bytes });
          if (current.dead) driver.destroy(); else current.driver = driver;
        }).catch(() => { current.dead = true; current.gain.disconnect(); });
      }
      const elapsed = frame.elapsedMs;
      const fadeIn = t.fadeInMs ? Math.min(1, (t.offsetMs + elapsed) / t.fadeInMs) : 1;
      const fadeOut = t.stopAfterMs !== undefined ? Math.max(0, 1 - elapsed / Math.max(1, t.stopAfterMs)) : 1;
      const playing = frame.playing && (t.stopAfterMs === undefined || elapsed < t.stopAfterMs);
      slot.gain.gain.setTargetAtTime(playing ? t.volume * fadeIn * fadeOut * (frame.duck ? .25 : 1) : 0, audio.currentTime, .015);
      slot.driver?.update({ offsetMs: t.offsetMs + elapsed, volume: 1, loop: t.loop, speed: frame.speed, playing });
    }
    for (const key of this.slots.keys()) if (!wanted.has(key)) this.remove(key);
  }
  private remove(key: string) { const slot = this.slots.get(key); if (!slot) return; slot.dead = true; slot.driver?.destroy(); slot.gain.disconnect(); this.slots.delete(key); }
  destroy() { this.disposed = true; for (const k of this.slots.keys()) this.remove(k); void this.audio?.close().catch(() => {}); this.audio = null; }
  status() { return { state: this.audio?.state ?? 'locked', tracks: [...this.slots.values()].filter(s => s.driver).length, time: this.audio?.currentTime ?? 0 }; }
}
