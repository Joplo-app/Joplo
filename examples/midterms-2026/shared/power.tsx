/**
 * 第三部分：白宫 vs 国会的“对峙舞台”。
 * 左边白宫与特朗普，右边国会大厦（色调随控制权由红翻蓝）；中间一张“文件”在两边之间飞：
 * 法案、拨款、传票、提名……落地时盖章（否决 / 停摆 / 搁置）。底部一句话讲清规则。
 * 文件的位置、文字、印章都绑定到 $.data，CSS 过渡负责动画。
 */
import { $, type Bind } from '@joplo-app/kit';
import { Photo } from './art.tsx';
import { C } from './palette.ts';

const ui = $.ui as unknown as Record<string, Bind>;
const data = $.data as unknown as Record<string, Bind>;

/** 文件停靠的位置（舞台宽度百分比）。 */
export const AT = { congress: '70%', whitehouse: '30%' };
/** 印章：落下（可见、正常大小）和收起（透明、放大，下次落下时有“砸”的感觉）。 */
export const STAMP_UP = { stampOp: 0, stampScale: 'translateX(-50%) scale(2.2) rotate(-14deg)' };
export const stampDown = (text: string, x: string, color: string) => ({ stampText: text, stampX: x, stampColor: color, stampOp: 1, stampScale: 'translateX(-50%) scale(1) rotate(-12deg)' });

export const powerState = () => ({
  ui: { override: false },
  data: {
    capTint: '#c0392b',
    houseChip: '众议院 · 共和党',
    senateChip: '参议院 · 共和党',
    chipHouseBg: C.rep,
    chipSenateBg: C.rep,
    paperX: AT.congress,
    paperOp: 0,
    paperKind: '法案',
    paperText: '',
    stampText: '',
    stampX: AT.whitehouse,
    stampColor: C.rep,
    ...STAMP_UP,
    rule: '选前：白宫、众议院、参议院都在共和党手里',
  },
});

/** 2027 年 1 月 3 日新国会就职后的国会颜色。 */
export const congressBlue = {
  capTint: '#1d4ed8',
  houseChip: '众议院 · 民主党', senateChip: '参议院 · 民主党', chipHouseBg: C.dem, chipSenateBg: C.dem,
};

function Chip({ text, bg }: { text: Bind; bg: Bind }) {
  return (
    <span style={{ background: bg as never, color: '#fff', fontWeight: 800, fontSize: 15, padding: '5px 12px', borderRadius: 4, transition: 'background-color 900ms' }}>{text as never}</span>
  );
}

function Bar({ id, label, have, need }: { id: string; label: string; have: number; need: number }) {
  return (
    <div id={id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 150px', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 16, fontWeight: 750 }}>{label}</span>
      <div style={{ position: 'relative', height: 16, background: C.none, borderRadius: 8 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(have / need) * 92}%`, background: C.dem, borderRadius: 8 }} />
        <div style={{ position: 'absolute', left: '92%', top: -6, bottom: -6, width: 3, background: C.gold }} />
      </div>
      <span style={{ fontSize: 15, color: C.muted }}><strong style={{ color: C.ink, fontSize: 18 }}>{have}</strong>{` 席 / 需要 ${need}`}</span>
    </div>
  );
}

export function PowerLayer() {
  return (
    <div style={{ position: 'relative', height: '100%', background: C.bg, color: C.ink, overflow: 'hidden' }}>
      {/* 左：白宫 + 特朗普 */}
      <div id="side_wh" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '46%' }}>
        <Photo id="wh_photo" name="whitehouse.jpg" tint="#b3261e" pos="center 60%" credit="白宫照片：DJTechYT / CC BY-SA 4.0 / Wikimedia Commons" creditTop style={{ position: 'absolute', inset: 0, opacity: 0.45 }} />
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, rgba(10,14,22,.15), ${C.bg} 100%)` }} />
        <Photo id="sd_trump" name="trump.jpg" pos="center 18%" fade="soft" style={{ position: 'absolute', left: '6%', bottom: 96, width: 300, height: 380 }} />
        <div style={{ position: 'absolute', left: 32, top: 26, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 14, color: C.muted, letterSpacing: 2 }}>白宫</span>
          <span style={{ fontSize: 32, fontWeight: 900 }}>特朗普</span>
          <span style={{ background: C.rep, color: '#fff', fontWeight: 800, fontSize: 15, padding: '5px 12px', borderRadius: 4, alignSelf: 'flex-start' }}>共和党 · 任期到 2029 年 1 月</span>
        </div>
      </div>
      {/* 右：国会 */}
      <div id="side_cap" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '50%' }}>
        <Photo id="cap_photo" name="capitol.jpg" tint={data.capTint} pos="center 45%" style={{ position: 'absolute', inset: 0, opacity: 0.5 }} />
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(270deg, rgba(10,14,22,.1), ${C.bg} 100%)` }} />
        <div style={{ position: 'absolute', right: 32, top: 26, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          <span style={{ fontSize: 14, color: C.muted, letterSpacing: 2 }}>国会</span>
          <span style={{ fontSize: 32, fontWeight: 900 }}>参众两院</span>
          <div id="cap_chips" style={{ display: 'flex', gap: 8 }}>
            <Chip text={data.houseChip} bg={data.chipHouseBg} />
            <Chip text={data.senateChip} bg={data.chipSenateBg} />
          </div>
        </div>
      </div>

      {/* 飞行的文件 */}
      <div id="paper" style={{ position: 'absolute', top: '28%', left: data.paperX as never, opacity: data.paperOp as never, width: 230, transform: 'translateX(-50%) rotate(-2deg)', transition: 'left 1400ms cubic-bezier(.45,0,.2,1), opacity 400ms',
        background: '#f7f3ea', color: '#1a1a1a', borderRadius: 4, padding: '14px 16px 16px', boxShadow: '0 18px 40px rgba(0,0,0,.6)' }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: '#7a7368' }}>U.S. CONGRESS</div>
        <div style={{ fontSize: 26, fontWeight: 900, marginTop: 4 }}>{data.paperKind as never}</div>
        <div style={{ height: 1, background: '#d8d0c2', margin: '8px 0' }} />
        <div style={{ fontSize: 14, lineHeight: 1.5, color: '#3d3830' }}>{data.paperText as never}</div>
      </div>
      {/* 印章 */}
      <div id="stamp" style={{ position: 'absolute', top: '31%', left: data.stampX as never, opacity: data.stampOp as never, transform: data.stampScale as never,
        transition: 'opacity 200ms ease, transform 360ms cubic-bezier(.2,1.5,.4,1)', border: '6px solid', borderColor: data.stampColor as never, color: data.stampColor as never,
        fontSize: 54, fontWeight: 900, letterSpacing: 8, padding: '2px 20px', borderRadius: 10, background: 'transparent', textShadow: '0 2px 10px rgba(0,0,0,.35)', whiteSpace: 'nowrap' }}>
        {data.stampText as never}
      </div>

      {/* 推翻否决要多少票 */}
      <div id="override" when={ui.override as never} style={{ position: 'absolute', left: '50%', top: '20%', transform: 'translateX(-50%)', width: 640, background: 'rgba(18,25,39,.97)', border: `1px solid ${C.lineStrong}`, borderRadius: 12, padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 24px 60px rgba(0,0,0,.6)' }}>
        <div style={{ fontSize: 22, fontWeight: 900 }}>想推翻否决？两院都要三分之二</div>
        <Bar id="ov_house" label="众议院" have={254} need={290} />
        <Bar id="ov_senate" label="参议院" have={54} need={67} />
        <div style={{ fontSize: 13, color: C.muted }}>民主党席位按 AP 11/7 已宣布数；金线 = 三分之二门槛。</div>
      </div>

      {/* 底部规则条 */}
      <div id="rule" style={{ position: 'absolute', left: 32, right: 32, bottom: 22, background: 'rgba(18,25,39,.94)', borderLeft: `6px solid ${C.gold}`, borderRadius: 6, padding: '14px 20px', fontSize: 24, fontWeight: 850, lineHeight: 1.35 }}>
        {data.rule as never}
      </div>
    </div>
  );
}
