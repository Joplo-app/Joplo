/**
 * 第一部分的两张图版：
 * - term：总统四年任期的时间轴，中期选举正好在中间；
 * - ballot：左边一张示意选票，右边是“这一票会改选哪些位置”（众议院、参议院、州长地图）。
 *   每勾一项，右边对应的图就亮起来（金色 = 本次改选）。
 */
import { $, eq, oneOf, type Bind } from '@joplo-app/kit';
import { Radio } from '@joplo-app/plugin-ui';
import { Frame, Hl, Key } from './frame.tsx';
import { Hemicycle, blankSeats } from './hemicycle.tsx';
import { C } from './palette.ts';
import { TileMap, mapColors, mapText } from './tilemap.tsx';

const ui = $.ui as unknown as Record<string, Bind>;
const data = $.data as unknown as Record<string, Bind>;

/** 本次改选的州：参议院 33 个常规席位（第 2 类）+ 俄亥俄、佛罗里达两场补选；36 个州长。 */
export const SENATE_RACES = ['AL', 'AK', 'AR', 'CO', 'DE', 'GA', 'ID', 'IL', 'IA', 'KS', 'KY', 'LA', 'ME', 'MA', 'MI', 'MN', 'MS', 'MT', 'NE', 'NH', 'NJ', 'NM', 'NC', 'OK', 'OR', 'RI', 'SC', 'SD', 'TN', 'TX', 'VA', 'WV', 'WY', 'OH', 'FL'];
export const GOV_RACES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'FL', 'GA', 'HI', 'ID', 'IL', 'IA', 'KS', 'ME', 'MD', 'MA', 'MI', 'MN', 'NE', 'NV', 'NH', 'NM', 'NY', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'VT', 'WI', 'WY'];

const UP = C.tossup;
const gold = (codes: string[]) => Object.fromEntries(codes.map((c) => [c, UP]));
export const basicsMap = {
  blank: { fill: mapColors({}), ink: mapText({}) },
  senate: { fill: mapColors(gold(SENATE_RACES)), ink: mapText(gold(SENATE_RACES)) },
  gov: { fill: mapColors(gold(GOV_RACES)), ink: mapText(gold(GOV_RACES)) },
};

/** “本次改选”的席位颜色：众议院全部 435 席；参议院 35 席（含两场补选），其余 65 席不动。 */
const upSeats = (total: number, up: number) => {
  const out: Record<string, string> = {};
  // 改选的席位放在两端，不改选的放中间，看起来像“三分之一换届”
  const half = Math.floor(up / 2);
  for (let i = 0; i < total; i++) out[`s${i}`] = i < half || i >= total - (up - half) ? UP : C.none;
  return out;
};
export const basicsSeats = {
  houseBlank: blankSeats(435),
  houseUp: upSeats(435, 435),
  senateBlank: blankSeats(100),
  senateUp: upSeats(100, 35),
};

export const basicsState = () => ({
  ui: { term: 'start' },
  data: {
    termWidth: '0%',
    bHouseSub: '435 席',
    bSenateSub: '100 席',
    bMapSub: '50 个州',
    bHouse: basicsSeats.houseBlank,
    bSenate: basicsSeats.senateBlank,
    bMap: basicsMap.blank.fill,
    bMapInk: basicsMap.blank.ink,
  },
});

// ---------- 时间轴：四年任期 ----------
// 一条分成四格（每格一年）的任期条；金色进度随步骤推进。标记的圆点压在任期条正中，标题在上方；两侧留出边距，首尾的标题不会被裁掉。
const YEARS = [2025, 2026, 2027, 2028];
const BAR_Y = 150; // 任期条中线距轴顶部的像素
const BAR_H = 14;

/** 任期从 2025 年 1 月 20 日就职到 2029 年 1 月 20 日；按月折算位置。 */
const pos = (year: number, month: number) => ((year - 2025) * 12 + (month - 1)) / 48;

function Marker({ id, at, title, sub, color, when, big }: { id: string; at: number; title: string; sub: string; color: string; when: unknown; big?: boolean }) {
  const W = 240;
  return (
    <div id={id} when={when as never} style={{ position: 'absolute', left: `calc(${at * 100}% - ${W / 2}px)`, top: 0, width: W, height: BAR_Y + 16 }}>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 74, textAlign: 'center' }}>
        <div style={{ fontSize: big ? 30 : 22, fontWeight: 900, color, lineHeight: 1.2 }}>{title}</div>
        <div style={{ fontSize: 14, color: C.muted, marginTop: 4 }}>{sub}</div>
      </div>
      <div style={{ position: 'absolute', left: W / 2 - 1.5, top: BAR_Y - 50, width: 3, height: 38, background: color, opacity: 0.85 }} />
      <div style={{ position: 'absolute', left: W / 2 - 13, top: BAR_Y - 13, width: 26, height: 26, borderRadius: '50%', background: color, border: `5px solid ${C.bg}`, boxShadow: `0 0 0 2px ${color}${big ? `, 0 0 24px ${color}` : ''}` }} />
    </div>
  );
}

export function TermLayer() {
  return (
    <Frame kicker="第一部分 · 什么是中期选举" title={<>总统一届四年，中期选举<Hl tone="red">正好在中间</Hl></>} source="美国宪法：总统任期四年，众议员两年，参议员六年。">
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 130px' }}>
        <div id="term_axis" style={{ position: 'relative', height: BAR_Y + 64 }}>
          {/* 四格任期条 */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: BAR_Y - BAR_H / 2, height: BAR_H, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
            {YEARS.map((y) => <div key={y} style={{ background: C.none, borderRadius: 4 }} />)}
          </div>
          <div id="term_bar" style={{ position: 'absolute', left: 0, top: BAR_Y - BAR_H / 2, height: BAR_H, borderRadius: 4, width: data.termWidth as never, background: `linear-gradient(90deg, ${C.gold}, #ffd34d)`, boxShadow: '0 0 18px rgba(245,179,1,.35)', transition: 'width 1100ms cubic-bezier(.2,.8,.2,1)' }} />
          {YEARS.map((y, i) => (
            <div key={y} style={{ position: 'absolute', left: `${(i / 4) * 100}%`, width: '25%', top: BAR_Y + 18, textAlign: 'center', fontSize: 16, fontWeight: 700, color: C.muted }}>{`${y}`}</div>
          ))}
          <Marker id="m_inaug" at={pos(2025, 1.65)} title="就职" sub="2025 年 1 月 20 日" color={C.ink} when={oneOf(ui.term, ['start', 'mid', 'next'])} />
          <Marker id="m_mid" at={pos(2026, 11.1)} title="中期选举" sub="2026 年 11 月 3 日" color={C.rep} when={oneOf(ui.term, ['mid', 'next'])} big />
          <Marker id="m_next" at={pos(2028, 11.1)} title="下次大选" sub="2028 年 11 月" color={C.muted} when={eq(ui.term, 'next')} />
        </div>
        <div id="term_note" when={oneOf(ui.term, ['mid', 'next'])} style={{ marginTop: 44, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          <Fact id="f_two" big="2 年" small="众议员任期，所以每两年全部重选" color={C.dem} />
          <Fact id="f_six" big="6 年" small="参议员任期，每两年改选约三分之一" color={C.dem} />
          <Fact id="f_pres" big="不在选票上" small="总统本人这次不参选" color={C.rep} />
        </div>
      </div>
    </Frame>
  );
}

function Fact({ id, big, small, color }: { id: string; big: string; small: string; color: string }) {
  return (
    <div id={id} style={{ background: C.panel, border: `1px solid ${C.line}`, borderTop: `4px solid ${color}`, borderRadius: 8, padding: '14px 18px' }}>
      <div style={{ fontSize: 30, fontWeight: 900, color }}>{big}</div>
      <div style={{ fontSize: 15, color: C.ink, marginTop: 6, lineHeight: 1.5 }}>{small}</div>
    </div>
  );
}

// ---------- 选票：勾一项，右边亮一块 ----------
function Race({ id, office, note, value }: { id: string; office: string; note: string; value: Bind }) {
  return (
    <div style={{ borderTop: `1px solid ${C.line}`, padding: '12px 0 10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 16, fontWeight: 750 }}>{office}</span>
        <span style={{ fontSize: 12, color: C.muted }}>{note}</span>
      </div>
      <Radio.Group id={id} value={value} style={{ marginTop: 6 }}>
        <Radio value="D" label="候选人甲（民主党）" />
        <Radio value="R" label="候选人乙（共和党）" />
      </Radio.Group>
    </div>
  );
}

function Panel({ id, title, sub, children }: { id: string; title: string; sub: Bind | string; children: unknown }) {
  return (
    <div id={id} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 16, fontWeight: 750 }}>{title}</span>
        <span style={{ fontSize: 13, color: C.muted }}>{sub as never}</span>
      </div>
      {children as never}
    </div>
  );
}

export function BallotLayer() {
  return (
    <Frame kicker="第一部分 · 什么是中期选举" title="一张选票，同时改写国会和各州" source="示意选票：各州选票格式不同；候选人为示意。参议院 35 席含俄亥俄、佛罗里达两场补选。">
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '340px 1fr', gap: 28 }}>
        <div id="ballot" style={{ background: C.panel, border: `2px solid ${C.ink}`, borderRadius: 4, padding: '14px 20px', boxShadow: '0 8px 24px rgba(20,20,20,.08)', alignSelf: 'start' }}>
          <div style={{ fontSize: 12, letterSpacing: 2, color: C.muted }}>OFFICIAL BALLOT · 示意</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>2026 年 11 月 3 日 大选</div>
          <div style={{ fontSize: 12, color: C.muted, margin: '4px 0 6px' }}>每项选 1 人，涂满圆圈</div>
          <Race id="b_house" office="联邦众议员" note="本选区 · 任期 2 年" value={$.inputs.b_house} />
          <Race id="b_senate" office="联邦参议员" note="本州 · 任期 6 年" value={$.inputs.b_senate} />
          <Race id="b_gov" office="州长" note="本州 · 任期 4 年" value={$.inputs.b_gov} />
          <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 10, fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
            {'州议会、市长、法官、地方公投……\n下面还有很长'}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: 'auto 1fr', gap: 16, minHeight: 0 }}>
          <Panel id="p_house" title="众议院" sub={data.bHouseSub}>
            <Hemicycle id="b_house_chart" bind={$.data.bHouse} total={435} rows={11} width={330} />
          </Panel>
          <Panel id="p_senate" title="参议院" sub={data.bSenateSub}>
            <Hemicycle id="b_senate_chart" bind={$.data.bSenate} total={100} rows={5} width={330} />
          </Panel>
          <div id="p_gov" style={{ gridColumn: '1 / span 2', background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 16, fontWeight: 750 }}>各州</span>
              <span style={{ fontSize: 13, color: C.muted }}>{data.bMapSub as never}</span>
            </div>
            <TileMap id="b_map" fill={$.data.bMap} ink={$.data.bMapInk} cell={30} gap={3} />
            <div style={{ display: 'flex', gap: 18, justifyContent: 'center' }}>
              <Key color={UP} label="本次改选" />
              <Key color={C.none} label="这次不选" />
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}
