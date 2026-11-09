/**
 * 第四部分：AI 和股市。
 * - market：三个交易日逐日涨跌（条形随日期切换）+ 恐慌指数 VIX 大数字；
 * - ai：AI 相关个股周涨跌（云巨头 vs 芯片/算力）+ “数据中心选举”的两个数字。
 * 颜色按中文习惯：红涨绿跌。
 */
import { $, eq, type Bind } from '@joplo-app/kit';
import { DivergingBars, barValues, emptyBars, type BarRow } from './bars.tsx';
import { Frame, Hl } from './frame.tsx';
import { C } from './palette.ts';

const ui = $.ui as unknown as Record<string, Bind>;
const data = $.data as unknown as Record<string, Bind>;

const UP = '#ef4444';
const DOWN = '#22c55e';
const cn = (_id: string, v: number) => (v >= 0 ? UP : DOWN);
const pct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;

// ---------- 指数：逐日（TheStreet / CNBC 收盘数据） ----------
export const INDEX_ROWS: BarRow[] = [
  { id: 'dow', label: '道琼斯', sub: '30 家大公司' },
  { id: 'spx', label: '标普 500', sub: '美股大盘' },
  { id: 'ndx', label: '纳斯达克', sub: '科技股为主' },
  { id: 'sox', label: '费城半导体', sub: '芯片股' },
];
const DAYS = {
  d1: { dow: 3.03, spx: 1.58, ndx: 1.44, sox: -3.1 },
  d2: { dow: -3.44, spx: -4.36, ndx: -5.52, sox: -12.3 },
  d3: { dow: -0.46, spx: 0.31, ndx: 1.09, sox: 4.2 },
};
export const indexBars = {
  empty: emptyBars(INDEX_ROWS),
  d1: barValues(DAYS.d1, 13, pct, cn),
  d2: barValues(DAYS.d2, 13, pct, cn),
  d3: barValues(DAYS.d3, 13, pct, cn),
};
export const VIX = { d0: '—', d1: '16.6', d2: '28.2', d3: '25.6' };

// ---------- AI 个股：周涨跌（10/30 → 11/6，The Glass Desk 周报汇总） ----------
export const AI_ROWS: BarRow[] = [
  { id: 'amzn', label: '亚马逊', sub: '云' },
  { id: 'googl', label: 'Alphabet', sub: '云' },
  { id: 'msft', label: '微软', sub: '云' },
  { id: 'meta', label: 'Meta', sub: '应用' },
  { id: 'nvda', label: '英伟达', sub: '芯片' },
  { id: 'avgo', label: '博通', sub: '芯片' },
  { id: 'amd', label: 'AMD', sub: '芯片' },
  { id: 'orcl', label: '甲骨文', sub: '算力租赁' },
  { id: 'pltr', label: 'Palantir', sub: 'AI 软件' },
  { id: 'mu', label: '美光', sub: '存储芯片' },
];
const AI_WEEK = { amzn: 7.88, googl: 1.77, msft: 1.67, meta: -0.79, nvda: -8.8, avgo: -9.93, amd: -11.05, orcl: -11.15, pltr: -12.89, mu: -22.01 };
export const aiBars = { empty: emptyBars(AI_ROWS), week: barValues(AI_WEEK, 24, pct, cn) };

export const marketState = () => ({
  ui: { day: 'd0', aiWhy: false },
  data: { idx: indexBars.empty, vix: VIX.d0, vixColor: C.muted, ai: aiBars.empty, mkTitle: '选后第一天：分裂政府，利好？' },
});

function Day({ id, k, date, sub }: { id: string; k: string; date: string; sub: string }) {
  return (
    <div id={id} style={{ flex: 1, borderRadius: 6, padding: '8px 12px', border: `1px solid ${C.line}`, background: C.panel, opacity: 1 }}>
      <div style={{ fontSize: 18, fontWeight: 850 }}>{date}</div>
      <div style={{ fontSize: 13, color: C.muted }}>{sub}</div>
      <div when={eq(ui.day, k) as never} style={{ height: 3, background: C.gold, marginTop: 6, borderRadius: 2 }} />
    </div>
  );
}

export function MarketLayer() {
  return (
    <Frame kicker="第四部分 · AI 和股市" title={data.mkTitle} source="来源：TheStreet、CNBC 收盘数据（11/4–11/6）；VIX 为收盘值。红涨绿跌。">
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 300px', gap: 28 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, justifyContent: 'center' }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <Day id="day1" k="d1" date="11/4 周三" sub="结果出炉后第一天" />
            <Day id="day2" k="d2" date="11/5 周四" sub="风向突变" />
            <Day id="day3" k="d3" date="11/6 周五" sub="小幅反弹" />
          </div>
          <DivergingBars id="idx" rows={INDEX_ROWS} bind={$.data.idx} labelWidth={130} rowHeight={54} />
        </div>
        <div id="vix" style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: '22px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
          <div style={{ fontSize: 14, color: C.muted, letterSpacing: 1 }}>恐慌指数 VIX</div>
          <div style={{ fontSize: 84, fontWeight: 900, lineHeight: 1, color: data.vixColor as never, transition: 'color 600ms', fontVariantNumeric: 'tabular-nums' }}>{data.vix as never}</div>
          <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.6 }}>{'数字越高，市场越害怕。\n20 以下算平静，30 附近就是明显恐慌。'}</div>
        </div>
      </div>
    </Frame>
  );
}

function BigFact({ id, big, text }: { id: string; big: string; text: string }) {
  return (
    <div id={id} style={{ borderLeft: `4px solid ${C.gold}`, paddingLeft: 14 }}>
      <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 1.05, color: C.gold }}>{big}</div>
      <div style={{ fontSize: 15, lineHeight: 1.55, marginTop: 6 }}>{text}</div>
    </div>
  );
}

export function AiLayer() {
  return (
    <Frame kicker="第四部分 · AI 和股市" title={<>AI 股：<Hl tone="red">云巨头涨，</Hl><Hl tone="gold">卖铲子的跌</Hl></>} source="个股为 10/30→11/6 周涨跌（The Glass Desk 周报汇总）；公投统计：Ballotpedia（经《科学美国人》）；高盛估计经 NBC 引述。红涨绿跌。">
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 330px', gap: 30 }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <DivergingBars id="ai_bars" rows={AI_ROWS} bind={$.data.ai} labelWidth={120} rowHeight={40} />
        </div>
        <div id="ai_why" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 26 }}>
          <div style={{ fontSize: 15, color: C.muted, letterSpacing: 1 }}>为什么？这是一场“数据中心选举”</div>
          <BigFact id="f_vote" big="40 / 41" text="地方数据中心公投，40 项站在限制一边" />
          <BigFact id="f_gs" big="约 45%" text="美国计划新增的数据中心容量，可能受各州暂停令影响（高盛估计）" />
          <BigFact id="f_tx" big="得州" text="新州长承诺先暂停审批数据中心，得州约占全美计划容量的四分之一" />
        </div>
      </div>
    </Frame>
  );
}
