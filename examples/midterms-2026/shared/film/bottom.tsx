/**
 * 下排三块：
 * - history：1946 年以来执政党在中期选举的众议院增减。2026 那一根不是画出来的，是从席位图里飞过来的 39 个点；
 * - market：选后三个交易日，四个指数的涨跌条逐日伸缩，旁边是恐慌指数；
 * - ai：十只 AI 股先排成一列，再分成“有算力的云巨头”和“卖芯片、租算力的”两堆（同一行用同一个 motion 键，分堆时飞过去）。
 * 股市颜色按中文习惯：红涨绿跌。
 */
import { $, eq, oneOf, type Bind } from '@joplo-app/kit';
import { Photo } from '../art.tsx';
import { barValues, emptyBars, type BarRow } from '../bars.tsx';
import { HISTORY, HISTORY_2026 } from '../data.ts';
import { INDEX_ROWS } from '../market.tsx';
import { C, partyColor } from '../palette.ts';
import { BOX, at, box } from './layout.ts';
import { LOST } from './middle.tsx';
import { LostColumn } from './seats.tsx';

const ui = $.ui as unknown as Record<string, Bind>;
const data = $.data as unknown as Record<string, Bind>;

// ---------- 历史 ----------
const PX = 5; // 每席 5 像素：2026 那一根是 3 列 × 13 行的点，每行 15 像素 = 3 席
const ZERO = 64;
const SLOT = BOX.history.w / (HISTORY.length + 1);
type Col = { h: string; top: string; op: number };
const col = (v: number, show: boolean): Col =>
  show ? { h: `${Math.abs(v) * PX}px`, top: v >= 0 ? `${ZERO - v * PX}px` : `${ZERO}px`, op: 1 } : { h: '0px', top: `${ZERO}px`, op: 0 };
export const histCols = (show: boolean) => Object.fromEntries(HISTORY.map((r) => [`y${r.year}`, col(r.house, show)]));
const LOST_N = LOST.to - LOST.from + 1;

export function History() {
  const h = data.hist as unknown as Record<string, Record<string, Bind>>;
  const all = [...HISTORY, HISTORY_2026];
  return (
    <div id="c_history" style={{ ...box(BOX.history) }}>
      <div style={{ ...at(0, 0, 1160), fontSize: 26, fontWeight: 800, color: C.muted, letterSpacing: 1 }}>1946 年以来：总统所在党在中期选举里，众议院席位的增减</div>
      <div id="hist_chart" style={{ ...at(0, 70, 1160, 540) }}>
        <div style={{ ...at(0, ZERO, 1160, 3), background: C.lineStrong }} />
        <div id="avg_line" when={ui.avg} enter="wipe" enterMs={1100} style={{ ...at(0, ZERO + 26 * PX, 1160), borderTop: `3px dashed ${C.gold}` }} />
        <div when={ui.avg} enter="fade" enterDelay={900} style={{ ...at(4, ZERO + 26 * PX - 34, 280), fontSize: 22, color: C.gold, fontWeight: 900, textShadow: '0 1px 6px #000' }}>平均：丢 26 席</div>
        {all.map((r, i) => {
          const is26 = r.year === 2026;
          const k = `y${r.year}`;
          const x = i * SLOT;
          return (
            <div id={`col_${r.year}`} style={{ ...at(x, 0, SLOT, 540) }}>
              {is26 ? (
                <div style={{ ...at((SLOT - 42) / 2, ZERO + 3, 42, LOST_N * PX) }}>
                  <LostColumn count={LOST_N} when={eq(ui.lost, 'hist')} dot={12} gap={3} />
                </div>
              ) : (
                <div style={{ position: 'absolute', left: '16%', right: '16%', top: h[k]!.top, height: h[k]!.h, opacity: h[k]!.op as never, background: partyColor(r.party), borderRadius: 4,
                  transition: `height 800ms cubic-bezier(.2,.8,.2,1) ${i * 70}ms, top 800ms cubic-bezier(.2,.8,.2,1) ${i * 70}ms, opacity 300ms ${i * 70}ms` }} />
              )}
              {is26 ? (
                <div when={eq(ui.lost, 'hist')} enter="fade" enterDelay={1400} style={{ ...at(-20, ZERO + LOST_N * PX + 10, SLOT + 40), textAlign: 'center', fontSize: 20, fontWeight: 900, color: C.gold }}>至少 −39</div>
              ) : (
                <div style={{ ...at(0, r.house >= 0 ? ZERO - r.house * PX - 26 : ZERO + Math.abs(r.house) * PX + 6, SLOT), textAlign: 'center', fontSize: 17, fontWeight: 800, color: r.house >= 0 ? C.up : C.ink, opacity: h[k]!.op as never, transition: `opacity 300ms ${i * 70 + 500}ms` }}>
                  {r.house > 0 ? `+${r.house}` : `${r.house}`}
                </div>
              )}
              <div style={{ ...at(-6, 470, SLOT + 12), textAlign: 'center', fontSize: 16, color: is26 ? C.gold : C.muted, fontWeight: is26 ? 900 : 500, lineHeight: 1.3, whiteSpace: 'pre-line' }}>
                {`${r.year}\n${r.pres}`}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ ...at(0, 630, 1160), display: 'flex', gap: 26, justifyContent: 'center', fontSize: 19, color: C.muted }}>
        <span><span style={{ display: 'inline-block', width: 16, height: 16, background: C.dem, borderRadius: 3, marginRight: 8 }} />民主党总统</span>
        <span><span style={{ display: 'inline-block', width: 16, height: 16, background: C.rep, borderRadius: 3, marginRight: 8 }} />共和党总统</span>
        <span><span style={{ display: 'inline-block', width: 14, height: 14, background: C.gold, borderRadius: '50%', marginRight: 8 }} />2026：从席位图里抽出的 39 席</span>
      </div>
    </div>
  );
}

// ---------- 股市 ----------
const UP = '#ef4444';
const DOWN = '#22c55e';
const cn = (_id: string, v: number) => (v >= 0 ? UP : DOWN);
const pct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
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

const DAY_LIST = [
  { k: 'd1', date: '11/4 周三', sub: '结果出炉' },
  { k: 'd2', date: '11/5 周四', sub: '风向突变' },
  { k: 'd3', date: '11/6 周五', sub: '小幅反弹' },
];

function IndexBars() {
  const b = data.idx as unknown as Record<string, Record<string, Bind>>;
  return (
    <div id="idx" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {INDEX_ROWS.map((r: BarRow) => (
        <div id={`idx_${r.id}`} style={{ display: 'grid', gridTemplateColumns: '170px 1fr 120px', alignItems: 'center', gap: 16, height: 58 }}>
          <div style={{ textAlign: 'right', lineHeight: 1.2 }}>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{r.label}</div>
            <div style={{ fontSize: 16, color: C.muted }}>{r.sub}</div>
          </div>
          <div style={{ position: 'relative', height: 40, background: 'rgba(35,44,63,.85)', borderRadius: 4 }}>
            <div style={{ position: 'absolute', left: '50%', top: -5, bottom: -5, width: 2, background: C.lineStrong }} />
            <div style={{ position: 'absolute', top: 0, bottom: 0, borderRadius: 4, left: b[r.id]!.left, width: b[r.id]!.w, background: b[r.id]!.bg, transition: 'left 800ms cubic-bezier(.2,.8,.2,1), width 800ms cubic-bezier(.2,.8,.2,1), background-color 400ms' }} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{b[r.id]!.text}</div>
        </div>
      ))}
    </div>
  );
}

function Note({ text, delay }: { text: string; delay: number }) {
  return <span when={ui.notes} enter="rise" enterMs={500} enterDelay={delay} style={{ flex: 1, background: C.panel, border: `2px solid ${C.gold}`, borderRadius: 10, padding: '12px 16px', fontSize: 21, fontWeight: 800, lineHeight: 1.4 }}>{text}</span>;
}

export function Market() {
  return (
    <div id="c_market" style={{ ...box(BOX.market) }}>
      <Photo id="nyse_photo" name="nyse.jpg" pos="center 40%" fade="bottom" credit="照片：Arild Vågen / CC BY-SA 4.0 / Wikimedia Commons" creditTop style={{ ...at(0, 0, 1240, 680), opacity: 0.22, borderRadius: 18 }} />
      <div style={{ ...at(30, 100, 820), display: 'flex', gap: 14 }}>
        {DAY_LIST.map((d) => (
          <div id={`day_${d.k}`} style={{ position: 'relative', flex: 1, borderRadius: 8, padding: '10px 16px 14px', border: `1px solid ${C.line}`, background: 'rgba(18,25,39,.9)' }}>
            <div style={{ fontSize: 24, fontWeight: 900 }}>{d.date}</div>
            <div style={{ fontSize: 18, color: C.muted }}>{d.sub}</div>
            <div when={eq(ui.day, d.k)} motion="day_ptr" motionMs={700} enter="wipe" style={{ ...at(0, 0), right: 0, bottom: 0, borderRadius: 8, border: `3px solid ${C.gold}` }} />
          </div>
        ))}
      </div>
      <div style={{ ...at(30, 220, 820) }}><IndexBars /></div>
      <div id="vix" style={{ ...at(880, 100, 330, 420), background: 'rgba(18,25,39,.92)', border: `1px solid ${C.line}`, borderRadius: 14, padding: '26px 26px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10, boxSizing: 'border-box' }}>
        <div style={{ fontSize: 22, color: C.muted, letterSpacing: 1 }}>恐慌指数 VIX</div>
        <div style={{ fontSize: 110, fontWeight: 900, lineHeight: 1, color: ui.vixColor, transition: 'color 600ms', fontVariantNumeric: 'tabular-nums' }}>{ui.vix}</div>
        <div style={{ fontSize: 19, color: C.muted, lineHeight: 1.55 }}>{'越高越害怕。\n20 以下算平静，30 附近就是明显恐慌。'}</div>
      </div>
      <div style={{ ...at(30, 560, 1180), display: 'flex', gap: 16 }}>
        <Note text="同一周：油价跌约 13%，财报偏弱" delay={0} />
        <Note text="“分裂政府利好股市”：这次只撑了一天" delay={300} />
        <Note text="历史上：选后一年标普平均涨约 15%" delay={600} />
      </div>
    </div>
  );
}

// ---------- AI ----------
type AiRow = { id: string; label: string; sub: string; v: number; group: 'cloud' | 'chip' | 'other' };
const AI: AiRow[] = [
  { id: 'nvda', label: '英伟达', sub: '芯片', v: -8.8, group: 'chip' },
  { id: 'msft', label: '微软', sub: '云', v: 1.67, group: 'cloud' },
  { id: 'googl', label: 'Alphabet', sub: '云', v: 1.77, group: 'cloud' },
  { id: 'amzn', label: '亚马逊', sub: '云', v: 7.88, group: 'cloud' },
  { id: 'meta', label: 'Meta', sub: '应用', v: -0.79, group: 'other' },
  { id: 'avgo', label: '博通', sub: '芯片', v: -9.93, group: 'chip' },
  { id: 'orcl', label: '甲骨文', sub: '算力租赁', v: -11.15, group: 'chip' },
  { id: 'amd', label: 'AMD', sub: '芯片', v: -11.05, group: 'chip' },
  { id: 'pltr', label: 'Palantir', sub: 'AI 软件', v: -12.89, group: 'other' },
  { id: 'mu', label: '美光', sub: '存储芯片', v: -22.01, group: 'chip' },
];
const ROW_W = 540;
const ROW_H = 50;
const BAR_MAX = 240;

function AiRowView({ r, x, y, when, i }: { r: AiRow; x: number; y: number; when: unknown; i: number }) {
  const color = r.v >= 0 ? UP : DOWN;
  return (
    <div when={when as never} motion={`ai_${r.id}`} motionMs={1000} motionDelay={i * 50} enter="rise" enterMs={450} enterDelay={i * 80}
      style={{ ...at(x, y, ROW_W, ROW_H), display: 'grid', gridTemplateColumns: '150px 1fr 110px', alignItems: 'center', gap: 14 }}>
      <div style={{ textAlign: 'right', lineHeight: 1.1 }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>{r.label}</div>
        <div style={{ fontSize: 14, color: C.muted }}>{r.sub}</div>
      </div>
      <div style={{ position: 'relative', height: 30 }}>
        <div style={{ ...at(0, 0, Math.max(4, (Math.abs(r.v) / 24) * BAR_MAX), 30), background: color, borderRadius: 4 }} />
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color, fontVariantNumeric: 'tabular-nums' }}>{pct(r.v)}</div>
    </div>
  );
}

const LIST_X = (BOX.ai.w - ROW_W) / 2;
const COLS = { cloud: 10, other: 10, chip: 600 };
const ROW0 = { cloud: 140, other: 400, chip: 140 };

export function Ai() {
  const order: Record<string, number> = { cloud: 0, other: 0, chip: 0 };
  return (
    <div id="c_ai" style={{ ...box(BOX.ai) }}>
      <Photo id="dc_photo" name="datacenter.jpg" pos="center" fade="bottom" credit="图片：NASA Ames Research Center（公有领域）" creditTop style={{ ...at(0, 0, 1160, 680), opacity: 0.2, borderRadius: 18 }} />
      <div style={{ ...at(30, 20, 1100), fontSize: 26, fontWeight: 800, color: C.muted }}>AI 相关个股 · 选举那一周（10/30 → 11/6）</div>
      <div id="ai_bars" style={{ ...at(0, 70, 1160, 600) }}>
        {AI.map((r, i) => <AiRowView r={r} i={i} x={LIST_X} y={i * (ROW_H + 6)} when={eq(ui.ai, 'list')} />)}
        {AI.map((r, i) => {
          const n = order[r.group]!++;
          return <AiRowView r={r} i={i} x={COLS[r.group]} y={ROW0[r.group] - 70 + n * (ROW_H + 6)} when={eq(ui.ai, 'split')} />;
        })}
        <div id="g_cloud" when={eq(ui.ai, 'split')} enter="fade" enterDelay={700} style={{ ...at(30, 10, 520), fontSize: 26, fontWeight: 900, color: UP, borderBottom: `3px solid ${UP}`, paddingBottom: 6 }}>手里有算力的云巨头：涨</div>
        <div id="g_chip" when={eq(ui.ai, 'split')} enter="fade" enterDelay={700} style={{ ...at(620, 10, 520), fontSize: 26, fontWeight: 900, color: DOWN, borderBottom: `3px solid ${DOWN}`, paddingBottom: 6 }}>卖芯片、租算力的：大跌</div>
        <div when={eq(ui.ai, 'split')} enter="fade" enterDelay={700} style={{ ...at(30, 274, 520), fontSize: 20, fontWeight: 800, color: C.muted }}>其他 AI 股</div>
      </div>
      <div when={oneOf(ui.ai, ['list', 'split'])} enter="fade" style={{ ...at(30, 640, 1100), fontSize: 15, color: C.muted }}>个股为周涨跌（The Glass Desk 周报汇总）。红涨绿跌。</div>
    </div>
  );
}
