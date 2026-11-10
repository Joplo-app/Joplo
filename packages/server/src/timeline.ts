import type { AudioRegion } from '@joplo-app/kit/plugin';
import { writeOutput } from './output-file.ts';
/** Versioned actual-playback observation schema. Times are milliseconds, never outline estimates. */
export type TimelineStep = { scenarioId: string; stepId: string; position: number; commitMs: number; outputCommitMs: number; endMs: number; outputEndMs: number; camera: unknown; media: unknown; text: unknown };
export type TimelineMediaEvent = { track: string; action: 'play' | 'stop' | 'seek' | 'volume'; engineMs: number; outputMs: number; resource: string; offsetMs: number; volume: number; fadeMs: number; snapshot: Record<string, unknown> };
export type PlaybackTimeline = { mediaEvents: TimelineMediaEvent[]; assets?: { id: string; kind: 'narration' | 'media'; file: string; audioInfo?: AudioRegion }[]; steps: TimelineStep[]; chapters: { scenarioId: string; startMs: number; endMs: number }[]; schemaVersion: 1; origin: 'playback'; timing: { sampleToleranceMs: number; outputOriginMs: number }; events: PlaybackEvent[] };
export type PlaybackEvent = { at: number; engineMs: number; outputMs: number; scenarioId?: string | null; position?: number; stepId?: string | null; [key: string]: unknown };
export type RawTimeline = { schemaVersion: 1; startedAt: number | null; events: (Record<string, unknown> & { at: number; engineMs: number })[] };
export function playbackTimeline(raw: RawTimeline, outputOriginMs = raw.startedAt ?? 0, sampleToleranceMs = 50): PlaybackTimeline {
  const steps: TimelineStep[] = [], chapters: PlaybackTimeline['chapters'] = [];
  const ended = new Set<string>(), dwelled = new Set<string>();
  for (const e of raw.events) {
    const sid = typeof e.scenarioId === 'string' ? e.scenarioId : null;
    if (!sid) continue;
    if (chapters.at(-1)?.scenarioId !== sid) {
      if (chapters.length) chapters.at(-1)!.endMs = e.engineMs;
      chapters.push({ scenarioId: sid, startMs: e.engineMs, endMs: e.engineMs });
    }
    chapters.at(-1)!.endMs = e.engineMs;
    if (typeof e.stepId === 'string' && !steps.some(s => s.stepId === e.stepId)) {
      if (steps.length && !ended.has(steps.at(-1)!.stepId)) { steps.at(-1)!.endMs = e.engineMs; steps.at(-1)!.outputEndMs = e.at - outputOriginMs; }
      steps.push({ scenarioId: sid, stepId: e.stepId, position: Number(e.position), commitMs: e.engineMs, outputCommitMs: e.at - outputOriginMs, endMs: e.engineMs, outputEndMs: e.at - outputOriginMs, camera: e.camera, media: e.media, text: e.text });
    }
    const current = steps.at(-1);
    if (current && !ended.has(current.stepId)) {
      current.endMs = e.engineMs; current.outputEndMs = e.at - outputOriginMs;
      if (e.dwell && e.stepId === current.stepId) dwelled.add(current.stepId);
      if ((dwelled.has(current.stepId) && e.dwell === null && e.activeStep === null) || (e.position === current.position && e.activeStep === e.position) || e.playing === false) ended.add(current.stepId);
    }
  }
  const mediaEvents: TimelineMediaEvent[] = [];
  let previous: Record<string, Record<string, unknown>> = {}, previousCommit = '';
  for (const e of raw.events) {
    if (!e.media || typeof e.media !== 'object') continue;
    const key = `${e.scenarioId}:${e.position}`;
    if (key === previousCommit) continue;
    previousCommit = key;
    const current = e.media as Record<string, Record<string, unknown>>;
    const emit = (track: string, action: TimelineMediaEvent['action'], value: Record<string, unknown>, fadeMs = 0) => mediaEvents.push({ track, action, engineMs: e.engineMs, outputMs: e.at - outputOriginMs, resource: String(value.resource), offsetMs: Number(value.offsetMs ?? 0), volume: Number(value.volume ?? 1), fadeMs, snapshot: value });
    for (const [track, value] of Object.entries(current)) {
      const before = previous[track];
      if (!before || before.resource !== value.resource) emit(track, 'play', value, Number(value.fadeInMs ?? 0));
      else if (value.startOffsetMs !== undefined && value.startOffsetMs !== before.startOffsetMs) emit(track, 'seek', value, Number(value.fadeInMs ?? 0));
      if (value.stopAfterMs !== undefined && before?.stopAfterMs === undefined) emit(track, 'stop', value, Number(value.stopAfterMs));
      else if (before && value.volume !== before.volume && value.stopAfterMs === undefined) emit(track, 'volume', value);
    }
    for (const [track, value] of Object.entries(previous)) if (!current[track] && value.stopAfterMs === undefined && value.endAfterMs === undefined) emit(track, 'stop', value);
    previous = current;
  }
  return { mediaEvents, steps, chapters, schemaVersion: 1, origin: 'playback', timing: { sampleToleranceMs, outputOriginMs }, events: raw.events.map(e => ({ ...e, at: e.at - (raw.startedAt ?? 0), outputMs: e.at - outputOriginMs, ...(typeof e.endAt === 'number' ? { endAt: e.endAt - (raw.startedAt ?? 0), outputEndMs: e.endAt - outputOriginMs } : {}) })) };
}
/** Accumulated integer targets avoid ceil(1000 / fps) drift in Playwright runFor. */
export function frameTime(index: number, fps: number): number { return Math.round(index * 1000 / fps); }

/** Make the timeline useful after its temporary recording server has closed. Only referenced audio is copied. */
export async function persistTimeline(file: string, timeline: PlaybackTimeline, mediaAssets: Readonly<Record<string, string>>, baseUrl: string, overwrite = false, localToken?: string, mediaInfo:Readonly<Record<string,AudioRegion>> = {}) {
  const fs = await import('node:fs/promises'), path = await import('node:path'), crypto = await import('node:crypto');
  const directory = `${file.replace(/\.json$/i, '')}.assets`, assets: NonNullable<PlaybackTimeline['assets']> = [];
  const copy = async (id: string, kind: 'narration' | 'media', source: string, audioInfo?:AudioRegion) => {
    const url = new URL(source, baseUrl);
    let response: Response;
    if (localToken && url.origin === new URL(baseUrl).origin && /^\/__joplo\/p\/[^/]+\/resources\//.test(url.pathname)) {
      const resolved = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-joplo-token': localToken }, body: '{}' });
      if (!resolved.ok) throw new Error(`Timeline media resource ${id} could not be resolved (${resolved.status})`);
      const result = await resolved.json() as { url?: string; audio?:AudioRegion };
      audioInfo=result.audio??audioInfo;
      if (!result.url?.startsWith('data:')) throw new Error(`Timeline media resource ${id} is unavailable; prepare local resources first`);
      response = await fetch(result.url);
    } else response = await fetch(url);
    if (!response.ok) throw new Error(`Timeline audio asset ${id} could not be read (${response.status})`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const mime = response.headers.get('content-type') ?? '';
    const suffix = mime.includes('wav') ? '.wav' : mime.includes('ogg') ? '.ogg' : mime.includes('flac') ? '.flac' : mime.includes('webm') ? '.webm' : '.mp3';
    const name = crypto.createHash('sha256').update(bytes).digest('hex') + suffix;
    await fs.mkdir(directory, { recursive: true });
    const destination=path.join(directory,name);
    let existing: Buffer | null=null;
    try {existing=await fs.readFile(destination);} catch(e) {if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    const valid=existing?.length===bytes.length&&crypto.createHash('sha256').update(existing!).digest('hex')===name.split('.')[0];
    if(existing&&!valid&&!overwrite)throw new Error(`Timeline asset ${name} is incomplete or corrupt; use --overwrite to replace it`);
    if(!valid) {
      try {await writeOutput(destination,bytes,!!existing&&overwrite);} catch(e) {
        if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;
        const raced=await fs.readFile(destination);
        if(raced.length!==bytes.length||crypto.createHash('sha256').update(raced).digest('hex')!==name.split('.')[0])throw new Error(`Concurrent timeline asset ${name} failed content validation`);
      }
    }
    const relative = `${path.basename(directory)}/${name}`;
    if (!assets.some(a => a.id === id && a.kind === kind)) assets.push({ id, kind, file: relative, ...(audioInfo?{audioInfo}:{}) });
    return relative;
  };
  const voiceFiles = new Map<string, string>();
  for (const event of timeline.events) if (event.type === 'narration' && event.source === 'clip' && typeof event.file === 'string') {
    const source = event.file;
    if (!voiceFiles.has(source)) voiceFiles.set(source, await copy(String(event.clipId ?? source), 'narration', source));
    event.file = voiceFiles.get(source)!;
  }
  const resources = new Set<string>();
  for (const event of timeline.events) if (event.media && typeof event.media === 'object') for (const track of Object.values(event.media as Record<string, { resource?: string }>)) if (track.resource) resources.add(track.resource);
  for (const id of resources) if (mediaAssets[id]) await copy(id, 'media', mediaAssets[id],mediaInfo[id]);
  timeline.assets = assets;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await writeOutput(file,JSON.stringify(timeline,null,2),overwrite);
}
