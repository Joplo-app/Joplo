/**
 * 上排的两块：
 * - term：四年任期条，金色进度推进到一半，就是中期选举；
 * - why：三个数字各带一根按比例的条（从 0 开始），用 wipe 从左往右“长”出来。
 */
import { $, eq, oneOf, type Bind } from '@joplo-app/kit';
import { WHY } from '../data.ts';
import { C } from '../palette.ts';
import { BOX, at, box } from './layout.ts';

const ui = $.ui as unknown as Record<string, Bind>;

// ---------- 任期 ----------
const YEARS = [2025, 2026, 2027, 2028];
const BAR_Y = 260;
const BAR_H = 22;
const AXIS_W = 960;
/** 任期从 2025 年 1 月 20 日到 2029 年 1 月 20 日，按月折算位置。 */
const pos = (year: number, month: number) => ((year - 2025) * 12 + (month - 1)) / 48;

function Marker({ id, at: p, title, sub, color, when, big }: { id: string; at: number; title: string; sub: string; color: string; when: unknown; big?: boolean }) {
  const W = 300;
  return (
    <div id={id} when={when as never} enter="rise" enterMs={600} style={{ ...at(p * AXIS_W - W / 2, 0, W, BAR_Y + 20) }}>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 100, textAlign: 'center' }}>
        <div style={{ fontSize: big ? 46 : 32, fontWeight: 900, color, lineHeight: 1.15 }}>{title}</div>
        <div style={{ fontSize: 20, color: C.muted, marginTop: 6 }}>{sub}</div>
      </div>
      <div style={{ position: 'absolute', left: W / 2 - 2, top: BAR_Y - 66, width: 4, height: 50, background: color, opacity: 0.85 }} />
      <div style={{ position: 'absolute', left: W / 2 - 17, top: BAR_Y - 17, width: 34, height: 34, borderRadius: '50%', background: color, border: `6px solid ${C.bg}`, boxSizing: 'border-box', boxShadow: `0 0 0 3px ${color}${big ? `, 0 0 30px ${color}` : ''}` }} />
    </div>
  );
}

function Fact({ id, big, small, color, delay }: { id: string; big: string; small: string; color: string; delay: number }) {
  return (
    <div id={id} when={oneOf(ui.term, ['mid', 'next'])} enter="rise" enterMs={600} enterDelay={delay}
      style={{ flex: 1, background: C.panel, border: `1px solid ${C.line}`, borderTop: `5px solid ${color}`, borderRadius: 10, padding: '16px 20px' }}>
      <div style={{ fontSize: 40, fontWeight: 900, color }}>{big}</div>
      <div style={{ fontSize: 21, color: C.ink, marginTop: 6, lineHeight: 1.45 }}>{small}</div>
    </div>
  );
}

export function Term() {
  return (
    <div id="c_term" style={{ ...box(BOX.term) }}>
      <div style={{ ...at(0, 0), fontSize: 26, fontWeight: 800, color: C.muted, letterSpacing: 2 }}>总统任期 · 四年</div>
      <div id="term_axis" style={{ ...at(100, 40, AXIS_W, BAR_Y + 60) }}>
        <div style={{ ...at(0, BAR_Y - BAR_H / 2, AXIS_W, BAR_H), display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {YEARS.map(() => <div style={{ background: C.none, borderRadius: 6 }} />)}
        </div>
        <div id="term_bar" style={{ ...at(0, BAR_Y - BAR_H / 2, undefined, BAR_H), width: ui.termW, borderRadius: 6, background: `linear-gradient(90deg, ${C.gold}, #ffd34d)`, boxShadow: '0 0 22px rgba(245,179,1,.4)', transition: 'width 1300ms cubic-bezier(.3,.7,.2,1)' }} />
        {YEARS.map((y, i) => (
          <div style={{ ...at((i / 4) * AXIS_W, BAR_Y + 24, AXIS_W / 4), textAlign: 'center', fontSize: 22, fontWeight: 700, color: C.muted }}>{`${y}`}</div>
        ))}
        <Marker id="m_inaug" at={pos(2025, 1.65)} title="就职" sub="2025 年 1 月 20 日" color={C.ink} when={oneOf(ui.term, ['start', 'mid', 'next'])} />
        <Marker id="m_mid" at={pos(2026, 11.1)} title="中期选举" sub="2026 年 11 月 3 日" color={C.rep} when={oneOf(ui.term, ['mid', 'next'])} big />
        <Marker id="m_next" at={pos(2028, 11.1)} title="下次大选" sub="2028 年 11 月" color={C.muted} when={eq(ui.term, 'next')} />
      </div>
      <div id="term_facts" style={{ ...at(40, 420, 1080), display: 'flex', gap: 22 }}>
        <Fact id="f_two" big="2 年" small="众议员任期：每两年全部重选" color={C.dem} delay={0} />
        <Fact id="f_six" big="6 年" small="参议员任期：每两年改选约 1/3" color={C.dem} delay={200} />
        <Fact id="f_pres" big="不在票上" small="总统本人这次不参选" color={C.rep} delay={400} />
      </div>
    </div>
  );
}

// ---------- 原因 ----------
const ROWS = [
  { id: 'why_approval', big: WHY.approval, share: 0.38, note: '特朗普选前支持率（Ballotpedia 10 月底平均）' },
  { id: 'why_cost', big: WHY.costOfLiving, share: 0.9, note: '选民说生活成本是关键或主要因素（AP VoteCast）' },
  { id: 'why_inflation', big: WHY.inflation, share: 2 / 3, note: '选民认为特朗普的政策推高了通胀（AP VoteCast）' },
];

export function Why() {
  return (
    <div id="c_why" style={{ ...box(BOX.why) }}>
      <div style={{ ...at(0, 0), fontSize: 26, fontWeight: 800, color: C.muted, letterSpacing: 2 }}>选民为什么换人</div>
      <div style={{ ...at(0, 70, 1160), display: 'flex', flexDirection: 'column', gap: 34 }}>
        {ROWS.map((r, i) => (
          <div id={r.id} style={{ display: 'grid', gridTemplateColumns: '300px 1fr', alignItems: 'center', gap: 28, height: 140 }}>
            <div when={ui.why} enter="rise" enterMs={600} enterDelay={i * 700} style={{ fontSize: 72, fontWeight: 900, color: C.rep, lineHeight: 1, textAlign: 'right', whiteSpace: 'nowrap' }}>{r.big}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ position: 'relative', height: 34, background: C.none, borderRadius: 6 }}>
                <div when={ui.why} enter="wipe" enterMs={900} enterDelay={i * 700 + 150} style={{ ...at(0, 0, undefined, 34), width: `${r.share * 100}%`, background: `linear-gradient(90deg, ${C.repLight}, ${C.rep})`, borderRadius: 6 }} />
              </div>
              <div when={ui.why} enter="fade" enterDelay={i * 700 + 400} style={{ fontSize: 24, color: C.ink, lineHeight: 1.4 }}>{r.note}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
