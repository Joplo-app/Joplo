/**
 * 半圆席位图（新闻里常见的“议会图”）：每个点是一个席位，从左往右按党派排列。
 * 点的位置在编写时算好（每一步都不动）；颜色绑定到 $.data.<key>.s<i>，换一组颜色时用 CSS 过渡，
 * 再按点离两端的远近错开延迟：蓝色从左边、红色从右边“涨”进来，像开票之夜的计票画面。
 */
import { $, type Bind } from '@joplo-app/kit';
import { C, partyColor, type Party } from './palette.ts';

type Seat = { x: number; y: number; order: number };

/** 标准议会图算法：rows 行同心半圆，每行席位数与半径成正比，再把所有席位按角度从左到右排序。 */
export function seatLayout(total: number, rows: number, inner = 0.38): Seat[] {
  const radii = Array.from({ length: rows }, (_, r) => inner + ((1 - inner) * r) / Math.max(1, rows - 1));
  const sum = radii.reduce((a, b) => a + b, 0);
  const counts = radii.map((r) => Math.floor((total * r) / sum));
  // 把四舍五入差的席位补给最外面的几行
  let left = total - counts.reduce((a, b) => a + b, 0);
  for (let r = rows - 1; left > 0; r = (r - 1 + rows) % rows, left--) counts[r]! += 1;
  const seats: { x: number; y: number; angle: number }[] = [];
  radii.forEach((rad, r) => {
    const n = counts[r]!;
    for (let i = 0; i < n; i++) {
      const angle = n === 1 ? Math.PI / 2 : Math.PI - (Math.PI * i) / (n - 1);
      seats.push({ x: rad * Math.cos(angle), y: rad * Math.sin(angle), angle });
    }
  });
  // 角度从大到小（左 → 右），同一角度先内后外
  seats.sort((a, b) => b.angle - a.angle || a.x * a.x + a.y * a.y - (b.x * b.x + b.y * b.y));
  return seats.map((s, order) => ({ x: s.x, y: s.y, order }));
}

/** 一组席位颜色：民主党从左边数、共和党从右边数，中间是未定或不在改选的席位。 */
export function seatColors(total: number, parts: { D: number; R: number; I?: number; U?: number; Dl?: number; Rl?: number }): Record<string, string> {
  const out: Record<string, string> = {};
  const seq: string[] = [];
  const add = (n: number, c: string) => { for (let i = 0; i < n; i++) seq.push(c); };
  // 左边：民主党（深）→ 民主党不改选（浅）→ 独立 → 未定 …… 右边：共和党不改选（浅）→ 共和党（深）
  add(parts.D, partyColor('D'));
  add(parts.Dl ?? 0, partyColor('D', true));
  add(parts.I ?? 0, partyColor('I'));
  const mid = total - parts.D - (parts.Dl ?? 0) - (parts.I ?? 0) - parts.R - (parts.Rl ?? 0);
  add(Math.max(0, mid), (parts.U ?? 0) > 0 ? C.pending : C.none);
  add(parts.Rl ?? 0, partyColor('R', true));
  add(parts.R, partyColor('R'));
  seq.slice(0, total).forEach((c, i) => { out[`s${i}`] = c; });
  return out;
}

export const blankSeats = (total: number): Record<string, string> => seatColors(total, { D: 0, R: 0 });

type Props = { id: string; bind: Bind; total: number; rows: number; width: number; dot?: number; majority?: number; majorityLabel?: string };

/** 画出席位图。bind 指向 $.data 里的一个对象（s0…s{n-1} → 颜色）。 */
export function Hemicycle({ id, bind, total, rows, width, dot, majority, majorityLabel }: Props) {
  const seats = seatLayout(total, rows);
  const R = width / 2;
  const size = dot ?? Math.max(6, Math.floor((R * 0.62) / rows) - 2);
  const H = R + size;
  const colors = bind as unknown as Record<string, Bind>;
  return (
    <div id={id} style={{ position: 'relative', width, height: H + 26, margin: '0 auto' }}>
      {seats.map((s, i) => {
        // 离最近一端的位置决定延迟：两边同时向中间“涨”
        const fromEdge = Math.min(s.order, total - 1 - s.order);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: R + s.x * (R - size / 2) - size / 2,
              top: H - s.y * (R - size / 2) - size,
              width: size,
              height: size,
              borderRadius: '50%',
              background: colors[`s${i}`],
              transition: `background-color 420ms ease ${Math.round(fromEdge * (1400 / total))}ms`,
            }}
          />
        );
      })}
      {majority ? (
        <div style={{ position: 'absolute', left: R - 1, top: 0, width: 2, height: H + 4, background: C.ink, opacity: 0.55 }} />
      ) : null}
      {majority ? (
        <div style={{ position: 'absolute', left: 0, right: 0, top: H + 8, textAlign: 'center', fontSize: 13, color: C.muted, letterSpacing: 0.3 }}>
          {majorityLabel ?? `过半数：${majority} 席`}
        </div>
      ) : null}
    </div>
  );
}

export const houseBind = $.data.house;
export const senateBind = $.data.senate;
