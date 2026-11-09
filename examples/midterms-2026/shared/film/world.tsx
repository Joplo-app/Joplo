/**
 * 整支片子只有这一张画布：九个区块 + 三个钉在各自区块上的问题标签 + 固定在屏幕上的章节标记、来源、片尾提示。
 * 字幕（narrate）浮在画面底部正中，播放器的步骤标题在左上角弹出，所以章节标记放右上角，来源跟在它下面；
 * <Canvas safe> 把这两条留出来，镜头对准区块时不会被盖住。
 */
import { $, and, eq, type Bind } from '@joplo-app/kit';
import { Canvas } from '@joplo-app/plugin-content';
import { C } from '../palette.ts';
import { Ai, History, Market } from './bottom.tsx';
import { WORLD, at } from './layout.ts';
import { Ballot, Congress, MapBlock } from './middle.tsx';
import { Standoff } from './standoff.tsx';
import { Term, Why } from './top.tsx';

const ui = $.ui as unknown as Record<string, Bind>;

// ---------- 问题标签：开场钉在要回答它的区块上，章末翻成“✓ 答案”；全景时放大 ----------
export const TAGS = [
  { q: '中期选举选什么？', a: '选的是国会和州长', x: 24, y: 1180 },
  { q: '输掉国会，他会被怎样卡住？', a: '法案、预算、人事都被卡', x: 1560, y: 60 },
  { q: 'AI 和股市，受什么影响？', a: '利好只撑一天，芯片领跌', x: 1330, y: 1670 },
] as const;

function Tag({ i }: { i: number }) {
  const t = TAGS[i]!;
  const key = ui[`q${i + 1}`]!;
  const variant = (state: 'ask' | 'now' | 'done', big: boolean) => {
    const done = state === 'done';
    const bc = done ? C.up : state === 'now' ? C.gold : C.lineStrong;
    const s = big ? 2 : 1;
    return (
      <div when={and(eq(key, state), eq(ui.overview, big))} motion={`tag_${i}`} motionMs={1100} enter="zoom" enterMs={500} enterDelay={i * 250} exit="fade" exitMs={300}
        style={{ position: 'absolute', left: 0, top: 0, display: 'inline-flex', alignItems: 'center', gap: 14 * s, height: 64 * s, padding: `0 ${24 * s}px 0 ${10 * s}px`, borderRadius: 40 * s, background: 'rgba(18,25,39,.96)', border: `${3 * s}px solid ${bc}`, whiteSpace: 'nowrap', boxShadow: '0 10px 30px rgba(0,0,0,.5)' }}>
        <span style={{ width: 44 * s, height: 44 * s, borderRadius: '50%', background: bc, color: C.bg, fontWeight: 900, fontSize: 24 * s, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{done ? '✓' : String(i + 1)}</span>
        <span style={{ fontSize: 30 * s, fontWeight: 900, color: done ? C.up : C.ink }}>{done ? t.a : t.q}</span>
      </div>
    );
  };
  return (
    <div id={`tag_${i + 1}`} style={{ ...at(t.x, t.y, 600, 64) }}>
      {variant('ask', false)}{variant('now', false)}{variant('done', false)}
      {variant('ask', true)}{variant('now', true)}{variant('done', true)}
    </div>
  );
}

/** 章节标记（右上角）：每章一个元素，换章时旧的淡出、新的升起。 */
export const CHAPTERS = [
  ['01', '中期选举，到底在选什么？'],
  ['02', '蓝色浪潮有多大？'],
  ['03', '他接下来会被怎样卡住？'],
  ['04', 'AI 和股市：你的钱会怎样？'],
] as const;

/** 片头之前的“封面”在第一帧：大标题 + 特朗普，就是分享卡片的缩略图，所以开场没有章节标记。 */
export function WorldLayer() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas w={WORLD.w} h={WORLD.h} safe={[60, 0, 70, 0]} drift={{ zoom: 1.06, ms: 10000 }}
        style={{ background: `radial-gradient(120% 90% at 40% 0%, #141c2c 0%, ${C.bg} 60%)`, color: C.ink }}>
        <Term />
        <Standoff />
        <Why />
        <Ballot />
        <Congress />
        <MapBlock />
        <History />
        <Market />
        <Ai />
        {TAGS.map((_, i) => <Tag i={i} />)}

        {/* 固定在屏幕上 */}
        {CHAPTERS.map(([n, t]) => (
          <div screen when={eq(ui.chN, n)} enter="rise" enterMs={600} enterDelay={300} exit="fade" exitMs={300} style={{ position: 'absolute', right: 20, top: 16, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px 8px 8px', borderRadius: 10, background: 'rgba(10,14,22,.88)', border: `1px solid ${C.line}` }}>
            <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: 2, color: C.bg, background: C.gold, borderRadius: 5, padding: '3px 10px' }}>{n}</span>
            <span style={{ fontSize: 20, fontWeight: 800 }}>{t}</span>
          </div>
        ))}
        <div screen style={{ position: 'absolute', right: 22, top: 64, width: 620, textAlign: 'right', fontSize: 12, color: C.muted, textShadow: '0 1px 3px #000' }}>{ui.src}</div>
        <div screen when={ui.cta} enter="rise" enterMs={700} style={{ position: 'absolute', left: 200, top: 18, width: 880, height: 84, borderRadius: 18, background: C.gold, color: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22, boxShadow: '0 20px 60px rgba(0,0,0,.6)', pointerEvents: 'none' }}>
          <span style={{ fontSize: 30, fontWeight: 900 }}>接下来两年，盯住三件事</span>
          <span style={{ fontSize: 24, fontWeight: 800 }}>否决 · 停摆 · 听证</span>
        </div>
      </Canvas>
    </div>
  );
}
