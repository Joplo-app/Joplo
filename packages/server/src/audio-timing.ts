/** Read-only audio facts. Never generate resources, call a voice provider, or serialize local paths. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { Input, ALL_FORMATS, BufferSource } from 'mediabunny';
import { spokenLine, speakerRoleAt, type Project, type Diagnostic, type VoiceConfig } from '@joplo-app/core';
import { joploHome } from './home.ts';
import { ProfileStore, VoiceCache, resolveVoices, voiceLocaleOf } from './voice.ts';

export async function audioDuration(bytes: Uint8Array): Promise<number | undefined> {
  const input = new Input({ formats: ALL_FORMATS, source: new BufferSource(bytes) });
  try {
    const track = await input.getPrimaryAudioTrack();
    const ms = track ? await track.computeDuration() * 1000 : 0;
    return Number.isFinite(ms) && ms > 0 ? ms : undefined;
  } finally { input.dispose(); }
}

export async function readAudioTiming(projectDir: string, project: Project, options: { voiceConfig?: VoiceConfig; defaultProfile?: string | null; home?: string } = {}) {
  const audio = new Map<string, number>(), voice = new Map<string, { durationMs: number; key: string }>();
  const diagnostics: Diagnostic[] = [];
  const ids = new Set(Object.values(project.scenarios).flatMap(sc => sc.steps.flatMap(st => [st.audio, st.holdFor?.audio].filter((x): x is string => !!x))));
  for (const token of ids) {
    const url = project.mediaAssets?.[token.slice(15)];
    // localResource metadata follows the existing inspect/prepared mechanism; do not ensure or fetch here.
    if (!url?.startsWith('data:audio/')) continue;
    try {
      const region = project.mediaInfo?.[token.slice(15)];
      const ms = region ? region.contentFrames / region.sourceSampleRate * 1000 : await audioDuration(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
      if (ms) { audio.set(url, ms); audio.set(token, ms); }
      else throw new Error('no finite audio duration');
    } catch {
      const at = Object.values(project.scenarios).flatMap(sc => sc.steps).find(st => st.audio === token || st.holdFor?.audio === token)?.source;
      diagnostics.push({ code: 'AUDIO_INVALID', severity: 'error', source: 'structure', at, message: 'An explicitly supplied audio asset is undecodable or has no finite positive duration; no voice provider was called' });
    }
  }
  const cache = new VoiceCache(projectDir), store = new ProfileStore(options.home ?? joploHome());
  const resolved = resolveVoices(options.voiceConfig ?? project.voiceConfig, cache.selection(), store, voiceLocaleOf(project, null), options.defaultProfile, cache.pins(), cache.officialCloud());
  for (const sc of Object.values(project.scenarios)) for (const [i, st] of sc.steps.entries()) {
    if (st.holdFor?.kind !== 'voice' || st.audio || st.mute) continue;
    const line = spokenLine(st, st.caption, speakerRoleAt(project, sc.id, i + 1));
    const plan = cache.plan({ stepId: st.id, ...line }, resolved);
    const file = plan && cache.clipOf(plan.key);
    if (!plan || !file) continue;
    const locale = project.i18n?.default ?? 'und';
    const record = cache.read().clips[plan.key];
    if (!record || record.fp !== plan.fp || record.text !== plan.text || record.locale !== locale) continue;
    try {
      const ms = await audioDuration(await fs.readFile(path.join(cache.clipsDir, file)));
      if (ms) voice.set(st.id, { durationMs: ms, key: `${plan.key}:${locale}` });
    } catch { /* A missing/invalid cached clip is an estimate, never an implicit synthesis request. */ }
  }
  return { diagnostics, audioDurationFor: (url: string) => audio.get(url), voiceDurationFor: (stepId: string) => voice.get(stepId) };
}
