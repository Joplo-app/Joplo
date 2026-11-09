/**
 * 封面：画布上的一个 screen 元素（固定在屏幕上），开场第一步淡出。
 * 它就是第一个场景的初始画面，也就是分享卡片 / 预览图（share 截的是默认场景的初始画面），按缩略图来设计：
 * 一句不超过五个字的大字、一个视觉焦点、高对比；和片名互补，不重复片名。
 */
import { $ } from '@joplo-app/kit';
import { STEPS } from './data.ts';
import { C } from './palette.ts';

export function Poster() {
  const top = STEPS.name.slice(0, 3);
  return (
    <div id="poster" screen style={{ position: 'absolute', left: 0, top: 0, width: 1280, height: 800, background: `radial-gradient(90% 90% at 75% 40%, #232a58 0%, ${C.bg} 65%)`, color: C.ink, opacity: $.ui.poster, transition: 'opacity 900ms ease', pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 72, top: 0, bottom: 0, width: 680, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18 }}>
        <span style={{ alignSelf: 'flex-start', fontSize: 16, fontWeight: 900, letterSpacing: 3, color: C.bg, background: C.accent, padding: '4px 12px', borderRadius: 3 }}>AI 原理 · 五分钟看懂</span>
        <div style={{ fontSize: 96, fontWeight: 900, lineHeight: 1.12 }}>
          它不是在写
          <div>是在<span style={{ background: C.accent, color: C.bg, padding: '0 10px', margin: '0 4px', borderRadius: 4, display: 'inline-block', lineHeight: 1.3 }}>猜</span></div>
        </div>
        <div style={{ fontSize: 24, color: C.muted, fontWeight: 600 }}>大模型的每一个字，都是从候选里抽出来的</div>
      </div>
      <div style={{ position: 'absolute', right: 64, top: 200, transform: 'rotate(-3deg)', width: 430, background: C.panel, border: `1px solid ${C.lineStrong}`, borderRadius: 18, padding: '22px 24px', boxShadow: '0 30px 60px rgba(0,0,0,.55)', display: 'flex', flexDirection: 'column', gap: 16, boxSizing: 'border-box' }}>
        <div style={{ fontSize: 17, color: C.muted }}>就叫它“ <span style={{ color: C.accent, fontWeight: 900 }}>▍</span></div>
        {top.map((c, i) => (
          <div key={c.label} style={{ display: 'grid', gridTemplateColumns: '84px 1fr 60px', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 30, fontWeight: 900, color: i === 0 ? C.accent : C.ink, textAlign: 'right' }}>{c.label}</span>
            <span style={{ height: 26, borderRadius: 5, background: C.panel2, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${c.p * 2}%`, borderRadius: 5, background: i === 0 ? C.accent : C.bar }} />
            </span>
            <span style={{ fontSize: 22, fontWeight: 800, color: i === 0 ? C.accent : C.ink }}>{c.p}%</span>
          </div>
        ))}
        <div style={{ alignSelf: 'flex-end', fontSize: 12, fontWeight: 800, color: C.accent, border: `1px solid ${C.accent}`, borderRadius: 3, padding: '1px 6px' }}>示意</div>
      </div>
    </div>
  );
}
