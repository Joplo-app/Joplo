/**
 * 美国瓦片地图（每个州一个等大的方块，按大致地理位置排布）：新闻里常用来比较各州结果，
 * 小州不会因为面积小而看不见。方块颜色绑定到 $.data.<key>.<州代码>，换一组颜色时淡入。
 * 每个方块的 id 是 <地图 id>_<州代码>，可以被 highlight / callout / mark 指向。
 */
import { type Bind } from '@joplo-app/kit';
import { C } from './palette.ts';

export const TILES: Record<string, [number, number]> = {
  AK: [0, 0], ME: [11, 0],
  WI: [6, 1], VT: [10, 1], NH: [11, 1],
  WA: [1, 2], ID: [2, 2], MT: [3, 2], ND: [4, 2], MN: [5, 2], IL: [6, 2], MI: [7, 2], NY: [9, 2], MA: [10, 2],
  OR: [1, 3], NV: [2, 3], WY: [3, 3], SD: [4, 3], IA: [5, 3], IN: [6, 3], OH: [7, 3], PA: [8, 3], NJ: [9, 3], CT: [10, 3], RI: [11, 3],
  CA: [1, 4], UT: [2, 4], CO: [3, 4], NE: [4, 4], MO: [5, 4], KY: [6, 4], WV: [7, 4], VA: [8, 4], MD: [9, 4], DE: [10, 4],
  AZ: [2, 5], NM: [3, 5], KS: [4, 5], AR: [5, 5], TN: [6, 5], NC: [7, 5], SC: [8, 5], DC: [9, 5],
  OK: [4, 6], LA: [5, 6], MS: [6, 6], AL: [7, 6], GA: [8, 6],
  HI: [0, 7], TX: [4, 7], FL: [9, 7],
};

/** 文字颜色：深色底用白字，浅色底用深字。 */
export const tileText = (bg: string) => (bg === C.gold ? C.bg : bg === C.none ? C.muted : '#ffffff');

/** 一张地图的颜色：没列出的州用“不改选”的底色。 */
export function mapColors(colored: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(TILES)) out[k] = colored[k] ?? C.none;
  return out;
}
export function mapText(colored: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(TILES)) out[k] = tileText(colored[k] ?? C.none);
  return out;
}

type Props = { id: string; fill: Bind; ink: Bind; ring?: Bind; cell?: number; gap?: number };

export function TileMap({ id, fill, ink, ring, cell = 46, gap = 4 }: Props) {
  const r = ring as unknown as Record<string, Bind> | undefined;
  const f = fill as unknown as Record<string, Bind>;
  const t = ink as unknown as Record<string, Bind>;
  const step = cell + gap;
  return (
    <div id={id} style={{ position: 'relative', width: 12 * step - gap, height: 8 * step - gap, margin: '0 auto' }}>
      {Object.entries(TILES).map(([code, [x, y]], i) => (
        <div
          key={code}
          id={`${id}_${code}`}
          style={{
            position: 'absolute', left: x * step, top: y * step, width: cell, height: cell, borderRadius: 4,
            background: f[code], color: t[code], ...(r ? { boxShadow: r[code] } : {}),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: Math.round(cell * 0.3), fontWeight: 650, letterSpacing: 0.4,
            transition: `background-color 450ms ease ${(x + y) * 45}ms, color 450ms ease ${(x + y) * 45}ms`,
          }}
        >
          {code}
        </div>
      ))}
    </div>
  );
}
