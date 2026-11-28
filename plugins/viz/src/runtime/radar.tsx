import type { ComponentCtx, PluginIRNode } from '@joplo-app/kit/plugin';
import { motion, useRoot } from '@joplo-app/kit/renderer';
import type { RadarAxisInput, RadarSeriesInput } from '../components.ts';
import { ChartHeader, useAnchorAttrs, useVizChart } from './hooks.tsx';
import {
  DIMMED,
  EASE_OUT_EXPO,
  INK,
  LINE,
  LINE_STRONG,
  MONO,
  SURFACE,
  VIZ_FONT_SANS,
  arr,
  dim,
  num,
  str,
  vizColor,
} from './tokens.ts';

function polarPoint(cx: number, cy: number, r: number, index: number, count: number): [number, number] {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

function polygonPoints(pts: [number, number][]): string {
  return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}

function RadarSeriesLayer({
  seriesItem,
  axes,
  defaultMax,
  cx,
  cy,
  radius,
  color,
  dimmed,
  animate,
  anchors,
}: {
  seriesItem: RadarSeriesInput;
  axes: RadarAxisInput[];
  defaultMax: number;
  cx: number;
  cy: number;
  radius: number;
  color: string;
  dimmed: boolean;
  animate: boolean;
  anchors: Map<string, PluginIRNode>;
}) {
  const anchorProps = useAnchorAttrs(anchors, seriesItem.id, seriesItem.name);
  const count = axes.length;
  const pts: [number, number][] = axes.map((ax, i) => {
    const raw = Array.isArray(seriesItem.values)
      ? seriesItem.values[i]
      : (seriesItem.values as Record<string, number>)[ax.key];
    const val = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
    const maxV = typeof ax.max === 'number' && ax.max > 0 ? ax.max : defaultMax;
    const frac = Math.max(0, Math.min(1, val / maxV));
    return polarPoint(cx, cy, radius * frac, i, count);
  });

  return (
    <motion.g
      {...anchorProps}
      data-jseries={seriesItem.id ?? seriesItem.name}
      initial={false}
      animate={{ opacity: dimmed ? 0.16 : 1 }}
      transition={animate ? { duration: 0.3, ease: EASE_OUT_EXPO } : { duration: 0 }}
    >
      <polygon
        points={polygonPoints(pts)}
        fill={color}
        fillOpacity={seriesItem.dashed ? 0.08 : 0.16}
        stroke={color}
        strokeWidth={seriesItem.dashed ? 2 : 2.6}
        strokeDasharray={seriesItem.dashed ? '5 4' : undefined}
        strokeLinejoin="round"
      />
      {pts.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={seriesItem.dashed ? 3.2 : 4.2}
          fill={SURFACE}
          stroke={color}
          strokeWidth={2.2}
        />
      ))}
    </motion.g>
  );
}

export function RadarView({ ctx }: { ctx: ComponentCtx }) {
  const { node, p, animate, anchors, isDimmed } = useVizChart(ctx);
  const {
    title,
    subtitle,
    axes: rawAxes,
    series: rawSeries,
    levels: rawLevels,
    max: rawMax,
    showTicks,
    seriesIds: _sids,
    w,
    h,
    ...rest
  } = p;

  const H = num(h, 280)!;
  const root = useRoot(node, rest, {
    style: {
      width: dim(w) ?? '100%',
      minWidth: 0,
      fontFamily: VIZ_FONT_SANS,
      color: INK,
    },
  });

  const axes = arr(rawAxes).filter(
    (a): a is RadarAxisInput => !!a && typeof a === 'object' && typeof (a as RadarAxisInput).key === 'string',
  );
  const series = arr(rawSeries).filter(
    (s): s is RadarSeriesInput => !!s && typeof s === 'object' && typeof (s as RadarSeriesInput).name === 'string',
  );

  if (axes.length < 3 || !series.length) {
    return <div {...root} role="status">Radar · requires at least 3 axes and 1 series</div>;
  }

  const levels = Math.max(2, Math.min(6, Math.round(num(rawLevels, 3)!)));
  const maxVal = Math.max(1, num(rawMax, 100)!);
  const size = Math.max(210, H - 36);
  const vb = 340;
  const cx = vb / 2;
  const cy = vb / 2;
  const radius = 104;

  const seriesPalette = series.map((s, i) => ({
    ...s,
    resolvedColor: vizColor(s.color, i),
  }));

  return (
    <figure {...root} style={{ ...root.style, margin: 0 }} aria-label={typeof title === 'string' ? title : 'Radar'}>
      <ChartHeader
        title={typeof title === 'string' ? title : undefined}
        subtitle={typeof subtitle === 'string' ? subtitle : undefined}
        right={
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: DIMMED }}>
            {seriesPalette.map((s) => (
              <span key={s.id ?? s.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, color: INK }}>
                <span
                  aria-hidden
                  style={{
                    width: 12,
                    height: 3,
                    borderRadius: 2,
                    background: s.resolvedColor,
                    borderBottom: s.dashed ? `1px dashed ${s.resolvedColor}` : undefined,
                  }}
                />
                {s.name}
              </span>
            ))}
          </div>
        }
      />

      <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
        <svg viewBox={`0 0 ${vb} ${vb}`} style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}>
          {/* Polygonal spiderweb rings (never plain circles!) */}
          {Array.from({ length: levels }, (_, idx) => {
            const frac = (idx + 1) / levels;
            const ringPts = axes.map((_, ai) => polarPoint(cx, cy, radius * frac, ai, axes.length));
            return (
              <polygon
                key={idx}
                points={polygonPoints(ringPts)}
                fill={idx === levels - 1 ? 'rgba(241, 245, 249, 0.45)' : 'none'}
                stroke={idx === levels - 1 ? LINE_STRONG : LINE}
                strokeWidth={idx === levels - 1 ? 1.3 : 1}
                data-jring={idx + 1}
              />
            );
          })}

          {/* Radial spokes */}
          {axes.map((ax, i) => {
            const [x, y] = polarPoint(cx, cy, radius, i, axes.length);
            return <line key={ax.key} x1={cx} y1={cy} x2={x} y2={y} stroke={LINE} strokeWidth={1} />;
          })}

          {/* Numeric scale ticks along the top spoke */}
          {showTicks !== false &&
            Array.from({ length: levels }, (_, idx) => {
              const frac = (idx + 1) / levels;
              const tickVal = Math.round(maxVal * frac);
              const ty = cy - radius * frac;
              return (
                <text
                  key={idx}
                  x={cx + 5}
                  y={ty + 3}
                  fontSize={9.5}
                  fontFamily={MONO}
                  fontWeight={700}
                  fill={DIMMED}
                >
                  {tickVal}
                </text>
              );
            })}

          {/* Series polygons */}
          {seriesPalette.map((s) => (
            <RadarSeriesLayer
              key={s.id ?? s.name}
              seriesItem={s}
              axes={axes}
              defaultMax={maxVal}
              cx={cx}
              cy={cy}
              radius={radius}
              color={s.resolvedColor}
              dimmed={isDimmed(s.id, s.name)}
              animate={animate}
              anchors={anchors}
            />
          ))}
        </svg>

        {/* Zero-stretch HTML vertex labels + delta score badges */}
        {axes.map((ax, i) => {
          const [vx, vy] = polarPoint(cx, cy, radius + 30, i, axes.length);
          const leftPct = (vx / vb) * 100;
          const topPct = (vy / vb) * 100;
          const align = vx < cx - 18 ? 'right' : vx > cx + 18 ? 'left' : 'center';
          const transform =
            align === 'right'
              ? 'translate(-100%, -50%)'
              : align === 'left'
                ? 'translate(0%, -50%)'
                : 'translate(-50%, -50%)';

          return (
            <div
              key={ax.key}
              style={{
                position: 'absolute',
                left: `${leftPct}%`,
                top: `${topPct}%`,
                transform,
                display: 'flex',
                flexDirection: 'column',
                alignItems: align === 'right' ? 'flex-end' : align === 'left' ? 'flex-start' : 'center',
                gap: 2,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}
            >
              <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>{str(ax.label)}</span>
              {ax.deltaLabel && (
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    fontWeight: 800,
                    color: seriesPalette[seriesPalette.length - 1]?.resolvedColor ?? INK,
                  }}
                >
                  {ax.deltaLabel}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </figure>
  );
}
