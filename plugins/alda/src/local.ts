import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import type { LocalResourceInfo, PluginLocal } from '@joplo-app/kit/plugin';
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
export default { compilers: { audio: {
  requiresAttribution:true, version: `alda-2.4.8-${RENDER_VERSION}-${SOUNDFONT.sha256}-${MP3_VERSION}`, mime: 'audio/mpeg', timeoutMs: 180000,
  async inspect(input, ctx) { return inspectScore(request(input).score, ctx.directory); },
  async compile(input, ctx) {
    const { score, loop } = request(input);
    const version = (await run(['version'], ctx.directory)).trim();
    if (version !== 'alda 2.4.8') throw new Error(`Expected Alda 2.4.8; found ${version}`);
    const info = await inspectScore(score, ctx.directory);
    const output = path.join(ctx.directory, 'score.mid');
    await run(['export', '-f', path.join(ctx.directory, 'score.alda'), '-o', output], ctx.directory);
    const pcm = await renderPCM(await fs.readFile(output), await soundfont(ctx.cacheDir), info.durationMs!, loop);
    const master=await encodeFlac(pcm);
    const masters=path.join(ctx.projectDir??ctx.directory,'.joplo','music-masters');await fs.mkdir(masters,{recursive:true});
    const key=createHash('sha256').update(JSON.stringify([score,loop,RENDER_VERSION,SOUNDFONT.sha256])).digest('hex');
    const tmp=path.join(masters,`${key}.${randomUUID()}.tmp`);await fs.writeFile(tmp,master);await fs.rename(tmp,path.join(masters,`${key}.flac`));
    const {bytes,audio}=await encodeMusic(pcm,Math.round(info.durationMs!*44100/1000),loop);
    if (bytes.length > ctx.maxBytes) throw Object.assign(new Error('Rendered audio exceeds resource size limit'), { code: 'LOCAL_RESOURCE_TOO_LARGE' });
    return {bytes,audio,credit,license};
  },
} } } satisfies PluginLocal;
