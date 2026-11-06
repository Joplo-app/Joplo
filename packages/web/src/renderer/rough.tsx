/**
 * Rough.js 手绘描边。种子由 node.id 哈希得到，同一画面每次绘制一致（截图可复现）。
 * 只在主题的 --jp-stroke 为 rough 时绘制；clean 时由 CSS 的 1px 边框代替（D51）。
 * 颜色可以是 var(--jp-*) / color-mix(...)：绘制后改写成路径的 CSS 样式，跟随当前主题（切换主题不必重画）。
 */
import { createContext, useContext, useLayoutEffect, useRef } from 'react';
import rough from 'roughjs';
import type { Options } from 'roughjs/bin/core';

/** 主题名（D51）：内置主题或作者主题 themes/<name>.css。 */
export type StageTheme = string;
export type { StrokeMode } from './themes';
import type { StrokeMode } from './themes';
import type { AppearanceFont } from '@joplo-app/core';

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

/** 舞台外观（D51 / D55）：主题、实际线条、字体覆盖（null = 跟随主题）。舞台外的 .jtheme 部件（手机外框）也读它。 */
export const ThemeContext = createContext<{ theme: StageTheme; stroke?: StrokeMode; font?: AppearanceFont | null; registry: RoughRegistry | null }>({ theme: 'sketch', stroke: 'rough', font: null, registry: null });
export const useStageTheme = () => useContext(ThemeContext).theme;
/** 描边方式：rough = 手绘描边；clean = 细线边框（由主题的 --jp-stroke 决定）。 */
export const useStroke = (): StrokeMode => useContext(ThemeContext).stroke ?? 'rough';

/** Rough 输出的路径里，var(--jp-*) / color-mix(...) 这类颜色写成 CSS 样式（SVG 属性不支持 CSS 变量）。 */
function themeColors(el: Element) {
  for (const n of [el, ...el.querySelectorAll('*')]) {
    for (const a of ['stroke', 'fill']) {
      const v = n.getAttribute(a);
      if (v && /var\(|color-mix\(/.test(v)) {
        (n as SVGElement).style.setProperty(a, v);
        n.removeAttribute(a);
      }
    }
  }
}

type Shape = 'rect' | 'ellipse' | 'underline' | 'line' | 'roundrect' | 'custom';

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
  /** shape 为 roundrect 时的圆角半径（px）。 */
  radius?: number;
  /** shape 为 custom 时：给定盒子尺寸（含 inset 的坐标系）返回 SVG 路径。请传模块级常量，避免每次渲染重画。 */
  pathOf?: (x: number, y: number, w: number, h: number) => string;
};

/** 圆角矩形的 SVG 路径（Rough 的 path 会把它画成手绘线条）。 */
export function roundRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  return `M${x + k},${y} H${x + w - k} A${k},${k} 0 0 1 ${x + w},${y + k} V${y + h - k} A${k},${k} 0 0 1 ${x + w - k},${y + h} H${x + k} A${k},${k} 0 0 1 ${x},${y + h - k} V${y + k} A${k},${k} 0 0 1 ${x + k},${y} Z`;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 放在 position:relative 的盒子里，覆盖整个盒子绘制手绘边框。 */
export function Rough({ seedKey, shape = 'rect', stroke = 'var(--jp-ink)', strokeWidth = 1.3, fill, fillStyle = 'hachure', dashed, roughness = 1.1, inset = 2, radius = 0, pathOf }: RoughProps) {
  const { stroke: mode = 'rough', registry } = useContext(ThemeContext);
  const ref = useRef<SVGSVGElement>(null);

  useLayoutEffect(() => {
    if (mode !== 'rough') return;
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
      else if (shape === 'custom' && pathOf) el = rc.path(pathOf(inset, inset, W - inset * 2, H - inset * 2), opts);
      else if (shape === 'roundrect') el = rc.path(roundRectPath(inset, inset, W - inset * 2, H - inset * 2, radius), opts);
      else el = rc.rectangle(inset, inset, W - inset * 2, H - inset * 2, opts);
      themeColors(el);
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
  }, [mode, registry, seedKey, shape, stroke, strokeWidth, fill, fillStyle, dashed, roughness, inset, radius, pathOf]);

  if (mode !== 'rough') return null;
  return <svg ref={ref} className="jrough" aria-hidden="true" xmlns={SVG_NS} preserveAspectRatio="none" />;
}

/**
 * 在一个已有的 <svg> 里按绝对坐标画手绘路径（架构图连线、箭头）。只在手绘描边（--jp-stroke: rough）时渲染；
 * 绘制期间登记到 RoughRegistry，渲染路由据此等绘制完成再截图。
 */
export function RoughPath({ seedKey, d, stroke = 'var(--jp-ink)', strokeWidth = 1.4, fill, dashed, roughness = 0.9, draw = false }: { draw?: boolean; seedKey: string; d: string; stroke?: string; strokeWidth?: number; fill?: string; dashed?: boolean; roughness?: number }) {
  const { stroke: mode = 'rough', registry } = useContext(ThemeContext);
  const ref = useRef<SVGGElement>(null);
  const drawn = useRef('');
  useLayoutEffect(() => {
    if (mode !== 'rough') return;
    const g = ref.current;
    const svg = g?.ownerSVGElement;
    if (!g || !svg || !d) return;
    const token = {};
    registry?.add(token);
    while (g.firstChild) g.removeChild(g.firstChild);
    const opts: Options = {
      seed: seedOf(seedKey),
      stroke,
      strokeWidth,
      roughness,
      bowing: 0.6,
      preserveVertices: true,
      ...(dashed ? { strokeLineDash: [7, 6] } : {}),
      ...(fill ? { fill, fillStyle: 'solid' } : {}),
    };
    const el = rough.svg(svg).path(d, opts);
    themeColors(el);
    if (draw && drawn.current !== seedKey) {
      for (const p of el.querySelectorAll('path')) { p.setAttribute('pathLength', '1'); p.style.animation = 'jmark-draw 0.6s ease-out both'; }
      drawn.current = seedKey;
    }
    g.appendChild(el);
    registry?.done(token);
    return () => registry?.remove(token);
  }, [mode, registry, seedKey, d, stroke, strokeWidth, fill, dashed, roughness, draw]);
  if (mode !== 'rough') return null;
  return <g ref={ref} className="jrough-path" aria-hidden="true" />;
}
