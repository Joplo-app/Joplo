import packageInfo from './version.json' with { type: 'json' };
import { z } from 'zod';
import { definePlugin, pluginComponent, pluginEffect, type PluginIRNode } from '@joplo-app/kit/plugin';
import { studio } from './theme.ts';
import { skill, patterns } from './guide.ts';

/** 进退场预设（D92）：每个预设是一个“离场姿态”，进场 = 离场姿态 → 原样，退场 = 原样 → 离场姿态。 */
export const TRANSITIONS = ['fade', 'rise', 'zoom', 'shrink', 'wipe', 'iris'] as const;
export type Transition = (typeof TRANSITIONS)[number];
/** 镜头漂移（D92）：落定后继续缓慢推近 / 拉远 / 平移，有终点、非匀速。数字 = 在 ms 内再推近到这个倍数。 */
export type Drift = number | false | { zoom?: number; x?: number; y?: number; ms?: number };
export type CameraOpts = { pad?: number; zoom?: number; ms?: number; drift?: Drift };
/** Move within the design world; no ids restores the whole world. This factory has no player semantics. */
export const camera = (...args: (string | CameraOpts)[]) => {
  const targets = args.filter((arg): arg is string => typeof arg === 'string');
  const options = Object.assign({}, ...args.filter(arg => typeof arg === 'object' && arg !== null)) as CameraOpts;
  return pluginEffect('content', 'camera', { targets, ...options });
};
export const DriftSchema = z.union([z.literal(false), z.number().min(.5).max(2), z.strictObject({ zoom: z.number().min(.5).max(2).optional(), x: z.number().min(-2000).max(2000).optional(), y: z.number().min(-2000).max(2000).optional(), ms: z.number().min(500).max(60000).optional() })]);
const Safe = z.tuple([z.number().min(0).max(2000), z.number().min(0).max(2000), z.number().min(0).max(2000), z.number().min(0).max(2000)]);
const CameraBase = z.strictObject({ targets: z.array(z.string()), pad: z.number().min(0).max(2000).optional(), zoom: z.number().min(.1).max(10).optional(), ms: z.number().min(0).max(10000).optional(), drift: DriftSchema.optional() });
const Waypoint = CameraBase.omit({ ms: true, drift: true }).extend({ atMs: z.number().min(0).max(60000), ease: z.enum(['easeInOut', 'easeOut', 'linear']).optional() });
const Camera = CameraBase.extend({ sequence: z.array(Waypoint).min(2).max(32).optional() });
export type CameraWaypoint = { atMs: number; target?: string; targets?: string[]; pad?: number; zoom?: number; ease?: 'easeInOut' | 'easeOut' | 'linear' };
/** Explicit state-to-state camera waypoints, milliseconds from this step commit. */
export const cameraSequence = (points: CameraWaypoint[]) => pluginEffect('content', 'camera', {
  targets: points.at(-1)?.targets ?? (points.at(-1)?.target ? [points.at(-1)!.target!] : []),
  drift: false,
  sequence: points.map(({ target, targets, ...p }) => ({ ...p, targets: targets ?? (target ? [target] : []) })),
});
const Frame = z.strictObject({ scenes: z.record(z.string(), z.strictObject({ camera: Camera })) });
export type ContentFrame = z.infer<typeof Frame>;
const all = (n: PluginIRNode): PluginIRNode[] => [n, ...(n.children ?? []).flatMap(all)];
const content = definePlugin({ skillTopics: { patterns: { description: 'Recipes and individual pitfalls', body: patterns } }, packageName: '@joplo-app/plugin-content',
  id: 'content', title: 'Visual explainers', version: packageInfo.version,
  runtime: new URL(import.meta.url.endsWith('.ts') ? './runtime.tsx' : './runtime.js', import.meta.url),
  components: { Canvas: { doc: 'w, h, view=[1280,800], drift?, safe?=[top,right,bottom,left]; scaled design world with fixed screen children; drift = default camera drift; safe = the view area not covered by screen chrome, where targeted camera() frames land', selfEvident: true } },
  properties: {
    motion: { type: 'string', nonempty: true, attribute: 'data-jp-content-motion' },
    motionDelay: { type: 'number', min: 0, max: 10000, attribute: 'data-jp-content-motion-delay' },
    motionMs: { type: 'number', min: 0, max: 10000, attribute: 'data-jp-content-motion-ms' },
    screen: { type: 'boolean', attribute: 'data-jp-content-screen' },
    enter: { type: 'string', values: [...TRANSITIONS], attribute: 'data-jp-content-enter' },
    enterMs: { type: 'number', min: 0, max: 10000, attribute: 'data-jp-content-enter-ms' },
    enterDelay: { type: 'number', min: 0, max: 10000, attribute: 'data-jp-content-enter-delay' },
    exit: { type: 'string', values: [...TRANSITIONS], attribute: 'data-jp-content-exit' },
    exitMs: { type: 'number', min: 0, max: 10000, attribute: 'data-jp-content-exit-ms' },
    exitDelay: { type: 'number', min: 0, max: 10000, attribute: 'data-jp-content-exit-delay' },
  },
  themes: { studio }, skill,
  schemas: { step: Frame },
  data: { step: { scope: [{ path: ['scenes'], kind: 'map', domain: 'scene', children: [{ path: ['camera', 'targets'], kind: 'values', domain: 'element' }, { path: ['camera', 'sequence', '*', 'targets'], kind: 'values', domain: 'element' }] }] } },
  compile: {
    node(node, ctx) {
      if (node.type !== 'content:Canvas') return;
      if (node.props.drift !== undefined && !DriftSchema.safeParse(node.props.drift).success) ctx.report('CAMERA_INVALID', `<Canvas drift>: use false, a zoom factor 0.5–2 (e.g. 1.04), or { zoom 0.5–2, x/y −2000–2000 design px, ms 500–60000 }`, node.source);
      if (node.props.safe !== undefined && !Safe.safeParse(node.props.safe).success) ctx.report('CAMERA_INVALID', `<Canvas safe>: use [top, right, bottom, left] in design px (each 0–2000), the part of the view your screen chrome covers`, node.source);
    },
    effect(effect, ctx) {
      if (effect.name !== 'camera') { ctx.report('PLUGIN_EFFECT_UNKNOWN', `Unknown content effect ${effect.name}`, ctx.source); return; }
      const parsed = Camera.safeParse(effect.payload);
      if (!parsed.success) { ctx.report('CAMERA_INVALID', `camera(…): targets must be strings; pad 0–2000, zoom 0.1–10, ms 0–10000, drift false | 0.5–2 | { zoom 0.5–2, x/y −2000–2000, ms 500–60000 } (${parsed.error.issues.map(i => i.message).join('; ')})`, ctx.source); return; }
      const value = parsed.data;
      if (value.sequence && (value.sequence[0]!.atMs !== 0 || value.sequence.some((p, i, a) => i > 0 && p.atMs <= a[i - 1]!.atMs))) { ctx.report('CAMERA_INVALID', 'cameraSequence starts at 0 and needs strictly increasing atMs', ctx.source); return; }
      const targets = [...value.targets, ...value.sequence?.flatMap(p => p.targets) ?? []];
      const nodes = ctx.roots.flatMap(all);
      const missing = targets.filter(id => !nodes.some(n => n.id === id));
      if (missing.length) { ctx.report('CAMERA_UNKNOWN', `camera(${missing.map(m => JSON.stringify(m)).join(', ')}) target is not in any layer or the stage for this step; aim it at elements inside a <Canvas>`, ctx.source); return; }
      return {
        writes: [{ path: 'ui.__plugins.content.camera', value }],
        references: targets,
        ...(value.sequence ? { holdMs: value.sequence.at(-1)!.atMs } : {}),
        ...(value.targets.length ? { directorTarget: value.targets[0] } : {}),
      };
    },
    frame(ctx) {
      const scenes = ctx.scenes.filter(s => all(s.root).some(n => n.type === 'content:Canvas'));
      if (!scenes.length) return;
      const value = (ctx.state.ui.__plugins as { content?: { camera?: unknown } } | undefined)?.content?.camera;
      const parsed = Camera.safeParse(value ?? { targets: [] });
      if (!parsed.success) { ctx.report('CAMERA_INVALID', 'Invalid content camera state; use camera() with valid settings'); return; }
      return { scenes: Object.fromEntries(scenes.map(s => [s.id, { camera: { ...parsed.data, targets: parsed.data.targets.filter(id => all(s.root).some(n => n.id === id)) } }])) };
    },
  },
});
export const Canvas = pluginComponent(content, 'Canvas');
export default content;
