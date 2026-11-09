/**
 * 席位图（一镜到底版）：沿用 hemicycle.tsx 的布局算法，多一个“抽出来”的能力。
 * lift 指定一段席位（例如共和党确定丢掉的 39 席）：在 glow 状态时，这些席位上面叠一层金色的同名物件（motion 键 lost_<k>）；
 * 换到别的区块里同名物件出现时（历史图的 2026 那一根），Joplo 让它们从席位图飞过去。底下原本的蓝色席位不动，席位图不会留洞。
 */
import { type Bind, type CondExpr } from '@joplo-app/kit';
import { seatLayout } from '../hemicycle.tsx';
import { C } from '../palette.ts';

type Lift = { from: number; to: number; when: CondExpr };
type Props = { id: string; bind: Bind; total: number; rows: number; width: number; lift?: Lift };

export function Seats({ id, bind, total, rows, width, lift }: Props) {
  const seats = seatLayout(total, rows);
  const R = width / 2;
  const size = Math.max(6, Math.floor((R * 0.62) / rows) - 2);
  const H = R + size;
  const colors = bind as unknown as Record<string, Bind>;
  const left = (s: { x: number }) => R + s.x * (R - size / 2) - size / 2;
  const top = (s: { y: number }) => H - s.y * (R - size / 2) - size;
  return (
    <div id={id} style={{ position: 'relative', width, height: H + 34, margin: '0 auto' }}>
      {seats.map((s, i) => {
        // 离最近一端越远，变色越晚：两边同时向中间“涨”
        const fromEdge = Math.min(s.order, total - 1 - s.order);
        return (
          <div style={{ position: 'absolute', left: left(s), top: top(s), width: size, height: size, borderRadius: '50%', background: colors[`s${i}`],
            transition: `background-color 420ms ease ${Math.round(fromEdge * (1500 / total))}ms` }} />
        );
      })}
      {lift ? seats.slice(lift.from, lift.to + 1).map((s, k) => (
        <div when={lift.when} motion={`lost_${k}`} motionDelay={k * 18} enter="zoom" enterMs={500} enterDelay={k * 25}
          style={{ position: 'absolute', left: left(s) - 2, top: top(s) - 2, width: size + 4, height: size + 4, borderRadius: '50%', background: C.gold, boxShadow: `0 0 12px ${C.gold}` }} />
      )) : null}
      <div style={{ position: 'absolute', left: R - 1, top: -6, width: 2, height: H + 10, background: C.ink, opacity: 0.6 }} />
    </div>
  );
}

/** 历史图里 2026 那一根：同一批 lost_<k> 物件排成 3 列的一柱（每个点 = 1 席）。 */
export function LostColumn({ count, when, dot, gap }: { count: number; when: CondExpr; dot: number; gap: number }) {
  const cols = 3;
  return (
    <>
      {Array.from({ length: count }, (_, k) => (
        <div when={when} motion={`lost_${k}`} motionDelay={k * 18}
          style={{ position: 'absolute', left: (k % cols) * (dot + gap), top: Math.floor(k / cols) * (dot + gap), width: dot, height: dot, borderRadius: '50%', background: C.gold }} />
      ))}
    </>
  );
}
