import { definePlugin, pluginEffect } from '@joplo-app/kit/plugin';
import { skill } from './guide.ts';
import packageInfo from './version.json' with { type: 'json' };
export type MusicOptions = { fadeMs?: number; loop?: boolean; volume?: number; from?: string };
/** Scores and marker names stay on the author machine. Only rendered audio and numeric offsets ship. */
export function alda(scores: Record<string, string>) {
  return definePlugin({ packageName: '@joplo-app/plugin-alda', id: 'alda', title: 'Alda background music', version: packageInfo.version, components: {}, skill,
    runtime: new URL(new URL(import.meta.url).pathname.endsWith('.ts') ? './runtime.ts' : './runtime.js', import.meta.url),
    local: new URL(new URL(import.meta.url).pathname.endsWith('.ts') ? './local.ts' : './local.js', import.meta.url),
    compile: { effect(e, ctx) {
      const payload = e.payload as { name?: string } & MusicOptions;
      if (e.name === 'stop') return { media: [{ track: 'bgm', action: 'stop', fadeMs: payload.fadeMs ?? 0 }] };
      if (e.name !== 'play' || !payload || typeof payload.name !== 'string' || typeof scores[payload.name] !== 'string') {
        ctx.report('MUSIC_SCORE_MISSING', 'Unknown score; declare the same name in alda({ name: "score text" })', ctx.source, 'error'); return;
      }
      if (payload.from !== undefined && (typeof payload.from !== 'string' || !payload.from || payload.from.startsWith('%'))) {
        ctx.report('PLUGIN_PROPERTY_INVALID', 'Music from requires a nonempty marker name without %', ctx.source, 'error'); return;
      }
      const resource = ctx.resource({ compiler: 'audio', input: JSON.stringify({ score: scores[payload.name], loop: payload.loop ?? false }) });
      const info = ctx.resourceInfo(resource);
      const offsetMs = payload.from === undefined ? 0 : info?.markers && Object.hasOwn(info.markers, payload.from) ? info.markers[payload.from] : undefined;
      if (info && payload.from !== undefined && offsetMs === undefined) {
        ctx.report('MUSIC_MARKER_MISSING', `Music ${payload.name}: marker %${payload.from} does not exist; inspect joplo check marker times`, ctx.source, 'error'); return;
      }
      if (info) ctx.report('MUSIC_SCORE', `${payload.name}: ${(info.durationMs! / 1000).toFixed(3)} s; notes ${Object.entries(info.parts ?? {}).map(([name, count]) => `${name}=${count}`).join(', ')}; part ends ${Object.entries(info.partDurationsMs ?? {}).map(([name, ms]) => `${name}=${(ms / 1000).toFixed(3)} s`).join(', ') || '(unavailable)'}; markers ${Object.entries(info.markers ?? {}).sort((a, b) => a[1] - b[1]).map(([name, ms]) => `%${name}=${(ms / 1000).toFixed(3)} s`).join(', ') || '(none)'}`, ctx.source, 'info');
      return { media: [{ track: 'bgm', action: 'play', resource, offsetMs: offsetMs ?? 0, fadeMs: payload.fadeMs ?? 0, loop: payload.loop ?? false, volume: payload.volume ?? .25 }] };
    } },
  });
}
export const music = {
  play: (name: string, options: MusicOptions = {}) => pluginEffect('alda', 'play', { name, ...options }),
  stop: (options: Pick<MusicOptions, 'fadeMs'> = {}) => pluginEffect('alda', 'stop', options),
};
export default alda;
