import { definePlugin, pluginEffect } from '@joplo-app/kit/plugin';
import { skill } from './guide.ts';
import packageInfo from './version.json' with { type: 'json' };
export type MusicOptions = { fadeMs?: number; loop?: boolean; volume?: number };
/** Keep scores in a project-owned music.ts; no binaries or local execution during authoring. */
export function alda(scores: Record<string, string>) {
  return definePlugin({ packageName: '@joplo-app/plugin-alda', id: 'alda', title: 'Alda background music', version: packageInfo.version, components: {}, skill,
    runtime: new URL(import.meta.url.endsWith('.ts') ? './runtime.ts' : './runtime.js', import.meta.url),
    local: new URL(import.meta.url.endsWith('.ts') ? './local.ts' : './local.js', import.meta.url),
    compile: { effect(e, ctx) {
      const payload = e.payload as { name?: string; fadeMs?: number; loop?: boolean; volume?: number };
      if (e.name === 'stop') return { media: [{ track: 'bgm', action: 'stop', fadeMs: payload.fadeMs ?? 0 }] };
      if (e.name !== 'play' || !payload || typeof payload.name !== 'string' || typeof scores[payload.name] !== 'string') {
        ctx.report('MUSIC_SCORE_MISSING', 'Unknown score; declare the same name in alda({ name: "score text" })', ctx.source, 'warning'); return;
      }
      const resource = ctx.resource({ compiler: 'midi', input: scores[payload.name]! });
      return { media: [{ track: 'bgm', action: 'play', resource, fadeMs: payload.fadeMs ?? 0, loop: payload.loop ?? false, volume: payload.volume ?? .25 }] };
    } },
  });
}
export const music = {
  play: (name: string, options: MusicOptions = {}) => pluginEffect('alda', 'play', { name, ...options }),
  stop: (options: Pick<MusicOptions, 'fadeMs'> = {}) => pluginEffect('alda', 'stop', options),
};
export default alda;
