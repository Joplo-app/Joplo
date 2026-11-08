/**
 * 开场钩子：国会大厦全幅照片（党派色调由红翻蓝）+ 特朗普肖像 + 超大标题。
 * 三拍：交代时间 → 翻转（一夜之间丢掉国会）→ 抛出三个问题。
 */
import { $, eq, oneOf, type Bind } from '@joplo-app/kit';
import { Photo } from './art.tsx';
import { Hl } from './frame.tsx';
import { C } from './palette.ts';

const ui = $.ui as unknown as Record<string, Bind>;
const data = $.data as unknown as Record<string, Bind>;

export const coverState = () => ({
  ui: { cover: 'intro' },
  data: { coverTint: '#c0392b' },
});
export const coverFlip = { coverTint: '#2563eb' };

function Question({ id, n, text }: { id: string; n: string; text: string }) {
  return (
    <div id={id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ width: 30, height: 30, borderRadius: '50%', background: C.gold, color: C.bg, fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{n}</span>
      <span style={{ fontSize: 22, fontWeight: 750 }}>{text}</span>
    </div>
  );
}

export function CoverLayer() {
  return (
    <div style={{ position: 'relative', height: '100%', background: C.bg, color: C.ink, overflow: 'hidden' }}>
      {/* 背景：国会大厦 */}
      <Photo id="cv_capitol" name="capitol.jpg" tint={data.coverTint} pos="center 40%" style={{ position: 'absolute', inset: 0, opacity: 0.55 }} />
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, ${C.bg} 0%, rgba(10,14,22,.85) 42%, rgba(10,14,22,.2) 75%, rgba(10,14,22,.6) 100%)` }} />
      {/* 右侧：特朗普 */}
      <Photo id="cv_trump" name="trump.jpg" pos="center 20%" fade="soft"
        style={{ position: 'absolute', right: 0, bottom: 0, width: '40%', height: '92%' }} />
      <div style={{ position: 'absolute', right: 12, bottom: 8, fontSize: 10, color: 'rgba(255,255,255,.55)' }}>图片：白宫 / Daniel Torok；美国国会建筑师办公室（均为公有领域）</div>
      {/* 左侧：标题 */}
      <div style={{ position: 'absolute', left: 64, top: 0, bottom: 0, width: '58%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ background: C.rep, color: '#fff', fontWeight: 900, padding: '4px 12px', borderRadius: 3, fontSize: 15, letterSpacing: 2 }}>2026 美国中期选举</span>
          <span style={{ color: C.muted, fontSize: 15 }}>投票日 · 11 月 3 日</span>
        </div>
        <div id="cv_intro" when={eq(ui.cover, 'intro') as never} style={{ fontSize: 58, fontWeight: 900, lineHeight: 1.2 }}>
          {'选票上没有他的名字'}
          <div style={{ fontSize: 30, fontWeight: 700, color: C.muted, marginTop: 14 }}>但这次投票，决定他接下来两年还能做多少事</div>
        </div>
        <div id="cv_flip" when={oneOf(ui.cover, ['flip', 'ask']) as never} style={{ fontSize: 60, fontWeight: 900, lineHeight: 1.22 }}>
          <div style={{ fontSize: 30, color: C.gold, fontWeight: 800, marginBottom: 6 }}>一夜之间</div>
          特朗普丢掉了
          <div><Hl tone="blue">整个国会</Hl></div>
          <div style={{ fontSize: 22, fontWeight: 600, color: C.muted, marginTop: 14 }}>民主党同时夺回众议院和参议院（AP 已宣布）</div>
        </div>
        <div id="cv_ask" when={eq(ui.cover, 'ask') as never} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 6 }}>
          <Question id="q1" n="1" text="中期选举到底选的是什么？" />
          <Question id="q2" n="2" text="输掉国会，总统会被怎样卡住？" />
          <Question id="q3" n="3" text="AI 行业和你的股票账户，会受什么影响？" />
        </div>
      </div>
    </div>
  );
}
