import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import lottie from 'lottie-web/build/player/lottie_light.js';
import { defineRuntime, embeddedAsset, type ComponentCtx } from '@joplo-app/kit/plugin';
import { useEngineFrame, useRoot } from '@joplo-app/kit/renderer';
import type { ClipFrame } from './model.ts';

/**
 * 媒体插件的画法（D96 原型）：只读编译好的快照 ext.media.clips，画面时间全部按引擎时间算。
 * - 这一步在播（live）：时间 = from + 这一步提交后的 elapsedMs，到 to 为止；时钟在走时让视频自己播、偏差大于 0.25s 才校正，
 *   暂停时停在当前时间，倍速跟随时钟；
 * - 其他情况（静止、截图、跳转、时钟停了）：定位到 to，截图等这一帧解码好（ctx.hold）。
 */
type Clips = { clips?: Record<string, ClipFrame> };
const num = (v: unknown, d?: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** 片段这一步要逐帧定位：只在它在播时订阅每一帧（D99）。 */
function useClipTime(ctx: ComponentCtx, clip: ClipFrame | undefined): { t: number; playing: boolean } {
  const clock = ctx.frame.clock;
  useEngineFrame(!!clip?.live && ctx.frame.animate && !!clock);
  return timeOf(ctx, clip);
}

function timeOf(ctx: ComponentCtx, clip: ClipFrame | undefined): { t: number; playing: boolean } {
  if (!clip) return { t: 0, playing: false };
  const clock = ctx.frame.clock;
  const timed = ctx.frame.animate && !!clock && (clock.running || !!clock.paused);
  if (!clip.live || !timed) return { t: clip.to, playing: false };
  const t = Math.min(clip.to, clip.from + clock!.elapsedMs / 1000);
  return { t, playing: !!clock!.running && t < clip.to };
}

function Video({ ctx }: { ctx: ComponentCtx }) {
  const node = ctx.model;
  const p = ctx.node.props;
  const clip = (ctx.ext.media as Clips | undefined)?.clips?.[node.id];
  const { t, playing } = useClipTime(ctx, clip);
  const src = embeddedAsset(p.src, 'video');
  const ref = useRef<HTMLVideoElement>(null);
  const { src: _s, w, h, fit, start: _st, ...rest } = p;
  const root = useRoot(node, rest, { style: { width: num(w) ?? '100%', height: num(h) ?? 'auto', position: 'relative', overflow: 'hidden', borderRadius: 10, background: '#000' } });
  const speed = ctx.frame.clock?.speed ?? 1;
  useLayoutEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.playbackRate = speed;
    if (playing) {
      if (Math.abs(v.currentTime - t) > 0.25) v.currentTime = t;
      if (v.paused) void v.play().catch(() => {});
      return;
    }
    if (!v.paused) v.pause();
    if (Math.abs(v.currentTime - t) <= 0.03 && v.readyState >= 2) return;
    // 静止画面：定位到这一帧，截图等它解码好
    const done = ctx.hold();
    let released = false;
    const release = () => { if (!released) { released = true; done(); } };
    const ready = () => { v.removeEventListener('seeked', ready); v.removeEventListener('loadeddata', ready); release(); };
    v.addEventListener('seeked', ready);
    v.addEventListener('loadeddata', ready);
    try { v.currentTime = t; } catch { release(); }
    const timer = setTimeout(release, 5000);
    return () => { clearTimeout(timer); v.removeEventListener('seeked', ready); v.removeEventListener('loadeddata', ready); release(); };
  }, [t, playing, speed, src]);
  if (!src) return <div {...root} />;
  return (
    <div {...root}>
      <video ref={ref} src={src} muted playsInline preload="auto" style={{ width: '100%', height: '100%', objectFit: fit === 'contain' ? 'contain' : 'cover', display: 'block' }} />
    </div>
  );
}

type Anim = ReturnType<typeof lottie.loadAnimation>;
function Lottie({ ctx }: { ctx: ComponentCtx }) {
  const node = ctx.model;
  const p = ctx.node.props;
  const clip = (ctx.ext.media as Clips | undefined)?.clips?.[node.id];
  const { t } = useClipTime(ctx, clip);
  const src = embeddedAsset(p.src, 'json');
  const box = useRef<HTMLDivElement>(null);
  const [anim, setAnim] = useState<Anim | null>(null);
  const { src: _s, w, h, start: _st, ...rest } = p;
  const root = useRoot(node, rest, { style: { width: num(w) ?? '100%', height: num(h) ?? 'auto', position: 'relative' } });
  // 载入动画（截图等它画出第一帧）
  useEffect(() => {
    const el = box.current;
    if (!el || !src) return;
    const done = ctx.hold();
    let alive = true, item: Anim | null = null;
    fetch(src).then((r) => r.json()).then((data) => {
      if (!alive) return;
      item = lottie.loadAnimation({ container: el, renderer: 'svg', loop: false, autoplay: false, animationData: data });
      item.addEventListener('DOMLoaded', () => { if (alive) setAnim(item); done(); });
    }).catch(() => done());
    return () => { alive = false; item?.destroy(); setAnim(null); done(); };
  }, [src]);
  // 每次渲染按引擎时间定位到对应帧
  useLayoutEffect(() => {
    if (!anim) return;
    const frame = Math.max(0, Math.min(anim.totalFrames - 1, t * anim.frameRate));
    anim.goToAndStop(frame, true);
  }, [anim, t]);
  return <div {...root}><div ref={box} style={{ width: '100%', height: '100%' }} /></div>;
}

export default defineRuntime({ id: 'media', components: { Video: { react: Video }, Lottie: { react: Lottie } } });
