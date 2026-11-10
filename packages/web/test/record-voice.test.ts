/** 录制视频时的旁白（#56）：有音频的段播放已解码的音频并进录音轨，没有的按估算时长并记进 missing。 */
import { afterEach, expect, it, vi } from 'vitest';
import { clipKey, voiceFingerprint } from '@joplo-app/core/runtime';
import { RecordVoice } from '../src/runtime/record-voice';
import { estimatedNarrator } from '../src/RenderApp';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function fakeAudio() {
  const sources: any[] = [];
  const audio: any = {
    currentTime: 0,
    createBufferSource() {
      const s: any = { buffer: null, playbackRate: { value: 1 }, onended: null, start: vi.fn(), stop: vi.fn(() => s.onended?.()), disconnect: vi.fn() };
      sources.push(s);
      return s;
    },
  };
  return { audio, sources };
}

it('plays decoded clips through the recording output and estimates lines without audio', async () => {
  const lookup = { narrator: 'voice-a', roles: {}, clips: {} as Record<string, string> };
  const fp = voiceFingerprint(lookup, null, 'Has audio')!;
  lookup.clips[clipKey(fp, 'Has audio')] = '/__joplo/p/x/voice/clips/a.mp3';
  const fetched: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { fetched.push(url); return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) }; }));
  const { audio, sources } = fakeAudio();
  const connected: unknown[] = [];
  const buffer = { duration: 2 } as AudioBuffer;
  const voice = new RecordVoice({ output: () => ({ audio, connect: (n) => connected.push(n) }), decode: async () => buffer, fallback: estimatedNarrator() });
  expect(voice.hasAudio).toBe(false);
  await voice.prepare(lookup, [{ text: 'Has audio', role: null }, { text: 'No audio here', role: null }]);
  expect(fetched).toEqual(['/__joplo/p/x/voice/clips/a.mp3']);
  expect(voice.hasAudio).toBe(true);

  const n = voice.narrator.speak('Has audio', null, 1)!;
  expect(n.source).toBe('clip');
  expect(sources).toHaveLength(1);
  expect(connected).toEqual([sources[0]]);
  expect(sources[0].buffer).toBe(buffer);
  audio.currentTime = 1;
  expect(n.progress!()).toBeCloseTo(0.5);
  let done = false;
  void n.done.then(() => (done = true));
  sources[0].onended();
  await Promise.resolve();
  expect(done).toBe(true);
  expect(voice.missing).toEqual([]);

  vi.useFakeTimers();
  const est = voice.narrator.speak('No audio here', null, 1)!;
  expect(est.source).toBe('browser');
  expect(sources).toHaveLength(1);
  expect(voice.missing).toEqual([{ text: 'No audio here', role: null }]);
  est.cancel();
});

it('pause stops the source and resume continues from the same offset', async () => {
  const { audio, sources } = fakeAudio();
  const lookup = { narrator: 'v', roles: {}, clips: {} as Record<string, string> };
  lookup.clips[clipKey(voiceFingerprint(lookup, null, 'Line')!, 'Line')] = '/c.mp3';
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })));
  const voice = new RecordVoice({ output: () => ({ audio, connect: () => undefined }), decode: async () => ({ duration: 4 }) as AudioBuffer, fallback: estimatedNarrator() });
  await voice.prepare(lookup, [{ text: 'Line', role: null }]);
  const n = voice.narrator.speak('Line', null, 1)!;
  audio.currentTime = 1.5;
  n.pause();
  expect(sources[0].stop).toHaveBeenCalled();
  audio.currentTime = 9;
  n.resume();
  expect(sources[1].start).toHaveBeenCalledWith(0, 1.5);
  n.cancel();
  await n.done;
});
