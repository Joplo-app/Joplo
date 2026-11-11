import { audioResource } from './audio-source';
import { playLeasedAudio } from './record-voice';
import type { Narration } from './voice';
import { prepareRegion, type NarrationLease } from './audio-media';
import { audioMedia, decodedLease } from './audio-media';
import { MediaCache } from './media-cache';
import type { AudioRegion, MediaDriver, MediaSnapshot } from '@joplo-app/kit/plugin';
import { pluginStatus } from '../renderer/plugins';
/** Browser host owns permission, clock, gain and lifecycle; the host decodes audio bytes; custom media plugins may supply a driver. */
export class MediaEngine {
  private audio: AudioContext | null = null;
  private slots = new Map<string, { resource: string; gain: GainNode; driver?: MediaDriver; dead: boolean; retired?:boolean; release?:()=>void; startOffset?: number; startEventId?: string; beginOffset?: number; fadeInMs?: number; waiting?: boolean; duck?: boolean; retirementOrder?: number; oneShot?: boolean; endOffset?: number; volume?: number; origin?: number; loop?: boolean; fade?: { start: number; ms: number; volume: number } }>();
  private retirementOrder = 0;
  private completed = new Set<string>();
  private mediaIdentity: string | undefined;
  private encoded=new MediaCache<{bytes:Uint8Array;audio?:AudioRegion}>({budgetBytes:4*1024*1024,concurrency:2,label:'encoded audio'});
  private decoded=new MediaCache<AudioBuffer>({budgetBytes:32*1024*1024,concurrency:1,label:'decoded PCM'});
  private warm:(()=>void)[]=[];
  private disposed = false;
  private narrations = new Set<Narration>();
  private failures = new Map<string, string>();
  private captureError: string | null = null;
  private capture?: MediaStreamAudioDestinationNode;
  private recorder?: MediaRecorder;
  private captureClock?: ConstantSourceNode;
  private chunks: Blob[] = [];

  async startCapture(assets: Record<string, string>, info:Record<string,AudioRegion>={}) {
    this.captureError = null;
    this.unlock();
    const audio = this.audio; if (!audio) throw new Error('AudioContext unavailable for video export');
    await audio.resume();
    // Warm only the first cue, one decode at a time; later cues use the same bounded lazy cache.
    const first=Object.entries(assets)[0];
    if(first){const lease=this.bytes(first[1]);this.warm.push(lease.release);const loaded=await lease.value;
      const pcm=decodedLease(audio,loaded.bytes,first[1],this.decoded,info[first[0]]??loaded.audio);this.warm.push(pcm.release);await pcm.value;}
    this.capture = audio.createMediaStreamDestination();
    // Keep the graph producing silent frames between cues: disconnected input makes
    // Chromium MediaRecorder omit time, invalidating recorded Opus PTS.
    this.captureClock=audio.createConstantSource();this.captureClock.offset.value=0;
    this.captureClock.connect(this.capture);this.captureClock.start();
    this.recorder = new MediaRecorder(this.capture.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 128000 });
    this.chunks = []; this.recorder.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); };
    this.recorder.start(250);
  }
  async endCapture(): Promise<{ data: string } | null> {
    if (this.captureError) throw new Error(this.captureError);
    const recorder = this.recorder; if (!recorder) return null;
    await new Promise<void>((resolve, reject) => { recorder.onstop = () => resolve(); recorder.onerror = () => reject(new Error('Audio recording failed')); recorder.stop(); });
    const blob = new Blob(this.chunks, { type: recorder.mimeType });
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]!); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
    this.captureClock?.stop();this.captureClock?.disconnect();this.captureClock=undefined;this.chunks=[];this.recorder=undefined;this.capture?.stream.getTracks().forEach(t=>t.stop());this.capture=undefined;return { data };
  }
  /** 校准闪屏出现那一刻的页面时间（performance.now）；录制端用它把字幕时间对到视频时间轴上。 */
  calibratedAt: number | null = null;
  /**
   * 录制旁白（#56）：在同一个 AudioContext 里播一段已解码的旁白，同时进扬声器和录音轨（配乐因此照常避让）。
   * 没有 AudioContext 时返回 null。
   */
  narrationOutput(): { audio: AudioContext; connect(node: AudioNode): void } | null {
    const audio = this.audio; if (!audio) return null;
    return { audio, connect: (node) => { node.connect(audio.destination); if (this.capture) node.connect(this.capture); } };
  }
  /** 解码录制要用的一段旁白（与配乐同一个 AudioContext）。 */
  async decode(bytes: ArrayBuffer): Promise<AudioBuffer> {
    this.unlock();
    const audio = this.audio; if (!audio) throw new Error('AudioContext unavailable');
    return audio.decodeAudioData(bytes);
  }
  /** A consumer-owned lease over the existing encoded/PCM caches. Release cancels this consumer immediately. */
  prepareNarration(url: string, info?: AudioRegion): NarrationLease {
    let encoded: ReturnType<MediaEngine['bytes']> | undefined;
    let pcm: ReturnType<typeof decodedLease> | undefined;
    let cancelled = false, rejectCancel!: (error: Error) => void;
    const cancellation = new Promise<never>((_, reject) => { rejectCancel = reject; });
    const release = () => {
      if (cancelled) return; cancelled = true;
      pcm?.release(); pcm = undefined; encoded?.release(); encoded = undefined;
      rejectCancel(new Error('Narration audio preparation cancelled'));
    };
    const loading = (async () => {
      this.unlock();
      const audio = this.audio; if (!audio) throw new Error('AudioContext unavailable');
      encoded = this.bytes(url);
      const source = await encoded.value;
      if (cancelled) throw new Error('Narration audio preparation cancelled');
      const audioInfo = info ?? source.audio;
      pcm = decodedLease(audio, source.bytes, url, this.decoded, audioInfo);
      const buffer = await pcm.value;
      if (cancelled) throw new Error('Narration audio preparation cancelled');
      return { buffer, region: prepareRegion(buffer, audioInfo), ...(audioInfo ? { info: audioInfo } : {}) };
    })();
    const value = Promise.race([loading, cancellation]);
    // Failed acquisition/validation releases before the caller handles its rejection.
    void value.catch(() => release());
    return { value, release };
  }
  /** Explicit narration shares the same lease/region path as recording. */
  narrate(url: string, speed: number, info?: AudioRegion): Narration {
    const narration = playLeasedAudio(this.prepareNarration(url, info), speed, { output: () => this.narrationOutput() });
    this.narrations.add(narration);
    void narration.done.then(() => this.narrations.delete(narration));
    return narration;
  }
  async calibrate() {
    const audio=this.audio,capture=this.capture;if(!audio||!capture)return false;
    const overlay=document.createElement('div');overlay.style.cssText='position:fixed;inset:0;z-index:2147483647;background:rgb(255,0,255);pointer-events:none';
    const tone=audio.createOscillator(),gain=audio.createGain();gain.gain.value=.65;tone.frequency.value=2000;tone.connect(gain);gain.connect(capture);
    const when=audio.currentTime+.06;tone.start(when);tone.stop(when+.15);tone.onended=()=>{tone.disconnect();gain.disconnect();};
    await new Promise<void>(resolve=>{const tick=()=>{if(audio.currentTime>=when){document.body.append(overlay);this.calibratedAt=performance.now();resolve();}else requestAnimationFrame(tick);};requestAnimationFrame(tick);});
    await new Promise(r=>setTimeout(r,230));return true;
  }
  unlock = () => {
    if (this.disposed || typeof AudioContext === 'undefined') return;
    this.audio ??= new AudioContext();
    void this.audio.resume().catch(() => {});
  };
  private bytes(url:string) {
    return this.encoded.acquire(url,async()=>{
      const value = await audioResource(url);
      return { value, bytes: value.bytes.byteLength };
    },url.startsWith('data:')?Math.floor((url.length-url.indexOf(',')-1)*.75)-(url.endsWith('==')?2:url.endsWith('=')?1:0):0);
  }
  /**
   * 连续性（D92）：同一个 identity（播放的 epoch，跳转 / 换章重置时才变）里，一条轨道一旦开始，偏移就跟着引擎时钟走
   * （origin = 开始时的引擎时间 − 快照偏移），不再每步按编译期的停留估算回跳；暂停时引擎时钟不走，偏移也不走。
   * 交叉淡化：快照里出现一个还没有槽位的键，而某个不再需要的槽位放的是同一个资源（「轨道>旧资源」淡出键），就把那个槽位
   * 挪过去继续播，不重建驱动、不断音。
   */
  update(snapshot: MediaSnapshot, assets: Record<string, string>, frame: { playing: boolean; enabled: boolean; speed: number; elapsedMs: number; duck: boolean; identity: string; /** 引擎的连续时间（毫秒）；缺省时退回快照偏移。 */ timeMs?: number }, info:Record<string,AudioRegion>={}) {
    const audio = this.audio;
    if (!audio || audio.state !== 'running') return;
    if (this.mediaIdentity !== frame.identity) { this.completed.clear(); this.mediaIdentity = frame.identity; }
    const keys = new Map<string, string>();
    for (const [id, t] of Object.entries(snapshot)) if (assets[t.resource] && frame.enabled && !this.completed.has(`${frame.identity}:${id}`)) keys.set(`${frame.identity}:${id}`, assets[t.resource]!);
    for (const [key, url] of keys) {
      if (snapshot[key.slice(frame.identity.length + 1)]?.endAfterMs !== undefined || this.slots.get(key)?.resource === url) continue;
      // 空出来的槽位：快照不再要它，或者它的键现在要放别的资源（换曲时旧曲所在的轨道键）
      const base = key.split('>')[0]!;
      const spare = key.includes('>') ? [...this.slots.entries()].find(([k, slot]) => {
        const desired = snapshot[k.slice(frame.identity.length + 1)];
        const replacing = keys.get(k) !== slot.resource || desired?.startEventId !== slot.startEventId || desired?.startOffsetMs !== slot.startOffset;
        return !slot.oneShot && !slot.retired && k !== key && replacing && slot.resource === url && k.split('>')[0] === base;
      }) : undefined;
      if (!spare) continue;
      const displaced = this.slots.get(key);
      this.slots.delete(spare[0]);
      if (displaced) this.slots.set(spare[0], displaced);
      this.slots.set(key, spare[1]);
    }
    const wanted = new Set<string>();
    for (const [id, t] of Object.entries(snapshot)) {
      const key = `${frame.identity}:${id}`, url = assets[t.resource];
      if (!url || !frame.enabled || this.completed.has(key)) continue;
      const existing = this.slots.get(key);
      const projectedOffset = existing?.origin !== undefined && frame.timeMs !== undefined ? frame.timeMs - existing.origin : t.offsetMs + frame.elapsedMs - (t.delayRemainingMs ?? t.startDelayMs ?? 0);
      if (t.endAfterMs !== undefined && projectedOffset >= t.offsetMs + t.endAfterMs) { this.completed.add(key); this.remove(key); continue; }
      wanted.add(key);
      let slot = this.slots.get(key);
      if (slot && (slot.resource !== url || slot.startOffset !== t.startOffsetMs || slot.startEventId !== t.startEventId)) { this.remove(key); slot = undefined; }
      if(slot?.retired){if(t.stopAfterMs!==undefined)continue;this.remove(key);slot=undefined;}
      if (!slot) {
        if (!frame.playing) continue;
        const runtime = pluginStatus(t.plugin);
        if (runtime.state !== 'ready') continue;
        const factory = runtime.runtime.media ?? audioMedia;
        const gain = audio.createGain(); gain.gain.value = 0; gain.connect(audio.destination);
        if (this.capture) gain.connect(this.capture);
        slot = { resource: url, gain, dead: false, oneShot: t.endAfterMs !== undefined, endOffset: t.endAfterMs === undefined ? undefined : t.offsetMs + t.endAfterMs, volume: t.volume, duck: t.duck, beginOffset: t.startOffsetMs ?? 0, fadeInMs: t.fadeInMs, startOffset: t.startOffsetMs, startEventId: t.startEventId, origin: frame.timeMs === undefined ? undefined : frame.timeMs - (t.offsetMs + frame.elapsedMs - (t.delayRemainingMs ?? t.startDelayMs ?? 0)) }; this.slots.set(key, slot);
        const current = slot;
        const lease=this.bytes(url);current.release=lease.release;
        void lease.value.then(async loaded => {
          if (current.dead) return;
          const args={audio,destination:gain,bytes:loaded.bytes,audioInfo:info[t.resource]??loaded.audio};
          const driver = await (factory===audioMedia?audioMedia({...args,cache:this.decoded,key:url}):factory(args));
          this.warm.splice(0).forEach(release=>release());
          if (current.dead) driver.destroy(); else current.driver = driver;
        }).catch((error: unknown) => {
          if (current.dead || this.disposed) return;
          const reason = error instanceof Error ? error.message : 'Unable to load or decode audio';
          const message = `Audio ${t.resource} (${id}) failed: ${reason}`;
          this.failures.set(key, message);
          if (this.recorder) this.captureError ??= message;
          console.warn(message);
          current.release?.();current.release=undefined;current.dead=true;current.gain.disconnect();
        });
      }
      const elapsed = frame.elapsedMs;
      const now = frame.timeMs;
      const anchored = slot.origin !== undefined && now !== undefined;
      const offset = anchored ? now - slot.origin! : t.offsetMs + elapsed - (t.delayRemainingMs ?? t.startDelayMs ?? 0);
      const waiting = offset < (slot.beginOffset ?? 0);
      slot.waiting = waiting; slot.duck = t.duck;
      // 淡入按这条轨道自己的（引擎时间）偏移；淡出在第一次出现时锚定起点、时长与当时的音量（D92 R2）：
      // 之后各步快照里编译期按估算推进的 stopAfterMs / volume 不再改变它，淡完就一直静音，直到快照不再要求淡出（再次 play 同一首）
      const fadeIn = t.fadeInMs ? Math.max(0, Math.min(1, (offset - (t.startOffsetMs ?? 0)) / t.fadeInMs)) : 1;
      if (t.stopAfterMs === undefined) slot.fade = undefined;
      else if (!slot.fade) { slot.fade = { start: anchored ? now - elapsed : 0, ms: Math.max(1, t.stopAfterMs), volume: t.volume }; slot.retirementOrder = ++this.retirementOrder; }
      const fadeOut = !slot.fade ? 1 : anchored ? Math.max(0, 1 - (now - slot.fade.start) / slot.fade.ms) : Math.max(0, 1 - elapsed / Math.max(1, t.stopAfterMs!));
      if(slot.fade&&fadeOut<=0){slot.gain.gain.setTargetAtTime(0,audio.currentTime,.015);slot.driver?.update({offsetMs:Math.max(slot.beginOffset ?? 0,offset),volume:1,loop:t.loop,speed:frame.speed,playing:false});slot.dead=true;slot.retired=true;slot.driver?.destroy();slot.driver=undefined;slot.release?.();slot.release=undefined;slot.gain.disconnect();continue;}
      const volume = slot.fade && anchored ? slot.fade.volume : t.volume;
      const playing = frame.playing && !waiting && fadeOut > 0;
      slot.gain.gain.setTargetAtTime(playing ? volume * fadeIn * fadeOut * (frame.duck && slot.duck !== false ? .25 : 1) : 0, audio.currentTime, .015);
      slot.loop = t.loop;
      slot.driver?.update({ offsetMs: Math.max(slot.beginOffset ?? 0, offset), volume: 1, loop: t.loop, speed: frame.speed, playing });
    }
    // Bound only this named track's retiring voices, preserving the newest retirement.
    // Missing estimated snapshots may still have live fades, so the runtime enforces it too.
    for (const [id, track] of Object.entries(snapshot)) if (!id.includes('>') && track.maxRetiring !== undefined) {
      const prefix = `${frame.identity}:${id}>`;
      const retiring = [...this.slots.entries()].filter(([key, slot]) => key.startsWith(prefix) && !!slot.fade && !slot.retired)
        .sort((a, b) => (a[1].retirementOrder ?? 0) - (b[1].retirementOrder ?? 0));
      for (const [key] of retiring.slice(0, Math.max(0, retiring.length - track.maxRetiring))) { this.completed.add(key); this.remove(key); }
    }
    for (const [key, slot] of this.slots) {
      if (wanted.has(key)) continue;
      // 编译期按 hold 估算淡出已结束、快照不再列出它，但按引擎时间还没淡完（这一步比 hold 短）：在同一个 seek 里淡完再销毁（D92 R2）
      const now = frame.timeMs;
      // Snapshot timing is an estimate. A live one-shot retains its actual clock anchor
      // even when a later estimated snapshot has already omitted the event.
      if (slot.oneShot && slot.origin !== undefined && now !== undefined && key.startsWith(`${frame.identity}:`) && frame.enabled) {
        const offset = now - slot.origin;
        if (offset < slot.endOffset!) {
          slot.waiting = offset < (slot.beginOffset ?? 0);
          const fadeIn = slot.fadeInMs ? Math.max(0, Math.min(1, (offset - (slot.beginOffset ?? 0)) / slot.fadeInMs)) : 1;
          slot.gain.gain.setTargetAtTime(frame.playing && !slot.waiting ? (slot.volume ?? 1) * fadeIn * (frame.duck && slot.duck !== false ? .25 : 1) : 0, audio.currentTime, .015);
          slot.driver?.update({ offsetMs: Math.max(slot.beginOffset ?? 0, offset), volume: 1, loop: false, speed: frame.speed, playing: frame.playing && !slot.waiting });
          continue;
        }
        this.completed.add(key);
      }
      const left = slot.fade && slot.origin !== undefined && now !== undefined && key.startsWith(`${frame.identity}:`) && frame.enabled ? 1 - (now - slot.fade.start) / slot.fade.ms : 0;
      if (left <= 0) { this.remove(key); continue; }
      const offset = now! - slot.origin!; slot.waiting = offset < (slot.beginOffset ?? 0);
      const fadeIn = slot.fadeInMs ? Math.max(0, Math.min(1, (offset - (slot.beginOffset ?? 0)) / slot.fadeInMs)) : 1;
      slot.gain.gain.setTargetAtTime(frame.playing && !slot.waiting ? slot.fade!.volume * left * fadeIn * (frame.duck && slot.duck !== false ? .25 : 1) : 0, audio.currentTime, .015);
      slot.driver?.update({ offsetMs: Math.max(slot.beginOffset ?? 0, offset), volume: 1, loop: slot.loop ?? false, speed: frame.speed, playing: frame.playing && !slot.waiting });
    }
  }
  private remove(key: string) { this.failures.delete(key); const slot = this.slots.get(key); if (!slot) return; slot.dead = true; slot.driver?.destroy(); slot.release?.();slot.gain.disconnect(); this.slots.delete(key); }
  destroy() { for (const n of this.narrations) n.cancel(); this.narrations.clear(); this.completed.clear(); this.disposed = true;this.captureClock?.stop();this.captureClock?.disconnect();this.captureClock=undefined; if(this.recorder)this.recorder.ondataavailable=null;if (this.recorder?.state === 'recording') this.recorder.stop(); this.capture?.stream.getTracks().forEach(t => t.stop()); for (const k of this.slots.keys()) this.remove(k); void this.audio?.close().catch(() => {}); this.audio = null;this.warm.splice(0).forEach(r=>r());this.encoded.dispose();this.decoded.dispose();this.chunks=[];this.recorder=undefined;this.capture=undefined; }
  status() { return { error: this.captureError ?? this.failures.values().next().value ?? null, state: this.audio?.state ?? 'locked', tracks: [...this.slots.values()].filter(s => s.driver && !s.waiting).length, time: this.audio?.currentTime ?? 0,cache:{encoded:this.encoded.status(),pcm:this.decoded.status()} }; }
}
