import { prepareRegion } from './audio-media';
import { audioResource } from './audio-source';
import type { AudioRegion } from '@joplo-app/kit/plugin';
/**
 * 录制视频时的旁白（`joplo render --video --voice real`、看板开着朗读时的导出视频；#56）。
 *
 * - 这一段有已经生成好的音频（看板的 voice 状态，即 `.joplo/voice/` 里当前声音的片段）：在媒体引擎的 AudioContext 里播放，
 *   同时进扬声器和录音轨，画面按真实音频时长停留（控制器等它读完）。
 * - 没有音频：按 voiceMs 估算时长“读”（不出声，与 voice=estimate 相同），并记进 missing，录制结束后报告给作者。
 * - 不生成音频、不调用朗读服务。
 *
 * 字段流向：prepare（写入点：预取并解码每一段的音频）→ buffers（存储）→ speak（读取点）→ 录音轨与控制器的停留（消费者）；
 * missing（写入点：speak 找不到音频）→ RecordStage 的 __JOPLO_RECORD__.voice()（读取点）→ 服务端录制结果与 CLI 输出（消费者）。
 */
import { clipKey, voiceFingerprint } from '@joplo-app/core/runtime';
import { Narrator, failedAudio, type Narration, type VoiceLookup } from './voice';

export type RecordVoiceOutput = { audio: AudioContext; connect(node: AudioNode): void };
export type MissingLine = { text: string; role: string | null; audio?: string; audioInfo?: AudioRegion };
export type MissingRecordingLine = { text: string; role: string | null; provided?: true };
export const narrationBufferKey = (url: string, info?: AudioRegion) => info ? `${url}|${JSON.stringify(info)}` : url;

/** 一段已解码的旁白：用 AudioBufferSourceNode 播放；暂停 = 停掉并记住位置，继续 = 从那里重新开始。 */
export function playBuffer(out: RecordVoiceOutput, buffer: AudioBuffer, speed: number, region?: ReturnType<typeof prepareRegion>, startPaused = false): Narration {
  const bounds = region ?? prepareRegion(buffer);
  const duration = bounds.end - bounds.start;
  const { audio } = out;
  let source: AudioBufferSourceNode | null = null;
  let offset = 0; // 已经播完的秒数（缓冲区时间）
  let startedAt = 0; // 当前这一段开始时的 audio.currentTime
  let finished = false;
  let finish: () => void = () => {};
  const done = new Promise<void>((r) => { finish = r; });
  const end = () => { if (finished) return; finished = true; source?.disconnect(); source = null; finish(); };
  const run = () => {
    const s = audio.createBufferSource();
    s.buffer = buffer;
    s.playbackRate.value = speed;
    out.connect(s);
    s.onended = () => { if (source === s) end(); };
    startedAt = audio.currentTime;
    if (region) s.start(0, bounds.start + offset, Math.max(0, duration - offset)); else s.start(0, offset);
    source = s;
  };
  if (!startPaused) run();
  const played = () => offset + (source ? (audio.currentTime - startedAt) * speed : 0);
  return {
    source: 'clip',
    done,
    progress: () => (finished ? 1 : Math.min(1, played() / Math.max(1e-3, duration))),
    pause: () => {
      if (!source || finished) return;
      offset = played();
      const s = source; source = null; s.onended = null; s.stop(); s.disconnect();
    },
    resume: () => { if (!source && !finished) run(); },
    cancel: () => { const s = source; source = null; if (s) { s.onended = null; try { s.stop(); } catch { /* 还没开始 */ } s.disconnect(); } end(); },
  };
}

export class RecordVoice {
  readonly narrator = new Narrator();
  readonly missing: MissingRecordingLine[] = [];
  private prepareFailures = new Map<string, string>();
  private buffers = new Map<string, { buffer: AudioBuffer; region: ReturnType<typeof prepareRegion>; info?: AudioRegion }>();
  /** 有没有可播的音频：一段都没有时不必录音轨（全部按估算时长）。 */
  get hasAudio(): boolean { return this.buffers.size > 0; }
  constructor(private readonly o: { output: () => RecordVoiceOutput | null; decode: (bytes: ArrayBuffer) => Promise<AudioBuffer>; fallback: Narrator; timingOnly?: boolean }) {
    this.narrator.enabled = true;
    this.narrator.speak = (text, role, speed, audio, timing) => this.speak(text, role, speed, audio, timing);
  }

  private urlOf(text: string, role: string | null, audio?: string): string | null {
    if (audio !== undefined) return audio || null;
    const lookup = this.narrator.lookup;
    const t = text.trim();
    const fp = lookup ? voiceFingerprint(lookup, role, t) : null;
    return fp ? (lookup!.clips[clipKey(fp, t)] ?? null) : null;
  }

  identity() { return { lookup:this.narrator.lookup, clips:[...this.buffers].map(([url,prepared])=>({url:url.startsWith('data:')?clipKey('provided',url):url,durationMs:(prepared.region.end-prepared.region.start)*1000})) }; }

  describe(text: string, role: string | null, audio?: string, info?: AudioRegion) {
    const url = this.urlOf(text, role, audio);
    const prepared = url ? this.buffers.get(narrationBufferKey(url, info)) : null;
    return { clipId: audio !== undefined ? clipKey('provided', audio) : url ? url.split('/').pop() ?? url : null, file: audio !== undefined ? null : url, ...(audio !== undefined ? { provided: true } : {}), durationMs: prepared ? (prepared.region.end - prepared.region.start) * 1000 : null, source: prepared ? 'clip' : 'estimate', ...(prepared?.info ? { audioInfo: prepared.info } : {}) };
  }

  /** 预取并解码这些段的音频；取不到的段在播放时按估算时长处理。 */
  async prepare(lookup: VoiceLookup | null, lines: readonly MissingLine[]) {
    this.narrator.lookup = lookup;
    for (const line of lines) {
      const url = this.urlOf(line.text, line.role, line.audio); if (!url) continue;
      const key = narrationBufferKey(url, line.audioInfo);
      if (this.buffers.has(key)) continue;
      try {
        const source = await audioResource(url);
        const buffer = await this.o.decode(Uint8Array.from(source.bytes).buffer);
        const info = line.audioInfo ?? source.audio;
        this.buffers.set(key, { buffer, region: prepareRegion(buffer, info), ...(info ? { info } : {}) });
      } catch (e) { this.prepareFailures.set(key, e instanceof Error ? e.message : 'Audio decoding failed'); }
    }
  }

  private speak(text: string, role: string | null, speed: number, audio?: string, timing?: { voiceHold?: boolean; durationMs?: number; audioInfo?: AudioRegion }): Narration | null {
    const t = text.trim();
    if (!t) return null;
    const url = this.urlOf(t, role, audio);
    const prepared = url ? this.buffers.get(narrationBufferKey(url, timing?.audioInfo)) : undefined;
    const buffer = prepared?.buffer;
    const out = buffer ? this.o.output() : null;
    if (buffer && this.o.timingOnly) {
      let left = (prepared!.region.end - prepared!.region.start) * 1000 / speed, started = performance.now(), timer: ReturnType<typeof setTimeout> | null = null;
      let finish!: () => void;
      const done = new Promise<void>(resolve => { finish = resolve; });
      const run = () => { started = performance.now(); timer = setTimeout(() => { timer = null; left = 0; finish(); }, left); };
      run();
      return { source: 'clip', done, pause: () => { if (timer) { clearTimeout(timer); timer = null; left = Math.max(0, left - (performance.now() - started)); } }, resume: () => { if (!timer && left > 0) run(); }, cancel: () => { if (timer) clearTimeout(timer); timer = null; left = 0; finish(); } };
    }
    if (buffer && out) return playBuffer(out, buffer, speed, prepared!.info ? prepared!.region : undefined);
    this.missing.push({ text: t, role, ...(audio !== undefined ? { provided: true as const } : {}) });
    if (audio !== undefined) return failedAudio(`${this.prepareFailures.get(narrationBufferKey(audio, timing?.audioInfo)) ?? 'The selected narration audio is missing or undecodable'}; no voice provider was called`);
    return this.o.fallback.speak(t, role, speed, undefined, timing);
  }
}
