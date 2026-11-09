/**
 * 对峙舞台（开场 + 第三章共用同一块）：左边白宫与特朗普，右边国会大厦（色调由红翻蓝）。
 * - 开场：大标题从“选票上没有他”换成“一夜之间丢掉整个国会”，国会照片和两院标签同时由红翻蓝；
 * - 第三章：一张文件在两边之间飞（法案 → 预算 → 传票 → 提名），落地盖章；
 *   每个印章砸下后，下一步缩小飞进底部的“僵局清单”，章末的总结就是这一排印章。
 * 文件、印章的每个位置写成一段静态 JSX，用同一个 motion 键，Joplo 负责飞。
 */
import { $, eq, type Bind } from '@joplo-app/kit';
import { Photo } from '../art.tsx';
import { C } from '../palette.ts';
import { BOX, at, box } from './layout.ts';

const ui = $.ui as unknown as Record<string, Bind>;

/** 文件停靠的三个位置（区块内坐标）：国会门口、中间、白宫门口。 */
const PAPER = { cap: 800, mid: 500, wh: 320 } as const;
const PAPER_Y = 230;
type Spot = keyof typeof PAPER;

function Paper({ spot }: { spot: Spot }) {
  return (
    <div when={eq(ui.paperAt, spot)} motion="paper" motionMs={1100} enter="shrink" enterMs={500} exit="fade" exitMs={400}
      style={{ ...at(PAPER[spot], PAPER_Y, 250), transform: 'rotate(-2deg)', background: '#f7f3ea', color: '#1a1a1a', borderRadius: 6, padding: '16px 20px 20px', boxShadow: '0 22px 50px rgba(0,0,0,.65)', boxSizing: 'border-box' }}>
      <div style={{ fontSize: 13, letterSpacing: 3, color: '#7a7368' }}>U.S. CONGRESS</div>
      <div style={{ fontSize: 34, fontWeight: 900, marginTop: 4 }}>{ui.paperKind}</div>
      <div style={{ height: 2, background: '#d8d0c2', margin: '10px 0' }} />
      <div style={{ fontSize: 19, lineHeight: 1.5, color: '#3d3830' }}>{ui.paperText}</div>
    </div>
  );
}

/** 一枚印章的两个位置：砸在文件上（大），收进底部清单（小）。 */
const STAMPS = [
  { key: 'veto', text: '否决', color: C.rep, spot: 'wh' as Spot, row: 0, note: '法案：互相卡住' },
  { key: 'shut', text: '停摆', color: C.gold, spot: 'mid' as Spot, row: 1, note: '预算：谈不拢就关门' },
  { key: 'shelve', text: '搁置', color: C.gold, spot: 'cap' as Spot, row: 2, note: '人事：参议院说了算' },
] as const;
const ROW_X = 330;
const ROW_Y = 590;
const ROW_W = 200;

function Stamp({ s }: { s: (typeof STAMPS)[number] }) {
  const state = ui[s.key]!;
  const look = (big: boolean) => ({
    border: `${big ? 7 : 4}px solid ${s.color}`, color: s.color, fontSize: big ? 64 : 34, fontWeight: 900, letterSpacing: big ? 10 : 6,
    padding: big ? '2px 22px' : '0 14px', borderRadius: big ? 12 : 8, background: 'rgba(10,14,22,.55)', whiteSpace: 'nowrap' as const, textAlign: 'center' as const,
  });
  return (
    <>
      <div id={`stamp_${s.key}`} when={eq(state, 'on')} motion={`stamp_${s.key}`} motionMs={900} enter="zoom" enterMs={380} enterDelay={s.key === 'shut' ? 0 : 1000}
        style={{ ...at(PAPER[s.spot] + 6, PAPER_Y + 60), transform: 'rotate(-12deg)', ...look(true) }}>{s.text}</div>
      <div when={eq(state, 'row')} motion={`stamp_${s.key}`} motionMs={900}
        style={{ ...at(ROW_X + s.row * (ROW_W + 20), ROW_Y, ROW_W), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <span style={{ ...look(false), transform: 'rotate(-6deg)' }}>{s.text}</span>
        <span style={{ fontSize: 18, color: C.ink, fontWeight: 700, textShadow: '0 1px 4px #000' }}>{s.note}</span>
      </div>
    </>
  );
}

function Bar({ id, label, have, need }: { id: string; label: string; have: number; need: number }) {
  return (
    <div id={id} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 190px', alignItems: 'center', gap: 16 }}>
      <span style={{ fontSize: 24, fontWeight: 800 }}>{label}</span>
      <div style={{ position: 'relative', height: 22, background: C.none, borderRadius: 11 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(have / need) * 90}%`, background: C.dem, borderRadius: 11 }} />
        <div style={{ position: 'absolute', left: '90%', top: -8, bottom: -8, width: 4, background: C.gold }} />
      </div>
      <span style={{ fontSize: 20, color: C.muted }}><strong style={{ color: C.ink, fontSize: 28 }}>{have}</strong>{` / 需要 ${need}`}</span>
    </div>
  );
}

const fadeL = `linear-gradient(90deg, rgba(10,14,22,.1) 0%, rgba(10,14,22,.55) 60%, ${C.bg} 100%)`;
const fadeR = `linear-gradient(270deg, rgba(10,14,22,.1) 0%, rgba(10,14,22,.55) 60%, ${C.bg} 100%)`;

export function Standoff() {
  return (
    <div id="c_standoff" style={{ ...box(BOX.standoff), borderRadius: 18, background: C.bg }}>
      {/* 左：白宫 + 特朗普 */}
      <div id="sd_wh" style={{ ...at(0, 0, 600, 720), borderRadius: '18px 0 0 18px', overflow: 'hidden' }}>
        <Photo id="wh_photo" name="whitehouse.jpg" tint="#b3261e" pos="center 60%" style={{ ...at(0, 0, 600, 720), opacity: 0.5 }} />
        <div style={{ ...at(0, 0, 600, 720), background: fadeL }} />
      </div>
      {/* 右：国会（色调绑定，红 → 蓝） */}
      <div id="sd_cap" style={{ ...at(640, 0, 600, 720), borderRadius: '0 18px 18px 0', overflow: 'hidden' }}>
        <Photo id="cap_photo" name="capitol.jpg" tint={ui.capTint} pos="center 45%" style={{ ...at(0, 0, 600, 720), opacity: 0.6 }} />
        <div style={{ ...at(0, 0, 600, 720), background: fadeR }} />
      </div>
      <Photo id="sd_trump" name="trump.jpg" pos="center 18%" fade="soft" style={at(0, 290, 330, 430)} />
      <div style={{ ...at(28, 24), display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontSize: 20, color: C.muted, letterSpacing: 3 }}>白宫</span>
        <span style={{ fontSize: 40, fontWeight: 900 }}>特朗普</span>
        <span style={{ background: C.rep, color: '#fff', fontWeight: 800, fontSize: 18, padding: '5px 12px', borderRadius: 4, alignSelf: 'flex-start' }}>共和党 · 任期到 2029 年</span>
      </div>
      <div style={{ position: 'absolute', right: 28, top: 24, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
        <span style={{ fontSize: 20, color: C.muted, letterSpacing: 3 }}>国会</span>
        <span style={{ fontSize: 40, fontWeight: 900 }}>参众两院</span>
        <div id="cap_chips" style={{ display: 'flex', gap: 8 }}>
          {['众议院', '参议院'].map((n, i) => (
            <span style={{ background: ui.chipBg, color: '#fff', fontWeight: 800, fontSize: 18, padding: '5px 12px', borderRadius: 4, transition: `background-color 700ms ease ${i * 250}ms` }}>
              {n}{' · '}{ui.chipParty}
            </span>
          ))}
        </div>
      </div>
      <div style={{ position: 'absolute', right: 12, bottom: 8, fontSize: 11, color: 'rgba(255,255,255,.55)', textAlign: 'right' }}>
        {'白宫照片：DJTechYT / CC BY-SA 4.0 / Wikimedia Commons\n肖像：白宫 / Daniel Torok；国会：Architect of the Capitol（公有领域）'}
      </div>

      {/* 开场大标题：两种说法交叉淡入淡出 */}
      <div id="headline" style={{ ...at(330, 150, 620, 400) }}>
        <div when={eq(ui.head, 'intro')} enter="fade" exit="fade" exitMs={500} style={{ ...at(0, 0, 620), display: 'flex', flexDirection: 'column', gap: 18 }}>
          <span style={{ alignSelf: 'flex-start', background: C.rep, color: '#fff', fontWeight: 900, padding: '5px 14px', borderRadius: 4, fontSize: 22, letterSpacing: 2 }}>2026 美国中期选举 · 11 月 3 日</span>
          <span style={{ fontSize: 76, fontWeight: 900, lineHeight: 1.15, textShadow: '0 4px 24px rgba(0,0,0,.8)', whiteSpace: 'pre-line' }}>{'选票上\n没有他的名字'}</span>
          <span style={{ fontSize: 28, fontWeight: 700, color: C.ink, opacity: 0.85, textShadow: '0 2px 10px #000' }}>但这一票，决定他接下来两年还能做多少事</span>
        </div>
        <div when={eq(ui.head, 'flip')} enter="rise" enterMs={700} enterDelay={250} exit="fade" exitMs={500} style={{ ...at(0, 0, 620), display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontSize: 36, color: C.gold, fontWeight: 900 }}>一夜之间</span>
          <span style={{ fontSize: 76, fontWeight: 900, lineHeight: 1.15, textShadow: '0 4px 24px rgba(0,0,0,.8)' }}>特朗普丢掉了</span>
          <span style={{ alignSelf: 'flex-start', fontSize: 76, fontWeight: 900, lineHeight: 1.2, background: C.dem, color: '#fff', padding: '0 16px', borderRadius: 6 }}>整个国会</span>
          <span style={{ fontSize: 24, fontWeight: 700, color: C.ink, opacity: 0.85, marginTop: 8, textShadow: '0 2px 10px #000' }}>民主党同时夺回众议院和参议院（AP 已宣布）</span>
        </div>
      </div>

      {/* 第三章：分裂政府 */}
      <div when={ui.split} enter="wipe" enterMs={700} style={{ ...at(619, 120, 2, 440), background: `repeating-linear-gradient(${C.ink} 0 10px, transparent 10px 20px)`, opacity: 0.5 }} />
      <div id="split_label" when={ui.split} enter="zoom" enterMs={500} enterDelay={300}
        style={{ ...at(470, 120, 300), textAlign: 'center', fontSize: 28, fontWeight: 900, background: C.gold, color: C.bg, borderRadius: 6, padding: '4px 0' }}>分裂政府</div>
      <div id="sworn" when={ui.sworn} enter="zoom" enterMs={500}
        style={{ ...at(860, 200, 330), textAlign: 'center', border: `3px solid ${C.dem}`, background: 'rgba(29,58,107,.85)', borderRadius: 10, padding: '10px 0' }}>
        <div style={{ fontSize: 20, color: C.ink, opacity: 0.8 }}>新国会宣誓就职</div>
        <div style={{ fontSize: 40, fontWeight: 900 }}>2027 · 1 · 3</div>
      </div>

      <Paper spot="cap" /><Paper spot="mid" /><Paper spot="wh" />
      {STAMPS.map((s) => <Stamp s={s} />)}

      <div id="override" when={ui.override} enter="rise" enterMs={600} exit="fade" exitMs={400}
        style={{ ...at(260, 170, 720), background: 'rgba(18,25,39,.97)', border: `2px solid ${C.lineStrong}`, borderRadius: 14, padding: '26px 30px', display: 'flex', flexDirection: 'column', gap: 20, boxShadow: '0 24px 60px rgba(0,0,0,.6)', boxSizing: 'border-box' }}>
        <div style={{ fontSize: 30, fontWeight: 900 }}>推翻否决：两院都要三分之二</div>
        <Bar id="ov_house" label="众议院" have={254} need={290} />
        <Bar id="ov_senate" label="参议院" have={54} need={67} />
        <div style={{ fontSize: 16, color: C.muted }}>民主党席位按 AP 11/7 已宣布数；金线 = 三分之二门槛</div>
      </div>
    </div>
  );
}
