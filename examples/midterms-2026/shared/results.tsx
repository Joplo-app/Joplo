/**
 * 第二部分的三张图版：
 * - congress：参众两院席位图 + 大号数字（选前 → 结果），底部是全国得票和投票率；
 * - map：参议院 35 场选举的瓦片地图（翻转的州加黑框），右侧三张关键战场卡片，可切到州长翻转图；
 * - why：三个数字解释“为什么”。
 */
import { $, eq, type Bind } from '@joplo-app/kit';
import { Button } from '@joplo-app/kit/ui';
import { AS_OF, GOV_FLIPS, GOV_PENDING, GOV_SOURCE, HOUSE, NATIONAL, RACES, SENATE, SENATE_FLIPS, SENATE_RESULT, WHY } from './data.ts';
import { Frame, Key } from './frame.tsx';
import { Hemicycle, seatColors } from './hemicycle.tsx';
import { C, partyColor } from './palette.ts';
import { TileMap, TILES, mapColors, mapText } from './tilemap.tsx';

const ui = $.ui as unknown as Record<string, Bind>;
const data = $.data as unknown as Record<string, Bind>;

// ---------- 席位颜色与数字 ----------
export const seats = {
  houseBefore: seatColors(435, HOUSE.before),
  houseAfter: seatColors(435, HOUSE.after),
  senateBefore: seatColors(100, SENATE.before),
  senateAfter: seatColors(100, SENATE.after),
};
export const counts = {
  before: { hD: '215', hR: '220', hU: '—', sD: '47', sR: '53', sU: '—' },
  houseAfter: { hD: '254', hR: '162', hU: '19' },
  senateAfter: { sD: '54', sR: '44', sU: '2' },
};

// ---------- 地图 ----------
const RING = `inset 0 0 0 3px ${C.ink}`;
function senateMap() {
  const fill: Record<string, string> = {};
  for (const [k, v] of Object.entries(SENATE_RESULT)) fill[k] = v === 'U' ? C.pending : partyColor(v);
  const ring = Object.fromEntries(Object.keys(TILES).map((k) => [k, SENATE_FLIPS.includes(k) ? RING : 'none']));
  return { fill: mapColors(fill), ink: mapText(fill), ring };
}
function govMap() {
  const fill: Record<string, string> = {};
  for (const k of GOV_FLIPS) fill[k] = C.dem;
  for (const k of GOV_PENDING) fill[k] = C.pending;
  const ring = Object.fromEntries(Object.keys(TILES).map((k) => [k, GOV_FLIPS.includes(k) ? RING : 'none']));
  return { fill: mapColors(fill), ink: mapText(fill), ring };
}
const noRing = Object.fromEntries(Object.keys(TILES).map((k) => [k, 'none']));
export const maps = { blank: { fill: mapColors({}), ink: mapText({}), ring: noRing }, senate: senateMap(), gov: govMap() };

export const resultsState = () => ({
  ui: { resStage: 'before', race: '', mapMode: 'senate' },
  data: {
    rHouse: seats.houseBefore,
    rSenate: seats.senateBefore,
    ...counts.before,
    resTitle: '选前：共和党同时控制两院',
    rMap: maps.blank.fill,
    rMapInk: maps.blank.ink,
    rMapRing: maps.blank.ring,
    mapTitle: '参议院：35 场选举的结果',
    mapSource: SENATE.source,
  },
});

// ---------- congress ----------
function Num({ value, label, color }: { value: Bind; label: string; color: string }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 90 }}>
      <div style={{ fontSize: 44, fontWeight: 850, color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value as never}</div>
      <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>{label}</div>
    </div>
  );
}

function Chamber({ id, name, sub, children, d, u, r }: { id: string; name: string; sub: string; children: unknown; d: Bind; u: Bind; r: Bind }) {
  return (
    <div id={id} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: '16px 20px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ alignSelf: 'stretch', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 20, fontWeight: 800 }}>{name}</span>
        <span style={{ fontSize: 13, color: C.muted }}>{sub}</span>
      </div>
      {children as never}
      <div style={{ display: 'flex', gap: 22, justifyContent: 'center' }}>
        <Num value={d} label="民主党" color={C.dem} />
        <Num value={u} label="未定" color={C.muted} />
        <Num value={r} label="共和党" color={C.rep} />
      </div>
    </div>
  );
}

function Big({ id, value, label }: { id: string; value: string; label: string }) {
  return (
    <div id={id} style={{ flex: 1, borderTop: `3px solid ${C.ink}`, paddingTop: 8 }}>
      <div style={{ fontSize: 28, fontWeight: 850 }}>{value}</div>
      <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{label}</div>
    </div>
  );
}

export function CongressLayer() {
  return (
    <Frame kicker="第二部分 · 结果" title={data.resTitle} source={`${HOUSE.source} ${AS_OF}。`}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 20, alignItems: 'start' }}>
        <Chamber id="c_house" name="众议院" sub="435 席 · 过半数 218" d={data.hD} u={data.hU} r={data.hR}>
          <Hemicycle id="r_house" bind={$.data.rHouse} total={435} rows={12} width={500} majority={218} majorityLabel="中线 = 过半数 218 席" />
        </Chamber>
        <Chamber id="c_senate" name="参议院" sub="100 席 · 过半数 51" d={data.sD} u={data.sU} r={data.sR}>
          <Hemicycle id="r_senate" bind={$.data.rSenate} total={100} rows={6} width={360} majority={51} majorityLabel="中线 = 过半数 51 席" />
        </Chamber>
      </div>
      <div id="national" when={eq(ui.resStage, 'national')} style={{ display: 'flex', gap: 24, marginTop: 18 }}>
        <Big id="n_vote" value={NATIONAL.popularLead} label="全国众议院得票，民主党领先（Cook Political Report）" />
        <Big id="n_turnout" value={NATIONAL.turnout} label={`投票率：${NATIONAL.turnoutNote}`} />
        <Big id="n_gov" value="+5 州" label="民主党从共和党手里拿下的州长席位（另有 2 州未定）" />
      </div>
    </Frame>
  );
}

// ---------- map ----------
function RaceButton({ id, code }: { id: string; code: keyof typeof RACES }) {
  const r = RACES[code];
  return (
    <Button id={id} variant="default" fullWidth style={{ justifyContent: 'space-between', height: 48 }} rightSection="›">
      {`${r.state}（${code}）`}
    </Button>
  );
}

function RaceDetail({ code }: { code: keyof typeof RACES }) {
  const r = RACES[code];
  return (
    <div id={`race_${code}`} when={eq(ui.race, code) as never} style={{ background: C.panel, border: `2px solid ${C.ink}`, borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 12, letterSpacing: 2, color: C.dem, fontWeight: 750 }}>民主党翻转 · 已宣布</div>
      <div style={{ fontSize: 22, fontWeight: 850 }}>{r.state}</div>
      <div style={{ fontSize: 15 }}><strong>胜：</strong>{r.winner}</div>
      <div style={{ fontSize: 15, color: C.muted }}>负：{r.loser}</div>
      <div style={{ fontSize: 26, fontWeight: 850, color: C.dem, marginTop: 2 }}>{r.pct}</div>
      <div style={{ fontSize: 14, color: C.ink, lineHeight: 1.5 }}>{r.note}</div>
    </div>
  );
}

export function MapLayer() {
  return (
    <Frame kicker="第二部分 · 结果" title={data.mapTitle} source={data.mapSource as never}>
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 300px', gap: 28 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, justifyContent: 'center' }}>
          <TileMap id="r_map" fill={$.data.rMap} ink={$.data.rMapInk} ring={$.data.rMapRing} cell={52} gap={5} />
          <div when={eq(ui.mapMode, 'senate') as never} style={{ display: 'flex', gap: 18, justifyContent: 'center' }}>
            <Key color={C.dem} label="民主党胜" />
            <Key color={C.rep} label="共和党胜" />
            <Key color={C.pending} label="仍在计票" />
            <Key color={C.none} label="这次不选" />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.muted }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, boxShadow: RING, display: 'inline-block' }} />白框 = 从共和党翻转
            </span>
          </div>
          <div when={eq(ui.mapMode, 'gov') as never} style={{ display: 'flex', gap: 18, justifyContent: 'center' }}>
            <Key color={C.dem} label="州长由共和党翻转为民主党" />
            <Key color={C.pending} label="仍在计票" />
            <Key color={C.none} label="未易手或这次不选" />
          </div>
        </div>
        <div id="races" style={{ display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'center' }}>
          <div style={{ fontSize: 13, letterSpacing: 2, color: C.muted, fontWeight: 700 }}>关键战场</div>
          <RaceButton id="btn_tx" code="TX" />
          <RaceButton id="btn_me" code="ME" />
          <div style={{ minHeight: 230 }}>
            <RaceDetail code="TX" />
            <RaceDetail code="ME" />
          </div>
        </div>
      </div>
    </Frame>
  );
}

export { GOV_SOURCE };

// ---------- why ----------
function WhyCard({ id, big, small }: { id: string; big: string; small: string }) {
  return (
    <div id={id} style={{ flex: 1, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: '26px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 64, fontWeight: 850, lineHeight: 1, color: C.rep }}>{big}</div>
      <div style={{ fontSize: 17, lineHeight: 1.55 }}>{small}</div>
    </div>
  );
}

export function WhyLayer() {
  return (
    <Frame kicker="第二部分 · 结果" title="选民为什么换人：钱包" source="来源：Ballotpedia 支持率平均（10 月底）；AP VoteCast 选民调查（超过 10 万名选民，误差 ±0.6 个百分点）。">
      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 22, width: '100%' }}>
          <WhyCard id="why_approval" big={WHY.approval} small={WHY.approvalNote} />
          <WhyCard id="why_cost" big={WHY.costOfLiving} small={WHY.costNote} />
          <WhyCard id="why_inflation" big={WHY.inflation} small={WHY.inflationNote} />
        </div>
      </div>
    </Frame>
  );
}

