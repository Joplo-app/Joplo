/**
 * Rough.js 手绘描边。种子由 node.id 哈希得到，同一画面每次绘制一致（截图可复现）。
 * 线框主题下不绘制，由 CSS 的 1px 边框代替。
 */
import { createContext, useContext, useLayoutEffect, useRef } from 'react';
import rough from 'roughjs';
import type { Options } from 'roughjs/bin/core';

export type StageTheme = 'sketch' | 'clean';

/** FNV-1a 32 位哈希，映射为正整数种子。 */
export function seedOf(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 2147483646 + 1;
}

/** 记录尚未完成首次绘制的 rough 图形数量，供渲染路由判断就绪。 */
export class RoughRegistry {
  private pending = new Set<object>();
  add(k: object) {
    this.pending.add(k);
  }
  done(k: object) {
    this.pending.delete(k);
  }
  remove(k: object) {
    this.pending.delete(k);
  }
  get size() {
    return this.pending.size;
  }
}

export const ThemeContext = createContext<{ theme: StageTheme; registry: RoughRegistry | null }>({ theme: 'sketch', registry: null });
export const useStageTheme = () => useContext(ThemeContext).theme;

type Shape = 'rect' | 'ellipse' | 'underline' | 'line';

export type RoughProps = {
  seedKey: string;
  shape?: Shape;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  fillStyle?: Options['fillStyle'];
  dashed?: boolean;
  roughness?: number;
  inset?: number;
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 放在 position:relative 的盒子里，覆盖整个盒子绘制手绘边框。 */
export function Rough({ seedKey, shape = 'rect', stroke = '#1e1e1e', strokeWidth = 1.3, fill, fillStyle = 'hachure', dashed, roughness = 1.1, inset = 2 }: RoughProps) {
  const { theme, registry } = useContext(ThemeContext);
  const ref = useRef<SVGSVGElement>(null);

  useLayoutEffect(() => {
    if (theme !== 'sketch') return;
    const svg = ref.current;
    const host = svg?.parentElement;
    if (!svg || !host) return;
    const token = {};
    registry?.add(token);
    let lastKey = '';
    const draw = () => {
      const w = host.offsetWidth;
      const h = host.offsetHeight;
      const key = `${w}x${h}`;
      if (w <= 0 || h <= 0 || key === lastKey) return;
      lastKey = key;
      const W = w + 2;
      const H = h + 2;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const rc = rough.svg(svg);
      const opts: Options = {
        seed: seedOf(seedKey),
        stroke,
        strokeWidth,
        roughness,
        bowing: 0.7,
        disableMultiStroke: false,
        preserveVertices: true,
        ...(dashed ? { strokeLineDash: [6, 5] } : {}),
        ...(fill ? { fill, fillStyle, fillWeight: 1.2, hachureGap: 5 } : {}),
      };
      let el: SVGGElement;
      if (shape === 'ellipse') el = rc.ellipse(W / 2, H / 2, W - inset * 2, H - inset * 2, opts);
      else if (shape === 'underline') el = rc.line(inset, H - inset, W - inset, H - inset, opts);
      else if (shape === 'line') el = rc.line(inset, H / 2, W - inset, H / 2, opts);
      else el = rc.rectangle(inset, inset, W - inset * 2, H - inset * 2, opts);
      svg.appendChild(el);
      registry?.done(token);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(host);
    return () => {
      ro.disconnect();
      registry?.remove(token);
    };
  }, [theme, registry, seedKey, shape, stroke, strokeWidth, fill, fillStyle, dashed, roughness, inset]);

  if (theme !== 'sketch') return null;
  return <svg ref={ref} className="jrough" aria-hidden="true" xmlns={SVG_NS} preserveAspectRatio="none" />;
}
