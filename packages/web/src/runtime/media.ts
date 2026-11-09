import { audioMedia, decodedLease } from './audio-media';
import { MediaCache } from './media-cache';
import type { AudioRegion, MediaDriver, MediaSnapshot } from '@joplo-app/kit/plugin';
import { pluginStatus } from '../renderer/plugins';
/** Browser host owns permission, clock, gain and lifecycle; the host decodes audio bytes; custom media plugins may supply a driver. */
export class MediaEngine {
  private audio: AudioContext | null = null;
  private slots = new Map<string, { resource: string; gain: GainNode; driver?: MediaDriver; dead: boolean; release?:()=>void; startOffset?: number; origin?: number; loop?: boolean; fade?: { start: number; ms: number; volume: number } }>();
  private encoded=new MediaCache<{bytes:Uint8Array;audio?:AudioRegion}>({budgetBytes:4*1024*1024,concurrency:2});
  private decoded=new MediaCache<AudioBuffer>({budgetBytes:32*1024*1024,concurrency:1});
  private warm:(()=>void)[]=[];
  private disposed = false;
  private capture?: MediaStreamAudioDestinationNode;
  private recorder?: MediaRecorder;
  private captureClock?: ConstantSourceNode;
  private chunks: Blob[] = [];

  async startCapture(assets: Record<string, string>, info:Record<string,AudioRegion>={}) {
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
    const recorder = this.recorder; if (!recorder) return null;
    await new Promise<void>((resolve, reject) => { recorder.onstop = () => resolve(); recorder.onerror = () => reject(new Error('Audio recording failed')); recorder.stop(); });
    const blob = new Blob(this.chunks, { type: recorder.mimeType });
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]!); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
    this.captureClock?.stop();this.captureClock?.disconnect();this.captureClock=undefined;this.chunks=[];this.recorder=undefined;this.capture?.stream.getTracks().forEach(t=>t.stop());this.capture=undefined;return { data };
  }
  async calibrate() {
    const audio=this.audio,capture=this.capture;if(!audio||!capture)return false;
    const overlay=document.createElement('div');overlay.style.cssText='position:fixed;inset:0;z-index:2147483647;background:rgb(255,0,255);pointer-events:none';
    const tone=audio.createOscillator(),gain=audio.createGain();gain.gain.value=.65;tone.frequency.value=2000;tone.connect(gain);gain.connect(capture);
    const when=audio.currentTime+.06;tone.start(when);tone.stop(when+.15);tone.onended=()=>{tone.disconnect();gain.disconnect();};
    await new Promise<void>(resolve=>{const tick=()=>{if(audio.currentTime>=when){document.body.append(overlay);resolve();}else requestAnimationFrame(tick);};requestAnimationFrame(tick);});
    await new Promise(r=>setTimeout(r,230));return true;
  }
  unlock = () => {
    if (this.disposed || typeof AudioContext === 'undefined') return;
    this.audio ??= new AudioContext();
    void this.audio.resume().catch(() => {});
  };
  private bytes(url:string) {
    return this.encoded.acquire(url,async()=>{
      // 发布站（D98）：素材是独立文件，按相对路径 GET 取字节；看板的本机资源接口（/__joplo/…）返回 data URL
      if(!url.startsWith('data:')&&!url.startsWith('/__joplo/')){
        const res=await fetch(url);if(!res.ok)throw new Error('Music resource unavailable');
        const bytes=new Uint8Array(await res.arrayBuffer());
        return {value:{bytes,audio:undefined},bytes:bytes.byteLength};
      }
      const result=url.startsWith('data:')?{url}:await(await fetch(url,{method:'POST',headers:{'content-type':'application/json','x-joplo-token':document.querySelector<HTMLMetaElement>('meta[name="joplo-token"]')?.content??''},body:'{}'})).json();
      const data=result.url;
      if(typeof data!=='string'||!/^data:[^;,]+;base64,/.test(data))throw new Error('Music resource unavailable');
      const bytes=Uint8Array.from(atob(data.slice(data.indexOf(',')+1)),c=>c.charCodeAt(0));
      return {value:{bytes,audio:result.audio},bytes:bytes.byteLength};
    },url.startsWith('data:')?Math.ceil((url.length-url.indexOf(',')-1)*.75):0);
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
      if (slot && (slot.resource !== url || slot.startOffset !== t.startOffsetMs)) { this.remove(key); slot = undefined; }
      if (!slot) {
        if (!frame.playing) continue;
        const runtime = pluginStatus(t.plugin);
        if (runtime.state !== 'ready') continue;
        const factory = runtime.runtime.media ?? audioMedia;
        const gain = audio.createGain(); gain.gain.value = 0; gain.connect(audio.destination);
        if (this.capture) gain.connect(this.capture);
        slot = { resource: url, gain, dead: false, startOffset: t.startOffsetMs, origin: frame.timeMs === undefined ? undefined : frame.timeMs - (t.offsetMs + frame.elapsedMs) }; this.slots.set(key, slot);
        const current = slot;
        const lease=this.bytes(url);current.release=lease.release;
        void lease.value.then(async loaded => {
          if (current.dead) return;
          const args={audio,destination:gain,bytes:loaded.bytes,audioInfo:info[t.resource]??loaded.audio};
          const driver = await (factory===audioMedia?audioMedia({...args,cache:this.decoded,key:url}):factory(args));
          this.warm.splice(0).forEach(release=>release());
          if (current.dead) driver.destroy(); else current.driver = driver;
        }).catch(() => {current.release?.();current.release=undefined;current.dead=true;current.gain.disconnect();});
      }
      const elapsed = frame.elapsedMs;
      const now = frame.timeMs;
      const anchored = slot.origin !== undefined && now !== undefined;
      const offset = anchored ? now - slot.origin! : t.offsetMs + elapsed;
      // 淡入按这条轨道自己的（引擎时间）偏移；淡出在第一次出现时锚定起点、时长与当时的音量（D92 R2）：
      // 之后各步快照里编译期按估算推进的 stopAfterMs / volume 不再改变它，淡完就一直静音，直到快照不再要求淡出（再次 play 同一首）
      const fadeIn = t.fadeInMs ? Math.max(0, Math.min(1, (offset - (t.startOffsetMs ?? 0)) / t.fadeInMs)) : 1;
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
  private remove(key: string) { const slot = this.slots.get(key); if (!slot) return; slot.dead = true; slot.driver?.destroy(); slot.release?.();slot.gain.disconnect(); this.slots.delete(key); }
  destroy() { this.disposed = true;this.captureClock?.stop();this.captureClock?.disconnect();this.captureClock=undefined; if(this.recorder)this.recorder.ondataavailable=null;if (this.recorder?.state === 'recording') this.recorder.stop(); this.capture?.stream.getTracks().forEach(t => t.stop()); for (const k of this.slots.keys()) this.remove(k); void this.audio?.close().catch(() => {}); this.audio = null;this.warm.splice(0).forEach(r=>r());this.encoded.dispose();this.decoded.dispose();this.chunks=[];this.recorder=undefined;this.capture=undefined; }
  status() { return { state: this.audio?.state ?? 'locked', tracks: [...this.slots.values()].filter(s => s.driver).length, time: this.audio?.currentTime ?? 0,cache:{encoded:this.encoded.status(),pcm:this.decoded.status()} }; }
}
