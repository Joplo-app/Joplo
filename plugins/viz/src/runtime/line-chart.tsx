import { scaleLinear, scalePoint } from 'd3-scale';
import { area as d3Area, curveLinear, curveMonotoneX, line as d3Line } from 'd3-shape';
import type { ComponentCtx, PluginIRNode } from '@joplo-app/kit/plugin';
import { motion, useRoot } from '@joplo-app/kit/renderer';
import type { ChartSeriesInput } from '../schema.ts';
import { ChartHeader, useAnchorAttrs, useVizChart } from './hooks.tsx';
import {
  DIMMED,
  EASE_OUT_CUBIC,
  INK,
  LINE,
  LINE_STRONG,
  MONO,
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

function LinePointDot({
  seriesName,
  idx,
  ptId,
  label,
  valueText,
  pxPct,
  py,
  color,
  isFocused,
  showVal,
  animate,
  anchors,
}: {
  seriesName: string;
  idx: number;
  ptId?: string;
  label: string;
  valueText: string;
  pxPct: number;
  py: number;
  color: string;
  isFocused: boolean;
  showVal: boolean;
  animate: boolean;
  anchors: Map<string, PluginIRNode>;
}) {
  const anchorProps = useAnchorAttrs(anchors, ptId, `${label} ${valueText}`);
  const labelBelow = py < 26;
  return (
    <motion.div
      {...anchorProps}
      data-jpoint={`${seriesName}:${idx}`}
      initial={animate ? { scale: 0.4, opacity: 0 } : false}
      animate={{ scale: 1, opacity: isFocused ? 1 : 0.25 }}
      transition={animate ? { duration: 0.26, delay: idx * 0.06 } : { duration: 0 }}
      style={{
        position: 'absolute',
        left: `${pxPct}%`,
        top: py,
        width: 11,
        height: 11,
        marginLeft: -5.5,
        marginTop: -5.5,
        borderRadius: '50%',
        background: SURFACE,
        border: `2.5px solid ${color}`,
        boxSizing: 'border-box',
        zIndex: 3,
      }}
    >
      {showVal && (
        <span
          style={{
            position: 'absolute',
            left: '50%',
            top: labelBelow ? 13 : -22,
            transform: 'translateX(-50%)',
            fontFamily: MONO,
            fontSize: 11.5,
            fontWeight: 850,
            color: INK,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {valueText}
        </span>
      )}
    </motion.div>
  );
}

export function LineChartView({ ctx }: { ctx: ComponentCtx }) {
  const { node, p, animate, snap, anchors, isDimmed } = useVizChart(ctx);
  const {
    title,
    subtitle,
    data: rawData,
    dataKey,
    series: rawSeries,
    unit: rawUnit,
    yDomain: rawYDomain,
    curve,
    referenceLine,
    referenceBand,
    revealTo: propReveal,
    directLabels,
    withLegend,
    pointIds: _pids,
    w,
    h,
    ...rest
  } = p;

  const H = num(h, 240)!;
  const root = useRoot(node, rest, {
    style: {
      width: dim(w) ?? '100%',
      minWidth: 0,
      fontFamily: VIZ_FONT_SANS,
      color: INK,
    },
  });

  const rows = arr(rawData).filter((r): r is Record<string, unknown> => !!r && typeof r === 'object');
  const key = str(dataKey);
  const series = arr(rawSeries)
    .filter((s): s is ChartSeriesInput => !!s && typeof s === 'object' && typeof (s as ChartSeriesInput).name === 'string')
    .map((s, i) => ({
      name: s.name,
      label: s.label ?? s.name,
      color: vizColor(s.color, i),
      area: s.area === true,
      dashed: s.dashed === true,
    }));

  if (!rows.length || !series.length) return <div {...root} role="status">LineChart · no data</div>;

  const unit = str(rawUnit);
  const labels = rows.map((r) => str(r[key]));
  const refLine =
    referenceLine && typeof referenceLine === 'object' && typeof (referenceLine as { value?: unknown }).value === 'number'
      ? (referenceLine as { value: number; label?: string; color?: string })
      : null;
  const refBand =
    referenceBand &&
    typeof referenceBand === 'object' &&
    typeof (referenceBand as { from?: unknown }).from === 'number' &&
    typeof (referenceBand as { to?: unknown }).to === 'number'
      ? (referenceBand as { from: number; to: number; label?: string; color?: string })
      : null;

  const allVals = [
    ...series.flatMap((s) => rows.map((r) => (typeof r[s.name] === 'number' && Number.isFinite(r[s.name] as number) ? (r[s.name] as number) : 0))),
    ...(refLine ? [refLine.value] : []),
    ...(refBand ? [refBand.from, refBand.to] : []),
  ];
  const minVal = Math.min(0, ...allVals);
  const maxVal = Math.max(1, ...allVals);
  const yDomain: [number, number] =
    Array.isArray(rawYDomain) && typeof rawYDomain[0] === 'number' && typeof rawYDomain[1] === 'number'
      ? [rawYDomain[0], rawYDomain[1]]
      : [minVal, maxVal * 1.08];

  const showLegend = withLegend === true || (withLegend !== false && series.length > 1);
  const plotH = Math.max(120, H - (showLegend ? 54 : 32));
  const vbW = 1000;
  const vbH = plotH;
  const padX = 28;
  const padTop = 14;
  const padBot = 10;

  const xScale = scalePoint<number>()
    .domain(rows.map((_, i) => i))
    .range([padX, vbW - padX]);
  const yScale = scaleLinear().domain(yDomain).range([vbH - padBot, padTop]);
  const yTicks = yScale.ticks(4);

  // Reveal cutoff (effect snapshot wins over prop)
  const cutoff = snap.reveal !== undefined ? snap.reveal : (propReveal as number | string | null | undefined);
  let visibleCount = rows.length;
  if (typeof cutoff === 'number' && Number.isFinite(cutoff)) {
    visibleCount = Math.max(1, Math.min(rows.length, Math.round(cutoff)));
  } else if (typeof cutoff === 'string') {
    const idx = rows.findIndex((r, i) => labels[i] === cutoff || r.id === cutoff);
    if (idx >= 0) visibleCount = idx + 1;
  }
  const clipPct = visibleCount >= rows.length ? 100 : ((xScale(visibleCount - 1) ?? vbW) + 18) / vbW * 100;

  const curveFactory = curve === 'monotone' ? curveMonotoneX : curveLinear;
  const lineGen = d3Line<[number, number]>()
    .x((d) => d[0])
    .y((d) => d[1])
    .curve(curveFactory);
  const areaGen = d3Area<[number, number]>()
    .x((d) => d[0])
    .y0(yScale(Math.max(yDomain[0], 0)))
    .y1((d) => d[1])
    .curve(curveFactory);

  const revealTrans = animate ? { duration: 0.85, ease: EASE_OUT_CUBIC } : { duration: 0 };

  return (
    <figure {...root} style={{ ...root.style, margin: 0 }} aria-label={typeof title === 'string' ? title : 'LineChart'}>
      <ChartHeader title={typeof title === 'string' ? title : undefined} subtitle={typeof subtitle === 'string' ? subtitle : undefined} />
      <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr', columnGap: 12, alignItems: 'start' }}>
        {/* Zero-stretch HTML Y-axis ticks */}
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
              {formatNumber(tk, unit)}
            </span>
          ))}
        </div>

        {/* Plot stage: SVG crisp curves + HTML overlay labels & addressable point anchors */}
        <div style={{ position: 'relative', width: '100%', height: plotH + 28 }}>
          {/* Horizontal gridlines */}
          {yTicks.map((tk) => (
            <div
              key={tk}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: yScale(tk),
                borderTop: tk === yDomain[0] ? `1.5px solid ${LINE_STRONG}` : `1px solid ${LINE}`,
                pointerEvents: 'none',
              }}
            />
          ))}

          {/* Optional ReferenceBand */}
          {refBand && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: Math.min(yScale(refBand.from), yScale(refBand.to)),
                height: Math.abs(yScale(refBand.from) - yScale(refBand.to)),
                background: tint(refBand.color ? vizColor(refBand.color) : vizColor('ok'), 12),
                pointerEvents: 'none',
              }}
            />
          )}

          {/* Optional ReferenceLine */}
          {refLine && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: yScale(refLine.value),
                borderTop: `1.5px dashed ${refLine.color ? vizColor(refLine.color) : vizColor('ok')}`,
                pointerEvents: 'none',
                zIndex: 1,
              }}
            >
              {refLine.label && (
                <span
                  style={{
                    position: 'absolute',
                    right: 54,
                    top: -20,
                    fontSize: 11,
                    fontWeight: 800,
                    fontFamily: MONO,
                    color: refLine.color ? vizColor(refLine.color) : vizColor('ok'),
                    background: SURFACE,
                    padding: '1px 6px',
                    borderRadius: 4,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {refLine.label}
                </span>
              )}
            </div>
          )}

          {/* Smooth left-to-right width-clip container (zero FLIP distortion!) */}
          <motion.div
            initial={false}
            animate={{ width: `${clipPct}%` }}
            transition={revealTrans}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: plotH,
              overflow: 'hidden',
              zIndex: 2,
            }}
          >
            <svg
              viewBox={`0 0 ${vbW} ${vbH}`}
              preserveAspectRatio="none"
              style={{ width: `${(100 / Math.max(clipPct, 0.1)) * 100}%`, height: plotH, display: 'block', overflow: 'visible' }}
            >
              {series.map((s) => {
                const pts = rows.map((r, i): [number, number] => [
                  xScale(i) ?? 0,
                  yScale(typeof r[s.name] === 'number' && Number.isFinite(r[s.name] as number) ? (r[s.name] as number) : 0),
                ]);
                const dLine = lineGen(pts) ?? '';
                const dArea = s.area ? (areaGen(pts) ?? '') : '';
                const dimmed = isDimmed(s.name, s.label);
                return (
                  <g key={s.name} style={{ opacity: dimmed ? 0.22 : 1 }}>
                    {dArea && <path d={dArea} fill={s.color} fillOpacity={0.11} />}
                    <path
                      d={dLine}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={2.6}
                      strokeDasharray={s.dashed ? '6 5' : undefined}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                );
              })}
            </svg>
          </motion.div>

          {/* Addressable HTML data points & zero-stretch direct labels */}
          {series.map((s, si) => {
            const dimmedSeries = isDimmed(s.name, s.label);
            return rows.map((r, idx) => {
              if (idx >= visibleCount) return null;
              const rawV = typeof r[s.name] === 'number' && Number.isFinite(r[s.name] as number) ? (r[s.name] as number) : 0;
              const pxPct = ((xScale(idx) ?? 0) / vbW) * 100;
              const py = yScale(rawV);
              const ptId = si === 0 && typeof r.id === 'string' ? r.id : undefined;
              const isFocusedPt = ptId ? !isDimmed(ptId) : !dimmedSeries;
              const showVal = directLabels !== false && series.length === 1;

              return (
                <LinePointDot
                  key={`${s.name}_${idx}`}
                  seriesName={s.name}
                  idx={idx}
                  ptId={ptId}
                  label={labels[idx] ?? ''}
                  valueText={formatNumber(rawV, unit)}
                  pxPct={pxPct}
                  py={py}
                  color={s.color}
                  isFocused={isFocusedPt}
                  showVal={showVal}
                  animate={animate}
                  anchors={anchors}
                />
              );
            });
          })}

          {/* Zero-stretch HTML X-axis labels */}
          {labels.map((lbl, idx) => (
            <span
              key={`${lbl}_${idx}`}
              style={{
                position: 'absolute',
                left: `${((xScale(idx) ?? 0) / vbW) * 100}%`,
                top: plotH + 8,
                transform: 'translateX(-50%)',
                fontSize: 12,
                fontWeight: 650,
                color: DIMMED,
                whiteSpace: 'nowrap',
              }}
            >
              {lbl}
            </span>
          ))}
        </div>
      </div>

      {showLegend && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center', marginTop: 10, fontSize: 12, color: DIMMED }}>
          {series.map((s) => (
            <span key={s.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span aria-hidden style={{ width: 12, height: 3, borderRadius: 2, background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </figure>
  );
}
