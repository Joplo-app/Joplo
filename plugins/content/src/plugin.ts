import packageInfo from './version.json' with { type: 'json' };
import { z } from 'zod';
import { definePlugin, pluginComponent, pluginEffect, type PluginIRNode } from '@joplo-app/kit/plugin';
import { studio } from './theme.ts';
import { skill } from './guide.ts';

export type CameraOpts = { pad?: number; zoom?: number; ms?: number };
/** Move within the design world; no ids restores the whole world. This factory has no player semantics. */
export const camera = (...args: (string | CameraOpts)[]) => {
  const targets = args.filter((arg): arg is string => typeof arg === 'string');
  const options = Object.assign({}, ...args.filter(arg => typeof arg === 'object' && arg !== null)) as CameraOpts;
  return pluginEffect('content', 'camera', { targets, ...options });
};
const Camera = z.strictObject({ targets: z.array(z.string()), pad: z.number().min(0).max(2000).optional(), zoom: z.number().min(.1).max(10).optional(), ms: z.number().min(0).max(10000).optional() });
const Frame = z.strictObject({ scenes: z.record(z.string(), z.strictObject({ camera: Camera })) });
export type ContentFrame = z.infer<typeof Frame>;
const all = (n: PluginIRNode): PluginIRNode[] => [n, ...(n.children ?? []).flatMap(all)];
const content = definePlugin({
  id: 'content', title: 'Visual explainers', version: packageInfo.version,
  runtime: new URL(import.meta.url.endsWith('.ts') ? './runtime.tsx' : './runtime.js', import.meta.url),
  components: { Canvas: { doc: 'w, h, view=[1280,800]; scaled design world with fixed screen children', selfEvident: true } },
  legacyTypes: { Canvas: 'content:Canvas' },
  properties: {
    motion: { type: 'string', nonempty: true, attribute: 'data-jp-content-motion' },
    motionDelay: { type: 'number', min: 0, max: 10000, attribute: 'data-jp-content-motion-delay' },
    motionMs: { type: 'number', min: 0, max: 10000, attribute: 'data-jp-content-motion-ms' },
    screen: { type: 'boolean', attribute: 'data-jp-content-screen' },
  },
  themes: { studio }, skill,
  schemas: { step: Frame },
  data: { step: { scope: [{ path: ['scenes'], kind: 'map', domain: 'scene', children: [{ path: ['camera', 'targets'], kind: 'values', domain: 'element' }] }] } },
  compile: {
    effect(effect, ctx) {
      if (effect.name !== 'camera') { ctx.report('PLUGIN_EFFECT_UNKNOWN', `Unknown content effect ${effect.name}`, ctx.source); return; }
      const parsed = Camera.safeParse(effect.payload);
      if (!parsed.success) { ctx.report('CAMERA_INVALID', `camera(…): targets must be strings; pad 0–2000, zoom 0.1–10, ms 0–10000 (${parsed.error.issues.map(i => i.message).join('; ')})`, ctx.source); return; }
      const value = parsed.data;
      const nodes = ctx.roots.flatMap(all);
      const missing = value.targets.filter(id => !nodes.some(n => n.id === id));
      if (missing.length) { ctx.report('CAMERA_UNKNOWN', `camera(${missing.map(m => JSON.stringify(m)).join(', ')}) target is not in any layer or the stage for this step; aim it at elements inside a <Canvas>`, ctx.source); return; }
      return {
        writes: [{ path: 'ui.__plugins.content.camera', value }],
        references: value.targets,
        ...(value.targets.length ? { directorTarget: value.targets[0] } : {}),
      };
    },
    frame(ctx) {
      const scenes = ctx.scenes.filter(s => all(s.root).some(n => n.type === 'content:Canvas'));
      if (!scenes.length) return;
      const value = (ctx.state.ui.__plugins as { content?: { camera?: unknown } } | undefined)?.content?.camera ?? ctx.state.ui.__camera;
      const parsed = Camera.safeParse(value ?? { targets: [] });
      if (!parsed.success) { ctx.report('CAMERA_INVALID', 'Invalid content camera state; use camera() with valid options'); return; }
      return { scenes: Object.fromEntries(scenes.map(s => [s.id, { camera: { ...parsed.data, targets: parsed.data.targets.filter(id => all(s.root).some(n => n.id === id)) } }])) };
    },
  },
});
export const Canvas = pluginComponent(content, 'Canvas');
export default content;
