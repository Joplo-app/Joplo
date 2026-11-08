/**
 * 横向条形图（可正可负）：新闻里比较“各指数涨跌”“各届中期选举丢了多少席”。
 * 每一行的长度、颜色、数值文字都绑定到 $.data.<key>.<行 id>，set() 一组新值时条形平滑伸缩。
 */
import { type Bind } from '@joplo-app/kit';
import { C } from './palette.ts';

export type BarRow = { id: string; label: string; sub?: string };
export type BarValue = { w: string; left: string; bg: string; text: string };

/** 把数值换成绑定用的样式：0 在中线，正值向右，负值向左；scale 是半边的满刻度。 */
export function barValues(values: Record<string, number | null>, scale: number, fmt: (v: number) => string, color?: (id: string, v: number) => string): Record<string, BarValue> {
  const out: Record<string, BarValue> = {};
  for (const [id, v] of Object.entries(values)) {
    if (v === null) { out[id] = { w: '0%', left: '50%', bg: C.pending, text: '—' }; continue; }
    const pct = Math.min(50, (Math.abs(v) / scale) * 50);
    out[id] = { w: `${pct}%`, left: v >= 0 ? '50%' : `${50 - pct}%`, bg: color ? color(id, v) : v >= 0 ? C.up : C.rep, text: fmt(v) };
  }
  return out;
}

export const emptyBars = (rows: BarRow[]): Record<string, BarValue> =>
  Object.fromEntries(rows.map((r) => [r.id, { w: '0%', left: '50%', bg: C.pending, text: '' }]));

type Props = { id: string; rows: BarRow[]; bind: Bind; labelWidth?: number; rowHeight?: number };

export function DivergingBars({ id, rows, bind, labelWidth = 150, rowHeight = 34 }: Props) {
  const b = bind as unknown as Record<string, Record<string, Bind>>;
  return (
    <div id={id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map((r) => (
        <div key={r.id} id={`${id}_${r.id}`} style={{ display: 'grid', gridTemplateColumns: `${labelWidth}px 1fr 72px`, alignItems: 'center', gap: 12, height: rowHeight }}>
          <div style={{ textAlign: 'right', lineHeight: 1.2 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{r.label}</div>
            {r.sub ? <div style={{ fontSize: 12, color: C.muted }}>{r.sub}</div> : null}
          </div>
          <div style={{ position: 'relative', height: rowHeight - 12, background: C.none, borderRadius: 3 }}>
            <div style={{ position: 'absolute', left: '50%', top: -3, bottom: -3, width: 1, background: C.lineStrong }} />
            <div style={{ position: 'absolute', top: 0, bottom: 0, borderRadius: 3, left: b[r.id]!.left, width: b[r.id]!.w, background: b[r.id]!.bg, transition: 'left 700ms cubic-bezier(.2,.8,.2,1), width 700ms cubic-bezier(.2,.8,.2,1), background-color 400ms' }} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 750, fontVariantNumeric: 'tabular-nums' }}>{b[r.id]!.text as never}</div>
        </div>
      ))}
    </div>
  );
}
