/**
 * 中间一排是全片的主角，三章都会回来：
 * - ballot：一张示意选票，勾一项，右边对应的席位 / 地图亮起来；
 * - congress：参众两院席位图。第一章亮金色（改选），第二章由红翻蓝，第三章抽出 39 席飞去历史图；
 * - map：瓦片地图。第一章标改选的州，第二章显示翻转，第四章回到得州讲数据中心。
 */
import { $, eq, notEmpty, oneOf, type Bind } from '@joplo-app/kit';
import { Button, Radio } from '@joplo-app/plugin-ui';
import { NATIONAL, RACES } from '../data.ts';
import { C } from '../palette.ts';
import { TileMap } from '../tilemap.tsx';
import { BOX, at, box } from './layout.ts';
import { Seats } from './seats.tsx';

const ui = $.ui as unknown as Record<string, Bind>;

/** 共和党确定丢掉的 39 席在众议院席位图里的位置：选后民主党从左数到 254 席，原来的 215 席之后那 39 个点。 */
export const LOST = { from: 215, to: 253 };

// ---------- 选票 ----------
function Race({ id, office, note, value, target }: { id: string; office: string; note: string; value: Bind; target: string }) {
  return (
    <div id={`row_${id}`} style={{ borderTop: `1px solid ${C.line}`, padding: '16px 0 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 26, fontWeight: 800 }}>{office}</span>
        <span style={{ fontSize: 18, color: C.muted }}>{note}</span>
      </div>
      <Radio.Group id={id} value={value} style={{ marginTop: 10, zoom: 1.45 }}>
        <Radio value="D" label="候选人甲（民主党）" />
        <Radio value="R" label="候选人乙（共和党）" />
      </Radio.Group>
      <div when={notEmpty(value)} enter="wipe" enterMs={500} style={{ marginTop: 8, fontSize: 20, fontWeight: 800, color: C.gold }}>{`→ ${target}`}</div>
    </div>
  );
}

export function Ballot() {
  return (
    <div id="c_ballot" style={{ ...box(BOX.ballot) }}>
      <div id="ballot" style={{ background: C.panel, border: `2px solid ${C.ink}`, borderRadius: 6, padding: '20px 28px', boxShadow: '0 20px 50px rgba(0,0,0,.45)', transform: 'rotate(-1.2deg)' }}>
        <div style={{ fontSize: 16, letterSpacing: 3, color: C.muted }}>OFFICIAL BALLOT · 示意</div>
        <div style={{ fontSize: 30, fontWeight: 900, marginTop: 4 }}>2026 年 11 月 3 日 大选</div>
        <div style={{ fontSize: 18, color: C.muted, margin: '6px 0 8px' }}>每项选 1 人，涂满圆圈 · 候选人为示意</div>
        <Race id="b_house" office="联邦众议员" note="任期 2 年" value={$.inputs.b_house} target="众议院 435 席" />
        <Race id="b_senate" office="联邦参议员" note="任期 6 年" value={$.inputs.b_senate} target="参议院 35 席" />
        <Race id="b_gov" office="州长" note="任期 4 年" value={$.inputs.b_gov} target="36 个州长" />
        <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 12, fontSize: 18, color: C.muted }}>州议会、市长、法官、地方公投……下面还有很长</div>
      </div>
    </div>
  );
}

// ---------- 席位 ----------
function Count({ value, label, color }: { value: Bind; label: string; color: string }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 110 }}>
      <div style={{ fontSize: 60, fontWeight: 900, color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 20, color: C.muted, marginTop: 6 }}>{label}</div>
    </div>
  );
}

function Chamber({ id, name, sub, up, mode, d, u, r, children, w }: { id: string; name: string; sub: string; up: string; mode: Bind; d: Bind; u: Bind; r: Bind; children: unknown; w: number }) {
  return (
    <div id={id} style={{ width: w, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: '18px 24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, boxSizing: 'border-box' }}>
      <div style={{ alignSelf: 'stretch', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 34, fontWeight: 900 }}>{name}</span>
        <span style={{ fontSize: 20, color: C.muted }}>{sub}</span>
      </div>
      {children as never}
      <div style={{ position: 'relative', alignSelf: 'stretch', height: 92 }}>
        <div when={eq(mode, 'up')} enter="rise" exit="fade" exitMs={300} style={{ ...at(0, 14), right: 0, textAlign: 'center', fontSize: 38, fontWeight: 900, color: C.gold }}>{up}</div>
        <div when={eq(mode, 'result')} enter="rise" enterDelay={200} style={{ ...at(0, 0), right: 0, display: 'flex', justifyContent: 'center', gap: 24 }}>
          <Count value={d} label="民主党" color={C.dem} />
          <Count value={u} label="未定" color={C.muted} />
          <Count value={r} label="共和党" color={C.rep} />
        </div>
      </div>
    </div>
  );
}

function Big({ id, value, label, delay }: { id: string; value: string; label: string; delay: number }) {
  return (
    <div id={id} when={ui.national} enter="rise" enterMs={600} enterDelay={delay} style={{ flex: 1, borderTop: `4px solid ${C.ink}`, paddingTop: 10 }}>
      <div style={{ fontSize: 44, fontWeight: 900 }}>{value}</div>
      <div style={{ fontSize: 19, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>{label}</div>
    </div>
  );
}

export function Congress() {
  return (
    <div id="c_congress" style={{ ...box(BOX.congress) }}>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <Chamber id="h_panel" name="众议院" sub="435 席 · 过半数 218" up="435 席全部改选" mode={ui.cgH} d={ui.hD} u={ui.hU} r={ui.hR} w={790}>
          <Seats id="house_chart" bind={$.data.house} total={435} rows={12} width={640} lift={{ ...LOST, when: eq(ui.lost, 'glow') }} />
        </Chamber>
        <Chamber id="s_panel" name="参议院" sub="100 席 · 过半数 51" up="只改选 35 席" mode={ui.cgS} d={ui.sD} u={ui.sU} r={ui.sR} w={486}>
          <Seats id="senate_chart" bind={$.data.senate} total={100} rows={6} width={420} />
        </Chamber>
      </div>
      <div id="national" style={{ ...at(0, 580, 1300), display: 'flex', gap: 30 }}>
        <Big id="n_vote" value={NATIONAL.popularLead} label="全国众议院得票：民主党领先（Cook Political Report）" delay={0} />
        <Big id="n_turnout" value={NATIONAL.turnout} label={`投票率：${NATIONAL.turnoutNote}`} delay={350} />
        <Big id="n_gov" value="+5 州" label="民主党从共和党手里拿下的州长（另有 2 州未定）" delay={700} />
      </div>
    </div>
  );
}

// ---------- 地图 ----------
const RING = `inset 0 0 0 4px ${C.ink}`;
function Key({ color, label, ring }: { color: string; label: string; ring?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 19, color: C.muted }}>
      <span style={{ width: 18, height: 18, borderRadius: 4, background: color, boxShadow: ring ? RING : undefined, display: 'inline-block' }} />{label}
    </span>
  );
}

function RaceCard({ code }: { code: keyof typeof RACES }) {
  const r = RACES[code];
  return (
    <div id={`race_${code}`} when={eq(ui.race, code)} enter="rise" enterMs={500} exit="fade" exitMs={300}
      style={{ ...at(0, 140, 330), background: C.panel, border: `2px solid ${C.dem}`, borderRadius: 12, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 8, boxSizing: 'border-box' }}>
      <div style={{ fontSize: 17, letterSpacing: 2, color: C.dem, fontWeight: 800 }}>由红翻蓝 · 已宣布</div>
      <div style={{ fontSize: 34, fontWeight: 900 }}>{r.state}</div>
      <div style={{ fontSize: 20 }}>{`胜：${r.winner}`}</div>
      <div style={{ fontSize: 20, color: C.muted }}>{`负：${r.loser}`}</div>
      <div style={{ fontSize: 36, fontWeight: 900, color: C.dem }}>{r.pct}</div>
      <div style={{ fontSize: 20, lineHeight: 1.45 }}>{r.note}</div>
    </div>
  );
}

function DcFact({ id, big, text, delay }: { id: string; big: string; text: string; delay: number }) {
  return (
    <div id={id} when={eq(ui.mapSide, 'dc')} enter="rise" enterMs={600} enterDelay={delay} style={{ borderLeft: `5px solid ${C.gold}`, paddingLeft: 16 }}>
      <div style={{ fontSize: 50, fontWeight: 900, lineHeight: 1.05, color: C.gold }}>{big}</div>
      <div style={{ fontSize: 20, lineHeight: 1.45, marginTop: 6 }}>{text}</div>
    </div>
  );
}

export function MapBlock() {
  return (
    <div id="c_map" style={{ ...box(BOX.map) }}>
      <div style={{ ...at(0, 0, 800), fontSize: 30, fontWeight: 900 }}>{ui.mapTitle}</div>
      <div style={{ ...at(0, 60) }}>
        <TileMap id="r_map" fill={$.data.mapFill} ink={$.data.mapInk} ring={$.data.mapRing} cell={62} gap={5} />
      </div>
      <div style={{ ...at(0, 630, 800), display: 'flex', gap: 22, justifyContent: 'center', flexWrap: 'wrap' }}>
        <span when={oneOf(ui.mapMode, ['upSenate', 'upGov'])} style={{ display: 'flex', gap: 22 }}><Key color={C.gold} label="本次改选" /><Key color={C.none} label="这次不选" /></span>
        <span when={eq(ui.mapMode, 'senate')} style={{ display: 'flex', gap: 22 }}><Key color={C.dem} label="民主党胜" /><Key color={C.rep} label="共和党胜" /><Key color={C.pending} label="仍在计票" /><Key color={C.none} label="白框 = 由红翻蓝" ring /></span>
        <span when={eq(ui.mapMode, 'gov')} style={{ display: 'flex', gap: 22 }}><Key color={C.dem} label="州长由红翻蓝" ring /><Key color={C.pending} label="仍在计票" /><Key color={C.none} label="未易手或不选" /></span>
      </div>
      <div id="map_side" style={{ ...at(830, 60, 330, 600) }}>
        <div when={eq(ui.mapSide, 'up')} enter="rise" exit="fade" exitMs={300} style={{ ...at(0, 160, 330), display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 110, fontWeight: 900, color: C.gold, lineHeight: 1 }}>{ui.mapBig}</span>
          <span style={{ fontSize: 26, fontWeight: 800 }}>{ui.mapBigSub}</span>
        </div>
        <div when={eq(ui.mapSide, 'races')} enter="fade" exit="fade" exitMs={300} style={{ ...at(0, 0, 330), display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontSize: 18, letterSpacing: 2, color: C.muted, fontWeight: 800 }}>关键战场 · 点开看看</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button id="btn_tx" variant="default" style={{ flex: 1, height: 52, fontSize: 20 }}>得克萨斯 ›</Button>
            <Button id="btn_me" variant="default" style={{ flex: 1, height: 52, fontSize: 20 }}>缅因 ›</Button>
          </div>
        </div>
        <RaceCard code="TX" />
        <RaceCard code="ME" />
        <div style={{ ...at(0, 20, 330), display: 'flex', flexDirection: 'column', gap: 30 }}>
          <span when={eq(ui.mapSide, 'dc')} enter="fade" style={{ fontSize: 22, color: C.muted, fontWeight: 800 }}>一场“数据中心选举”</span>
          <DcFact id="f_vote" big="40 / 41" text="地方数据中心公投，40 项站在限制一边" delay={0} />
          <DcFact id="f_gs" big="约 45%" text="计划新增的数据中心容量，可能受各州暂停令影响（高盛估计）" delay={500} />
          <DcFact id="f_tx" big="得州" text="新州长承诺先暂停审批；得州约占全美计划容量的 1/4" delay={1000} />
        </div>
      </div>
    </div>
  );
}
