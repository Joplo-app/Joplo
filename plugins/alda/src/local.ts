import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import type { AudioRegion, LocalArtifact, LocalResourceInfo, PluginLocal } from '@joplo-app/kit/plugin';
import { soundfont, SOUNDFONT, credit } from './soundfont.ts';
import { createHash, randomUUID } from 'node:crypto';
import { encodeMusic, MP3_VERSION } from './mp3.ts';
import license from './soundfont-license.ts';
import { encodeFlac, renderPCM, RENDER_VERSION } from './render.ts';
export const installSoundfont = async () => { await soundfont(); console.log(`Installed ${SOUNDFONT.name}; SHA-256 ${SOUNDFONT.sha256}`); };
function request(input: string): { score: string; loop: boolean } {
  const value = JSON.parse(input);
  if (typeof value.score !== 'string' || typeof value.loop !== 'boolean') throw new Error('Invalid music resource');
  return value;
}
async function run(args: string[], directory: string) {
  return new Promise<string>((resolve, reject) => execFile('alda', args, { cwd: directory, timeout: 25000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) reject(Object.assign(new Error(error.code === 'ENOENT' ? 'Alda is not installed or not on PATH. Install Alda 2.4.8, then run joplo check again; other checks continue.' : `Alda failed: ${(stderr || stdout || error.message).replaceAll(directory, '<temporary>').slice(0, 1500)}`), { code: error.killed ? 'LOCAL_RESOURCE_TIMEOUT' : 'LOCAL_RESOURCE_FAILED' }));
    else resolve(stdout);
  }));
}
export async function inspectScore(score: string, directory: string): Promise<LocalResourceInfo> {
  const source = path.join(directory, 'score.alda'); await fs.writeFile(source, score);
  const parsed = JSON.parse(await run(['parse', '-f', source, '-o', 'data'], directory));
  const parts: Record<string, number> = {};
  const partDurationsMs: Record<string, number> = {};
  let durationMs = 0;
  for (const [id, p] of Object.entries(parsed.parts) as [string, { name: string; 'current-offset': number }][]) {
    parts[`${p.name} (${id})`] = parsed.events.filter((e: { part: string; 'midi-note'?: number }) => e.part === id && typeof e['midi-note'] === 'number').length;
    partDurationsMs[`${p.name} (${id})`] = p['current-offset'];
    durationMs = Math.max(durationMs, p['current-offset']);
  }
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('Score contains no timed music');
  return { durationMs, parts, partDurationsMs, markers: parsed.markers, credit };
}
export type RenderLosslessOptions = { directory:string; cacheDir:string; loop?:boolean; maxBytes?:number };
async function sourcePCM(score:string,options:RenderLosslessOptions) {
  if(typeof score!=='string'||!score.trim())throw new Error('Score must be nonempty');
  if(typeof options.directory!=='string'||!options.directory.trim()||typeof options.cacheDir!=='string'||!options.cacheDir.trim())throw new Error('Provide a writable work directory and plugin cacheDir');
  await fs.mkdir(options.directory,{recursive:true});
  const job=await fs.mkdtemp(path.join(options.directory,'alda-'));
  try {
    const version=(await run(['version'],job)).trim();
    if(version!=='alda 2.4.8')throw new Error(`Expected Alda 2.4.8; found ${version}`);
    const info=await inspectScore(score,job),midi=path.join(job,'score.mid');
    await run(['export','-f',path.join(job,'score.alda'),'-o',midi],job);
    const pcm=await renderPCM(await fs.readFile(midi),await soundfont(options.cacheDir),info.durationMs!,options.loop??false);
    return {pcm,info};
  }finally{await fs.rm(job,{recursive:true,force:true});}
}
/** Stable lossless author API. Uses the same PCM/master encoder as music.play, without MP3 probe/guards. */
export async function renderLossless(score:string,options:RenderLosslessOptions):Promise<LocalArtifact & {audio:AudioRegion;info:LocalResourceInfo}> {
  if(options.loop!==undefined&&typeof options.loop!=='boolean')throw new Error('loop must be boolean');
  if(options.maxBytes!==undefined&&(!Number.isInteger(options.maxBytes)||options.maxBytes<=0))throw new Error('maxBytes must be a positive integer');
  const {pcm,info}=await sourcePCM(score,options),bytes=await encodeFlac(pcm),frames=pcm[0]!.length;
  if(bytes.length>(options.maxBytes??50*1024*1024))throw new Error('Lossless audio exceeds maxBytes; shorten the score or choose a larger explicit limit');
  return {bytes,audio:{sourceSampleRate:44100,decodedFrames:frames,contentFrames:frames,cycleFrames:Math.min(frames,Math.round(info.durationMs!*44.1)),contentStartFrame:0,encoderDelayFrames:0,paddingFrames:0,channels:pcm.length},info,credit,license};
}
export default { compilers: { audio: {
  requiresAttribution:true, version: `alda-2.4.8-${RENDER_VERSION}-${SOUNDFONT.sha256}-${MP3_VERSION}`, mime: 'audio/mpeg', timeoutMs: 180000,
  async inspect(input, ctx) { return inspectScore(request(input).score, ctx.directory); },
  async compile(input, ctx) {
    const { score, loop } = request(input);
    const {pcm,info}=await sourcePCM(score,{directory:ctx.directory,cacheDir:ctx.cacheDir,loop});
    const master=await encodeFlac(pcm);
    const masters=path.join(ctx.projectDir??ctx.directory,'.joplo','music-masters');await fs.mkdir(masters,{recursive:true});
    const key=createHash('sha256').update(JSON.stringify([score,loop,RENDER_VERSION,SOUNDFONT.sha256])).digest('hex');
    const tmp=path.join(masters,`${key}.${randomUUID()}.tmp`);await fs.writeFile(tmp,master);await fs.rename(tmp,path.join(masters,`${key}.flac`));
    const {bytes,audio}=await encodeMusic(pcm,Math.round(info.durationMs!*44100/1000),loop);
    if (bytes.length > ctx.maxBytes) throw Object.assign(new Error('Rendered audio exceeds resource size limit'), { code: 'LOCAL_RESOURCE_TOO_LARGE' });
    return {bytes,audio,credit,license};
  },
} } } satisfies PluginLocal;
