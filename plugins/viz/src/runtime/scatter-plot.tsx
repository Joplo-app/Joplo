import { scaleLinear } from 'd3-scale';
import { line as d3Line } from 'd3-shape';
import type { ComponentCtx, PluginIRNode } from '@joplo-app/kit/plugin';
import { motion, useRoot } from '@joplo-app/kit/renderer';
import type { ScatterPointInput } from '../components.ts';
import { computeParetoFrontier, type ParetoCorner } from '../schema.ts';
import { ChartHeader, useAnchorAttrs, useVizChart } from './hooks.tsx';
import {
  ACCENT,
  DIMMED,
  EASE_OUT_EXPO,
  INK,
  INK2,
  LINE,
  LINE_STRONG,
  MONO,
  OK,
  SURFACE,
  VIZ_FONT_SANS,
  arr,
  dim,
  formatNumber,
  num,
  str,
  tint,
  vizColor,
} from './tokens.ts';

type ScatterPointExt = ScatterPointInput & { labelPos?: 'top' | 'bottom' | 'left' | 'right' };

function ScatterDot({
  pt,
  pxPct,
  pyPx,
  pyPct,
  fill,
  radius,
  isHighlight,
  isDominated,
  dimmed,
  animate,
  index,
  xUnit,
  yUnit,
  anchors,
}: {
  pt: ScatterPointExt;
  pxPct: number;
  pyPx: number;
  pyPct: number;
  fill: string;
  radius: number;
  isHighlight: boolean;
  isDominated: boolean;
  dimmed: boolean;
  animate: boolean;
  index: number;
  xUnit: string;
  yUnit: string;
  anchors: Map<string, PluginIRNode>;
}) {
  const anchorProps = useAnchorAttrs(anchors, pt.id, pt.label);
  const size = radius * 2;

  // Smart default label placement so labels stay inside plot bounds and don't cross top frontier line
  const pos: 'top' | 'bottom' | 'left' | 'right' =
    pt.labelPos ??
    (pxPct > 74 ? 'bottom' : pyPct < 24 ? 'right' : pxPct < 18 ? 'right' : 'right');

  const labelStyle: React.CSSProperties =
    pos === 'top'
      ? { left: '50%', bottom: size / 2 + 8, transform: 'translateX(-50%)' }
      : pos === 'bottom'
        ? { left: pxPct > 80 ? undefined : '50%', right: pxPct > 80 ? -2 : undefined, top: size / 2 + 8, transform: pxPct > 80 ? undefined : 'translateX(-50%)' }
        : pos === 'left'
          ? { right: size / 2 + 10, top: '50%', transform: 'translateY(-50%)' }
          : { left: size / 2 + 10, top: '50%', transform: 'translateY(-50%)' };

  const meta = pt.valueLabel ?? (xUnit || yUnit ? `${formatNumber(pt.x, xUnit)} · ${formatNumber(pt.y, yUnit)}` : '');

  return (
    <motion.div
      {...anchorProps}
      data-jpoint={pt.id ?? pt.label}
      initial={animate ? { scale: 0.4, opacity: 0 } : false}
      animate={{ scale: 1, opacity: dimmed ? 0.2 : 1 }}
      transition={animate ? { duration: 0.36, delay: index * 0.05, ease: EASE_OUT_EXPO } : { duration: 0 }}
      style={{
        position: 'absolute',
        left: `${pxPct}%`,
        top: pyPx,
        width: size,
        height: size,
        marginLeft: -radius,
        marginTop: -radius,
        borderRadius: '50%',
        background: fill,
        border: isHighlight ? `3px solid ${SURFACE}` : `2px solid ${SURFACE}`,
        boxShadow: isHighlight
          ? `0 0 0 3px ${tint(fill, 28)}, 0 4px 12px rgba(23,24,26,0.14)`
          : isDominated
            ? 'none'
            : `0 2px 6px ${tint(fill, 28)}`,
        boxSizing: 'border-box',
        zIndex: isHighlight ? 5 : isDominated ? 2 : 3,
      }}
    >
      <div
        style={{
          position: 'absolute',
          ...labelStyle,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          background: isHighlight ? tint(fill, 10) : 'rgba(255,255,255,0.88)',
          border: isHighlight ? `1px solid ${tint(fill, 34)}` : 'none',
          borderRadius: 6,
          padding: isHighlight ? '2px 7px' : '1px 4px',
        }}
      >
        <span
          style={{
            fontSize: isHighlight ? 12.5 : 11.5,
            fontWeight: isHighlight ? 850 : isDominated ? 600 : 750,
            color: isHighlight ? fill : isDominated ? DIMMED : INK,
          }}
        >
          {pt.label}
        </span>
        {meta && (
          <span
            style={{
              fontFamily: MONO,
              fontSize: 11,
              fontWeight: isHighlight ? 800 : 600,
              color: isHighlight ? fill : DIMMED,
            }}
          >
            {meta}
          </span>
        )}
      </div>
    </motion.div>
  );
}

export function ScatterPlotView({ ctx }: { ctx: ComponentCtx }) {
  const { node, p, animate, anchors, isDimmed } = useVizChart(ctx);
  const {
    title,
    subtitle,
    points: rawPoints,
    xLabel,
    yLabel,
    xUnit: rawXUnit,
    yUnit: rawYUnit,
    xDomain: rawXDomain,
    yDomain: rawYDomain,
    pareto,
    quadrant,
    pointIds: _pids,
    w,
    h,
    ...rest
  } = p;

  const H = num(h, 290)!;
  const root = useRoot(node, rest, {
    style: {
      width: dim(w) ?? '100%',
      minWidth: 0,
      fontFamily: VIZ_FONT_SANS,
      color: INK,
    },
  });

  const points = arr(rawPoints).filter(
    (pt): pt is ScatterPointExt =>
      !!pt &&
      typeof pt === 'object' &&
      typeof (pt as ScatterPointExt).x === 'number' &&
      Number.isFinite((pt as ScatterPointExt).x) &&
      typeof (pt as ScatterPointExt).y === 'number' &&
      Number.isFinite((pt as ScatterPointExt).y),
  );
  if (!points.length) return <div {...root} role="status">ScatterPlot · no points</div>;

  const xUnit = str(rawXUnit);
  const yUnit = str(rawYUnit);
  const xs = points.map((pt) => pt.x);
  const ys = points.map((pt) => pt.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xPad = Math.max((xMax - xMin) * 0.14, 1);
  const yPad = Math.max((yMax - yMin) * 0.16, 1);

  const xDomain: [number, number] =
    Array.isArray(rawXDomain) && typeof rawXDomain[0] === 'number' && typeof rawXDomain[1] === 'number'
      ? [rawXDomain[0], rawXDomain[1]]
      : [Math.max(0, xMin - xPad), xMax + xPad];
  const yDomain: [number, number] =
    Array.isArray(rawYDomain) && typeof rawYDomain[0] === 'number' && typeof rawYDomain[1] === 'number'
      ? [rawYDomain[0], rawYDomain[1]]
      : [yMin - yPad, yMax + yPad];

  const plotH = Math.max(160, H - 48);
  const vbW = 1000;
  const vbH = plotH;
  const xScale = scaleLinear().domain(xDomain).range([0, vbW]).clamp(true);
  const yScale = scaleLinear().domain(yDomain).range([vbH, 0]).clamp(true);
  const xTicks = xScale.ticks(4);
  const yTicks = yScale.ticks(4);

  const paretoCorner: ParetoCorner | false =
    pareto === false
      ? false
      : pareto === 'top-right' || pareto === 'bottom-left' || pareto === 'bottom-right'
        ? pareto
        : 'top-left';

  const frontier = paretoCorner ? computeParetoFrontier(points, paretoCorner) : [];
  const frontierSet = new Set(frontier);
  const frontierPath =
    frontier.length >= 2
      ? (d3Line<ScatterPointExt>()
          .x((d) => xScale(d.x))
          .y((d) => yScale(d.y))(frontier) ?? '')
      : '';

  const quadObj =
    quadrant &&
    typeof quadrant === 'object' &&
    typeof (quadrant as { x?: unknown }).x === 'number' &&
    typeof (quadrant as { y?: unknown }).y === 'number'
      ? (quadrant as { x: number; y: number; label?: string; corner?: ParetoCorner })
      : null;

  const quadCorner: ParetoCorner = quadObj?.corner ?? (paretoCorner || 'top-left');
  const quadRect = quadObj
    ? (() => {
        const qx = xScale(quadObj.x);
        const qy = yScale(quadObj.y);
        const left = quadCorner.endsWith('left') ? 0 : qx;
        const width = quadCorner.endsWith('left') ? qx : vbW - qx;
        const top = quadCorner.startsWith('top') ? 0 : qy;
        const height = quadCorner.startsWith('top') ? qy : vbH - qy;
        return { left, top, width: Math.max(0, width), height: Math.max(0, height) };
      })()
    : null;

  const cornerBadge =
    paretoCorner === 'top-left'
      ? '↖ 越往左上越优'
      : paretoCorner === 'top-right'
        ? '↗ 越往右上越优'
        : paretoCorner === 'bottom-left'
          ? '↙ 越往左下越优'
          : paretoCorner === 'bottom-right'
            ? '↘ 越往右下越优'
            : undefined;

  return (
    <figure {...root} style={{ ...root.style, margin: 0 }} aria-label={typeof title === 'string' ? title : 'ScatterPlot'}>
      <ChartHeader
        title={typeof title === 'string' ? title : undefined}
        subtitle={typeof subtitle === 'string' ? subtitle : undefined}
        right={
          cornerBadge ? (
            <span
              style={{
                padding: '3px 9px',
                borderRadius: 999,
                background: tint(OK, 12),
                color: OK,
                fontSize: 11.5,
                fontWeight: 800,
                whiteSpace: 'nowrap',
              }}
            >
              {cornerBadge}
            </span>
          ) : undefined
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr', columnGap: 12, alignItems: 'start' }}>
        {/* Y-axis ticks */}
        <div style={{ position: 'relative', height: plotH, fontFamily: MONO, fontSize: 11, color: DIMMED, textAlign: 'right' }}>
          {yTicks.map((tk) => (
            <span
              key={tk}
              style={{
                position: 'absolute',
                right: 0,
                top: yScale(tk),
                transform: 'translateY(-50%)',
                whiteSpace: 'nowrap',
              }}
            >
              {formatNumber(tk, yUnit)}
            </span>
          ))}
          {typeof yLabel === 'string' && yLabel && (
            <span style={{ position: 'absolute', right: 0, top: -18, fontSize: 11, fontWeight: 700, color: INK2, whiteSpace: 'nowrap' }}>
              {yLabel}
            </span>
          )}
        </div>

        {/* Plot stage */}
        <div style={{ position: 'relative', width: '100%', height: plotH + 28 }}>
          <svg
            viewBox={`0 0 ${vbW} ${vbH}`}
            preserveAspectRatio="none"
            style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: plotH, display: 'block', overflow: 'visible' }}
          >
            {/* Optional optimal quadrant tint */}
            {quadRect && (
              <rect
                x={quadRect.left}
                y={quadRect.top}
                width={quadRect.width}
                height={quadRect.height}
                fill={OK}
                fillOpacity={0.07}
                stroke={OK}
                strokeOpacity={0.28}
                strokeDasharray="5 5"
                strokeWidth={1.2}
                vectorEffect="non-scaling-stroke"
              />
            )}

            {/* Gridlines */}
            {yTicks.map((tk) => (
              <line
                key={`y_${tk}`}
                x1={0}
                x2={vbW}
                y1={yScale(tk)}
                y2={yScale(tk)}
                stroke={LINE}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {xTicks.map((tk) => (
              <line
                key={`x_${tk}`}
                x1={xScale(tk)}
                x2={xScale(tk)}
                y1={0}
                y2={vbH}
                stroke={LINE}
                strokeWidth={1}
                strokeDasharray="3 4"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {/* Axes border */}
            <line x1={0} x2={0} y1={0} y2={vbH} stroke={LINE_STRONG} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            <line x1={0} x2={vbW} y1={vbH} y2={vbH} stroke={LINE_STRONG} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />

            {/* Auto-computed Pareto frontier polyline */}
            {frontierPath && (
              <path
                d={frontierPath}
                fill="none"
                stroke={OK}
                strokeWidth={2.2}
                strokeDasharray="7 5"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                data-jpareto="frontier"
              />
            )}
          </svg>

          {/* Zero-stretch quadrant label */}
          {quadObj?.label && quadRect && (
            <span
              style={{
                position: 'absolute',
                left: quadCorner.endsWith('left') ? 10 : `${(quadRect.left / vbW) * 100 + 1}%`,
                top: quadCorner.startsWith('top') ? 8 : quadRect.top + 8,
                fontSize: 11.5,
                fontWeight: 800,
                color: OK,
                pointerEvents: 'none',
                zIndex: 1,
              }}
            >
              {quadObj.label}
            </span>
          )}

          {/* Addressable points */}
          {points.map((pt, index) => {
            const isHighlight = pt.tier === 'highlight';
            const isFrontier = pt.tier === 'frontier' || (pt.tier === undefined && frontierSet.has(pt));
            const isDominated = pt.tier === 'dominated' || (pt.tier === undefined && !isFrontier && paretoCorner !== false);
            const fill = pt.color
              ? vizColor(pt.color)
              : isHighlight
                ? OK
                : isFrontier
                  ? ACCENT
                  : '#94a3b8';
            const radius = typeof pt.r === 'number' && Number.isFinite(pt.r) ? pt.r : isHighlight ? 9 : isFrontier ? 7 : 6;
            const pxPct = (xScale(pt.x) / vbW) * 100;
            const pyPx = yScale(pt.y);
            const pyPct = (pyPx / vbH) * 100;

            return (
              <ScatterDot
                key={pt.id ?? `${pt.label}_${index}`}
                pt={pt}
                pxPct={pxPct}
                pyPx={pyPx}
                pyPct={pyPct}
                fill={fill}
                radius={radius}
                isHighlight={isHighlight}
                isDominated={isDominated}
                dimmed={isDimmed(pt.id, pt.label, pt.group)}
                animate={animate}
                index={index}
                xUnit={xUnit}
                yUnit={yUnit}
                anchors={anchors}
              />
            );
          })}

          {/* X-axis ticks & label */}
          {xTicks.map((tk, i) => (
            <span
              key={tk}
              style={{
                position: 'absolute',
                left: `${(xScale(tk) / vbW) * 100}%`,
                top: plotH + 8,
                transform: i === 0 ? 'none' : i === xTicks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
                fontFamily: MONO,
                fontSize: 11,
                color: DIMMED,
                whiteSpace: 'nowrap',
              }}
            >
              {formatNumber(tk, xUnit)}
            </span>
          ))}
          {typeof xLabel === 'string' && xLabel && (
            <span
              style={{
                position: 'absolute',
                right: 0,
                top: plotH + 22,
                fontSize: 11,
                fontWeight: 700,
                color: INK2,
                whiteSpace: 'nowrap',
              }}
            >
              {xLabel}
            </span>
          )}
        </div>
      </div>
    </figure>
  );
}
