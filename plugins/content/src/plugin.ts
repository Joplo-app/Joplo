import packageInfo from './version.json' with { type: 'json' };
import { z } from 'zod';
import { definePlugin, pluginComponent, pluginEffect, type PluginIRNode, type PluginState } from '@joplo-app/kit/plugin';
import { studio } from './theme.ts';
import { skill, patterns } from './guide.ts';
import { DEFAULT_MOVE_MS, FRAMING } from './camera-framing.ts';
import { isBind, type JNode } from '@joplo-app/kit/node';
import { readTrack, type ItemTrackProps } from './item-track.ts';
export type { ItemTrackProps } from './item-track.ts';

/** 进退场预设（D92）：每个预设是一个“离场姿态”，进场 = 离场姿态 → 原样，退场 = 原样 → 离场姿态。 */
export const TRANSITIONS = ['fade', 'rise', 'zoom', 'shrink', 'wipe', 'iris', 'grow', 'growUp', 'blur'] as const;
export type Transition = (typeof TRANSITIONS)[number];
/** 缓动预设：进场、退场、变形各自的“怎么落定”。smooth = 各自的默认曲线；spring / bounce 会冲过终点再回来。 */
export const EASES = ['smooth', 'snappy', 'spring', 'bounce', 'linear'] as const;
export type Ease = (typeof EASES)[number];
/** <Split by>：按词（Intl.Segmenter，中文也能切成词）或按字拆开，逐块进场。 */
export const SPLITS = ['word', 'char'] as const;
/** 镜头漂移（D92）：落定后继续缓慢推近 / 拉远 / 平移，有终点、非匀速。数字 = 在 ms 内再推近到这个倍数。 */
export type Drift = number | false | { zoom?: number; x?: number; y?: number; ms?: number };
export type CameraOpts = { framing?: keyof typeof FRAMING; waitForMove?: boolean; pad?: number; zoom?: number; ms?: number; drift?: Drift };
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
const Camera = CameraBase.extend({ sequence: z.array(Waypoint).min(2).max(32).optional(), sequenceId: z.number().int().nonnegative().optional() });
const CameraCommand = Camera.extend({ framing: z.enum(['overview', 'medium', 'detail']).optional(), waitForMove: z.boolean().optional() });
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
function sameAuthorState(a: PluginState | undefined, b: PluginState): boolean {
  if (!a) return false;
  const clean = (ui: Readonly<Record<string, unknown>>) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(ui)) if (k !== '__plugins') out[k] = v;
    return out;
  };
  return JSON.stringify(clean(a.ui)) === JSON.stringify(clean(b.ui))
    && JSON.stringify(a.data) === JSON.stringify(b.data)
    && JSON.stringify(a.inputs) === JSON.stringify(b.inputs);
}
const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((v, i) => v === b[i]);
function isCosmeticCameraShift(prev: z.infer<typeof Camera> | undefined, cur: z.infer<typeof Camera>): boolean {
  if (cur.sequence && cur.sequence.length >= 2) {
    const first = cur.sequence[0]!;
    if (cur.sequence.some((w) => !sameIds(w.targets, first.targets))) return false;
    const zooms = cur.sequence.map((w) => w.zoom ?? 1);
    const pads = cur.sequence.map((w) => w.pad ?? 48);
    return (Math.max(...zooms) - Math.min(...zooms)) <= 0.15 && (Math.max(...pads) - Math.min(...pads)) <= 48;
  }
  if (!prev || prev.sequence || !sameIds(prev.targets, cur.targets)) return false;
  // Explicitly turning drift off to keep the frame steady is always intentional.
  if (cur.drift === false && prev.drift !== false) return false;
  if (cur.drift !== undefined && cur.drift !== false) return true;
  const zoomDelta = Math.abs((cur.zoom ?? prev.zoom ?? 1) - (prev.zoom ?? 1));
  const padDelta = Math.abs((cur.pad ?? prev.pad ?? 48) - (prev.pad ?? 48));
  return zoomDelta <= 0.15 && padDelta <= 48;
}
const content = definePlugin({ skillTopics: { patterns: { description: 'Recipes and individual pitfalls', body: patterns } }, packageName: '@joplo-app/plugin-content',
  id: 'content', title: 'Visual explainers', version: packageInfo.version,
  bestFor: 'Continuous spatial Canvas worlds, smooth camera moves/sequences, FLIP object flights (motion), fixed slot tracks (ItemTrack), and kinetic headlines (Split)',
  pairsWith: [
    { with: 'diagram', packageName: '@joplo-app/plugin-diagram', how: 'Mount diagram BoardZones (ArchNode + FlowEdge + ClusterBox + Sequence) as distinct islands on one Canvas world and steer camera() across them.' },
    { with: 'ui', packageName: '@joplo-app/plugin-ui', how: 'Place ui Compare, Stat, RingProgress, Terminal, Code, or BrowserWindow inside Canvas zones and reuse motion keys to fly objects between zones.' },
    { with: 'viz', packageName: '@joplo-app/plugin-viz', how: 'Give quantitative data its own Canvas zone rendered with viz charts instead of hand-drawn bar divs, with silent hold() observation beats.' },
    { with: 'alda', packageName: '@joplo-app/plugin-alda', how: 'Cue alda music.play/stop J-cut crossfades on chapter camera transitions.' },
    { with: 'media', packageName: '@joplo-app/plugin-av', how: 'Embed engine-clock Video/Lottie clips inside a Canvas zone and trigger sfx.play() accents on key state flips.' },
  ],
  runtime: new URL(import.meta.url.endsWith('.ts') ? './runtime.tsx' : './runtime.js', import.meta.url),
  components: {
    ItemTrack: { role: 'dsa', doc: 'capacity, items (array or binding), keyField="id", labelField="label", accentField="accent", direction="row"|"column", emptyLabel; fixed slots with keyed item flights', example: '<ItemTrack id="cache" capacity={4} items={$.data.entries} />', traits: { text: ['emptyLabel'], textPaths: [['items', '*', 'label']] }, selfEvident: true },
    Canvas: { role: 'stage', doc: 'w, h, view=[1280,800], drift?, safe?=[top,right,bottom,left]; scaled design world with fixed screen children; drift = default camera drift; safe = the view area not covered by screen chrome, where targeted camera() frames land', selfEvident: true },
    Split: { role: 'annotation', doc: 'text, by="word"|"char"; text that enters piece by piece: enter / enterMs / enterEase apply to each piece, enterStagger (default word 70, char 30 ms) spaces them; screen readers get the whole text', example: '<Split text="It is not typing, it is guessing" enter="rise" enterEase="spring" />', traits: { text: ['text'] }, selfEvident: true },
  },
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
    enterEase: { type: 'string', values: [...EASES], attribute: 'data-jp-content-enter-ease' },
    exitEase: { type: 'string', values: [...EASES], attribute: 'data-jp-content-exit-ease' },
    motionEase: { type: 'string', values: [...EASES], attribute: 'data-jp-content-motion-ease' },
    enterStagger: { type: 'number', min: 0, max: 2000, attribute: 'data-jp-content-enter-stagger' },
    exitStagger: { type: 'number', min: 0, max: 2000, attribute: 'data-jp-content-exit-stagger' },
  },
  themes: { studio }, skill,
  schemas: { step: z.union([Frame, z.strictObject({ cameraIssued: z.literal(true) })]) },
  data: { step: { scope: [{ path: ['scenes'], kind: 'map', domain: 'scene', children: [{ path: ['camera', 'targets'], kind: 'values', domain: 'element' }, { path: ['camera', 'sequence', '*', 'targets'], kind: 'values', domain: 'element' }] }] } },
  compile: {
    node(node, ctx) {
      if (node.type === 'content:ItemTrack') {
        const props = node.props;
        const track = readTrack(isBind(props.items) ? { ...props, items: [] } : props);
        for (const issue of track.issues) ctx.report('ITEM_TRACK_INVALID', `<ItemTrack> ${issue}`, node.source);
        return;
      }
      if (node.type === 'content:Split') {
        const text = node.props?.text;
        // 绑定状态（$.ui.title）在这里不是字符串；只拦没写、空白和数字 / 布尔字面量
        if (text === undefined || text === null || (typeof text === 'string' ? !text.trim() : typeof text === 'number' || typeof text === 'boolean')) ctx.report('SPLIT_INVALID', '<Split text>: write the text to split as a nonempty string (it may be a state binding like $.ui.title)', node.source);
        if (node.props?.by !== undefined && !(SPLITS as readonly unknown[]).includes(node.props.by)) ctx.report('SPLIT_INVALID', `<Split by>: use one of ${SPLITS.join(', ')}`, node.source);
        if (node.children?.length) ctx.report('SPLIT_INVALID', '<Split>: put the text in the text prop, not in children', node.source);
        return;
      }
      if (node.type !== 'content:Canvas') return;
      if (node.props.drift !== undefined && !DriftSchema.safeParse(node.props.drift).success) ctx.report('CAMERA_INVALID', `<Canvas drift>: use false, a zoom factor 0.5–2 (e.g. 1.04), or { zoom 0.5–2, x/y −2000–2000 design px, ms 500–60000 }`, node.source);
      if (node.props.safe !== undefined && !Safe.safeParse(node.props.safe).success) ctx.report('CAMERA_INVALID', `<Canvas safe>: use [top, right, bottom, left] in design px (each 0–2000), the part of the view your screen chrome covers`, node.source);
    },
    effect(effect, ctx) {
      if (effect.name !== 'camera') { ctx.report('PLUGIN_EFFECT_UNKNOWN', `Unknown content effect ${effect.name}`, ctx.source); return; }
      const parsed = CameraCommand.safeParse(effect.payload);
      if (!parsed.success) { ctx.report('CAMERA_INVALID', `camera(…): targets must be strings; pad 0–2000, zoom 0.1–10, ms 0–10000, drift false | 0.5–2 | { zoom 0.5–2, x/y −2000–2000, ms 500–60000 } (${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')})`, ctx.source); return; }
      const { framing, waitForMove, ...settings } = parsed.data;
      const preset = framing && FRAMING[framing];
      const value = preset ? {
        ...settings, pad: settings.pad ?? preset.pad, zoom: settings.zoom ?? preset.zoom, ms: settings.ms ?? preset.ms,
      } : settings;
      if (value.sequence && (value.sequence[0]!.atMs !== 0 || value.sequence.some((p, i, a) => i > 0 && p.atMs <= a[i - 1]!.atMs))) { ctx.report('CAMERA_INVALID', 'cameraSequence starts at 0 and needs strictly increasing atMs', ctx.source); return; }
      const targets = [...value.targets, ...value.sequence?.flatMap(p => p.targets) ?? []];
      const nodes = ctx.roots.flatMap(all);
      const missing = targets.filter(id => !nodes.some(n => n.id === id));
      if (missing.length) { ctx.report('CAMERA_UNKNOWN', `camera(${missing.map(m => JSON.stringify(m)).join(', ')}) target is not in any layer or the stage for this step; aim it at elements inside a <Canvas>`, ctx.source); return; }
      const holdMs = value.sequence?.at(-1)?.atMs ?? (waitForMove ? Math.ceil(value.ms ?? DEFAULT_MOVE_MS) : undefined);
      return {
        writes: [{ path: 'ui.__plugins.content.camera', value }],
        data: { cameraIssued: true },
        references: targets,
        ...(holdMs !== undefined ? { holdMs } : {}),
        ...(value.targets.length ? { directorTarget: value.targets[0] } : {}),
      };
    },
    frame(ctx) {
      const sceneNodes = ctx.scenes.map(scene => ({ id: scene.id, nodes: all(scene.root) }));
      for (const scene of sceneNodes) for (const node of scene.nodes) {
        if (node.type !== 'content:ItemTrack' || typeof node.props?.items !== 'string') continue;
        for (const issue of readTrack(ctx.resolveProps(node)).issues) ctx.report('ITEM_TRACK_INVALID', `<ItemTrack id="${node.id}"> at position ${ctx.position}: ${issue}`, node.source);
      }
      const scenes = sceneNodes.filter(s => s.nodes.some(n => n.type === 'content:Canvas'));
      if (!scenes.length) return;
      const value = (ctx.state.ui.__plugins as { content?: { camera?: unknown } } | undefined)?.content?.camera;
      const parsed = Camera.safeParse(value ?? { targets: [] });
      if (!parsed.success) { ctx.report('CAMERA_INVALID', 'Invalid content camera state; use camera() with valid settings'); return; }
      // 历史 DOM 缓存无法在深链/静帧重现同样的取景；在编译快照中明确提示，作者可改用稳定锚点。
      const targets = new Set([...parsed.data.targets, ...parsed.data.sequence?.flatMap(p => p.targets) ?? []]);
      for (const scene of scenes) {
        const nodes = scene.nodes;
        for (const id of targets) {
          const node = nodes.find(n => n.id === id);
          if (node && !ctx.isVisible(scene.id, id)) ctx.report('CAMERA_TARGET_HIDDEN', `Camera target "${id}" is hidden at position ${ctx.position}; its bounds cannot be measured and framing may fall back to the whole canvas. Aim camera() at an always-visible anchor, switch to a visible target, or reset with camera().`, node.source, 'warning');
        }
      }
      const nextScenes = Object.fromEntries(scenes.map(s => [s.id, { camera: { ...parsed.data, ...(parsed.data.sequence ? { sequenceId: ctx.position === 0 ? 0 : (ctx.data as {cameraIssued?: boolean})?.cameraIssued ? ctx.position : (ctx.previousData as ContentFrame | undefined)?.scenes[s.id]?.camera.sequenceId ?? 0 } : {}), targets: parsed.data.targets.filter(id => s.nodes.some(n => n.id === id)) } }]));
      if (ctx.position >= 1 && (ctx.data as { cameraIssued?: boolean } | undefined)?.cameraIssued && sameAuthorState(ctx.previousState, ctx.state)) {
        const prevScenes = (ctx.previousData as ContentFrame | undefined)?.scenes;
        if (scenes.some((s) => isCosmeticCameraShift(prevScenes?.[s.id]?.camera, nextScenes[s.id]!.camera))) {
          ctx.report('CAMERA_DRIFT_ONLY', `camera() at step ${ctx.position} keeps the same target(s) without changing stage state and only adds drift or a subtle micro-shift. Do not use subtle camera movement to work around STILL while narration plays; instead enrich the stage with progressive content (reveal a detail, highlight/callout, pulse an edge, or update visible state), or keep the frame calm with drift={false}.`, undefined, 'warning');
        }
      }
      return { scenes: nextScenes };
    },
  },
});
export const Canvas = pluginComponent(content, 'Canvas');
export const Split = pluginComponent(content, 'Split');
export const ItemTrack = pluginComponent(content, 'ItemTrack') as (props: ItemTrackProps) => JNode;
export default content;
