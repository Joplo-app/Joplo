import { wavInfo } from './sfx.ts';
import packageInfo from './version.json' with { type: 'json' };
import { z } from 'zod';
import { definePlugin, pluginComponent, pluginEffect, type PluginIRNode } from '@joplo-app/kit/plugin';
import { skill } from './guide.ts';
import { decodeDataUrl, durationOf, lottieInfo, type ClipFrame } from './model.ts';

/**
 * 媒体插件（D96 原型）：视频片段与 Lottie 动画，跟着引擎时钟播放。
 * 端到端：<Video> / <Lottie> 的 src（asset()，build 后是 assets/ 独立文件，D98）→ playClip 效果校验时段、
 * 按时长给 holdMs → effect 记下这一步的播放 → frame 得到每一步每个片段停在哪里（ext.media.clips）
 * → 运行时按引擎时间定位画面（暂停冻住、倍速跟随、截图定位到终点帧、视频录制一致）。
 * 第一版视频一律静音：通用媒体层只混音频，视频的声音不进旁白压低与视频导出（D98 记录的缺口）。
 */
type PlayOpts = { from?: number; to?: number };
/** 播放 Video / Lottie 的一段（秒）：缺省从上次停的地方播到结尾。这一步停留到播完（holdMs）。 */
export const playClip = (id: string, opts: PlayOpts = {}) => pluginEffect('media', 'play', { id, ...opts });

const all = (n: PluginIRNode): PluginIRNode[] => [n, ...(n.children ?? []).flatMap(all)];
const clipsIn = (roots: readonly PluginIRNode[]) => roots.flatMap(all).filter((n) => n.type === 'media:Video' || n.type === 'media:Lottie');
type Play = { id: string; from: number | null; to: number | null };
type Frame = { clips: Record<string, ClipFrame> };
const ClipS = z.strictObject({ from: z.number().nonnegative(), to: z.number().nonnegative(), live: z.boolean() });
const StepS = z.union([
  z.strictObject({ plays: z.array(z.strictObject({ id: z.string(), from: z.number().nullable(), to: z.number().nullable() })) }),
  z.strictObject({ clips: z.record(z.string(), ClipS) }),
]);
const startOf = (node: PluginIRNode) => (typeof node.props?.start === 'number' && node.props.start >= 0 ? node.props.start : 0);

const media = definePlugin({
  packageName: '@joplo-app/plugin-av',
  id: 'media', title: 'Media', version: packageInfo.version,
  runtime: new URL(new URL(import.meta.url).pathname.endsWith('.ts') ? './runtime.tsx' : './runtime.js', import.meta.url),
  components: {
    Video: { doc: 'src={asset(\'./clip.mp4\')} (mp4 / webm), w?, h?, fit?=\'cover\'|\'contain\', start? (seconds shown before the first play); a muted video clip played by playClip', needsId: true, selfEvident: true },
    Lottie: { doc: 'src={asset(\'./anim.json\')} (Lottie JSON), w?, h?, start?; a vector animation played by playClip', needsId: true, selfEvident: true },
  },
  skill,
  schemas: { step: StepS },
  data: { step: { scope: [{ path: ['clips'], kind: 'map', domain: 'element' }] } },
  compile: {
    node(n, { report }) {
      if (n.type !== 'media:Video' && n.type !== 'media:Lottie') return;
      const { props = {}, source } = n as { props?: Record<string, unknown>; source?: string };
      const d = decodeDataUrl(props.src);
      if (n.type === 'media:Video' && !(d && /^video\/(mp4|webm)$/.test(d.mime))) report('MEDIA_SRC_INVALID', '<Video src> must be asset(\'./clip.mp4\') or a .webm file in the project', source);
      if (n.type === 'media:Lottie') {
        let ok = false;
        try { ok = !!d && d.mime === 'application/json' && !!lottieInfo(JSON.parse(Buffer.from(d.bytes).toString('utf8'))); } catch { ok = false; }
        if (!ok) report('MEDIA_SRC_INVALID', '<Lottie src> must be asset(\'./anim.json\') with a Lottie (Bodymovin) export', source);
      }
    },
    effect(effect, ctx) {
      if (effect.name !== 'play') { ctx.report('PLUGIN_EFFECT_UNKNOWN', `Unknown media effect ${effect.name}`, ctx.source); return; }
      const p = (effect.payload ?? {}) as Record<string, unknown>;
      const id = typeof p.id === 'string' ? p.id : '';
      const node = clipsIn(ctx.roots).find((n) => n.id === id);
      if (!node) { ctx.report('MEDIA_UNKNOWN', `playClip("${id}"): no <Video> or <Lottie> with this id on the screens of this step`, ctx.source); return; }
      const num = (v: unknown) => v === undefined ? null : typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : NaN;
      const from = num(p.from), to = num(p.to);
      if (Number.isNaN(from) || Number.isNaN(to)) { ctx.report('MEDIA_TIME_INVALID', 'playClip { from, to } are seconds ≥ 0', ctx.source); return; }
      const duration = durationOf(node.props?.src);
      if (to === null && duration === null) { ctx.report('MEDIA_DURATION_UNKNOWN', `playClip("${id}"): this file's length is unknown (WebM); write { to: <seconds> }`, ctx.source); return; }
      const end = to ?? duration!;
      if (duration !== null && end > duration + 0.05) { ctx.report('MEDIA_TIME_INVALID', `playClip("${id}") to=${end}s is past the end (${duration.toFixed(2)}s)`, ctx.source); return; }
      if (from !== null && from >= end) { ctx.report('MEDIA_TIME_INVALID', `playClip("${id}") from must be before to`, ctx.source); return; }
      // 时长按“从哪里播”算：没写 from 时是上一次停的地方，编译期不知道；按最长（从头）估，不会让自动播放提前切走
      const holdMs = Math.min(60_000, Math.ceil((end - (from ?? 0)) * 1000) + 300);
      const plays = [...((ctx.data as { plays?: Play[] } | undefined)?.plays ?? []), { id, from, to: end }];
      return { data: { plays }, references: [id], holdMs };
    },
    frame(ctx) {
      const nodes = clipsIn(ctx.roots);
      if (!nodes.length) return;
      const previous = (ctx.previousData as Frame | undefined)?.clips ?? {};
      const plays = (ctx.data as { plays?: Play[] } | undefined)?.plays ?? [];
      const clips: Record<string, ClipFrame> = {};
      for (const node of nodes) {
        if (clips[node.id]) continue;
        const base = previous[node.id] ?? { from: startOf(node), to: startOf(node), live: false };
        const play = [...plays].reverse().find((x) => x.id === node.id);
        clips[node.id] = play ? { from: play.from ?? base.to, to: play.to ?? base.to, live: true } : { from: base.to, to: base.to, live: false };
      }
      return { clips } satisfies Frame;
    },
  },
});

export const Video = pluginComponent(media, 'Video');
export const Lottie = pluginComponent(media, 'Lottie');
export default media;

export { sfx, type SfxOptions } from './sfx.ts';
/** Enable this manifest instead of the default media manifest when using local sound effects. */
export function withSoundEffects(assets: Record<string, string>) {
  return definePlugin({ ...media,
    local: new URL(new URL(import.meta.url).pathname.endsWith('.ts') ? './local.ts' : './local.js', import.meta.url),
    compile: { ...media.compile, effect(effect, ctx) {
      if (effect.name !== 'sfx') return media.compile!.effect!(effect, ctx);
      const p = effect.payload as { name?: unknown; volume?: unknown; offsetMs?: unknown; startDelayMs?: unknown; duck?: unknown } | null;
      try {
        if (!p || typeof p.name !== 'string' || !Object.hasOwn(assets, p.name)) throw new Error('Unknown sound name; declare it in withSoundEffects({ name: asset(...) })');
        const { durationMs } = wavInfo(assets[p.name]);
        const volume = p.volume ?? 1, offsetMs = p.offsetMs ?? 0;
        if (typeof volume !== 'number' || !Number.isFinite(volume) || volume < 0 || volume > 1) throw new Error('volume must be 0–1');
        if (typeof offsetMs !== 'number' || !Number.isFinite(offsetMs) || offsetMs < 0 || offsetMs >= durationMs) throw new Error('offsetMs must be inside the sound duration');
        if (p.startDelayMs !== undefined && (typeof p.startDelayMs !== 'number' || !Number.isFinite(p.startDelayMs) || p.startDelayMs < 0 || p.startDelayMs > 60000)) throw new Error('startDelayMs must be 0–60000 engine milliseconds');
        if (p.duck !== undefined && typeof p.duck !== 'boolean') throw new Error('duck must be boolean');
        const resource = ctx.resource({ compiler: 'sfx', input: assets[p.name]! });
        return { media: [{ track: 'sfx', action: 'play', resource, oneShot: true, durationMs, volume, offsetMs, ...(p.startDelayMs !== undefined ? {startDelayMs:p.startDelayMs as number}:{}), ...(p.duck !== undefined ? {duck:p.duck as boolean}:{}) }] };
      } catch (error) { ctx.report('SFX_INVALID', error instanceof Error ? error.message : 'Invalid sound effect', ctx.source); }
    } },
  });
}
