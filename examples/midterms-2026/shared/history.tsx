/**
 * “反转”：1946 年以来，总统所在党在中期选举里几乎总是丢席位。
 * 柱子从 0 线往下“垂”（丢席）或往上长（增席），颜色是总统所在党；高度绑定到 $.data.hist.y<年>，逐根错开出现。
 * 2026 年单独一根，最后才长出来。
 */
import { $, type Bind } from '@joplo-app/kit';
import { HISTORY, HISTORY_2026, HISTORY_SOURCE } from './data.ts';
import { Frame, Hl } from './frame.tsx';
import { C, partyColor } from './palette.ts';

const data = $.data as unknown as Record<string, Bind>;
const ALL = [...HISTORY, HISTORY_2026];
const PX = 4.4; // 每席多少像素
const ZERO = 70; // 0 线距离图顶部的像素（上面留给增席）

type Col = { h: string; top: string; op: number };
const col = (v: number, show: boolean): Col =>
  show ? { h: `${Math.abs(v) * PX}px`, top: v >= 0 ? `${ZERO - v * PX}px` : `${ZERO}px`, op: 1 } : { h: '0px', top: `${ZERO}px`, op: 0 };

export const histCols = (upTo: 'none' | 'past' | 'all') =>
  Object.fromEntries(ALL.map((r) => [`y${r.year}`, col(r.house, upTo === 'all' || (upTo === 'past' && r.year !== 2026))]));

export const historyState = () => ({ hist: histCols('none') });

export function HistoryLayer() {
  const h = data.hist as unknown as Record<string, Record<string, Bind>>;
  return (
    <Frame kicker="第三部分 · 反转" title={<>不是特朗普一个人的“诅咒”：<Hl tone="gold">执政党几乎总会输</Hl></>} source={HISTORY_SOURCE}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div id="hist_chart" style={{ position: 'relative', height: ZERO + 66 * PX + 40, margin: '0 10px' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: ZERO, height: 2, background: C.lineStrong }} />
                    <div id="avg_line" style={{ position: 'absolute', left: 0, right: 0, top: ZERO + 26 * PX, borderTop: `2px dashed ${C.gold}` }} />
          <div style={{ position: 'absolute', right: 0, top: ZERO + 26 * PX + 4, fontSize: 13, color: C.gold, fontWeight: 750 }}>平均：丢 26 席</div>
          <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: `repeat(${ALL.length}, 1fr)`, gap: 6 }}>
            {ALL.map((r, i) => {
              const k = `y${r.year}`;
              const is26 = r.year === 2026;
              return (
                <div key={k} id={`col_${r.year}`} style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '12%', right: '12%', top: h[k]!.top, height: h[k]!.h, opacity: h[k]!.op as never, background: partyColor(r.party), borderRadius: 3,
                    boxShadow: is26 ? `0 0 0 3px ${C.gold}` : undefined,
                    transition: `height 700ms cubic-bezier(.2,.8,.2,1) ${i * 60}ms, top 700ms cubic-bezier(.2,.8,.2,1) ${i * 60}ms, opacity 300ms ${i * 60}ms` }} />
                  <div style={{ position: 'absolute', left: 0, right: 0, top: r.house >= 0 ? ZERO - r.house * PX - 20 : ZERO + Math.abs(r.house) * PX + 6, textAlign: 'center', fontSize: 12, fontWeight: 800, color: r.house >= 0 ? C.up : C.ink, opacity: h[k]!.op as never, transition: `opacity 300ms ${i * 60 + 400}ms` }}>
                    {r.house > 0 ? `+${r.house}` : `${r.house}`}
                  </div>
                  <div style={{ position: 'absolute', left: -6, right: -6, bottom: 0, textAlign: 'center', fontSize: 12, color: is26 ? C.gold : C.muted, fontWeight: is26 ? 900 : 500, lineHeight: 1.3, whiteSpace: 'pre-line' }}>
                    {`${r.year}\n${r.pres}`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 18, justifyContent: 'center', marginTop: 10, fontSize: 13, color: C.muted }}>
          <span><span style={{ display: 'inline-block', width: 12, height: 12, background: C.dem, borderRadius: 3, marginRight: 6 }} />民主党总统</span>
          <span><span style={{ display: 'inline-block', width: 12, height: 12, background: C.rep, borderRadius: 3, marginRight: 6 }} />共和党总统</span>
          <span>柱子 = 总统所在党在众议院增减的席位</span>
        </div>
      </div>
    </Frame>
  );
}
