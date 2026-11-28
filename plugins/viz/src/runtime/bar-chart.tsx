import { scaleLinear, scaleLog } from 'd3-scale';
import type { ComponentCtx, PluginIRNode } from '@joplo-app/kit/plugin';
import { motion, useRoot } from '@joplo-app/kit/renderer';
import type { BarChartRow } from '../components.ts';
import type { ChartSeriesInput } from '../schema.ts';
import { ChartHeader, useAnchorAttrs, useVizChart } from './hooks.tsx';
import {
  DIMMED,
  EASE_OUT_EXPO,
  INK,
  LINE,
  LINE_STRONG,
  MONO,
  OK,
  SUBTLE,
  VIZ_FONT_SANS,
  arr,
  dim,
  formatNumber,
  num,
  str,
  tint,
  vizColor,
} from './tokens.ts';

function BarItemVertical({
  row,
  id,
  label,
  series,
  stacked,
  scale,
  plotH,
  unit,
  directLabels,
  animate,
  dimmed,
  anchors,
}: {
  row: BarChartRow;
  id?: string;
  label: string;
  series: { name: string; label: string; color: string }[];
  stacked: boolean;
  scale: (v: number) => number;
  plotH: number;
  unit: string;
  directLabels: boolean;
  animate: boolean;
  dimmed: boolean;
  anchors: Map<string, PluginIRNode>;
}) {
  const anchorProps = useAnchorAttrs(anchors, id, label);
  const vals = series.map((s) => {
    const raw = row[s.name];
    return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, raw) : 0;
  });
  const total = vals.reduce((a, b) => a + b, 0);
  const transition = animate ? { duration: 0.62, ease: EASE_OUT_EXPO } : { duration: 0 };

  return (
    <div
      {...anchorProps}
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        height: '100%',
        justifyContent: 'flex-end',
        opacity: dimmed ? 0.25 : 1,
        transition: animate ? 'opacity 260ms ease' : undefined,
      }}
    >
      {row.deltaBadge && (
        <span
          style={{
            marginBottom: 4,
            padding: '2px 8px',
            borderRadius: 999,
            background: tint(OK, 14),
            color: OK,
            fontFamily: MONO,
            fontSize: 11.5,
            fontWeight: 850,
            whiteSpace: 'nowrap',
          }}
        >
          {row.deltaBadge}
        </span>
      )}
      {directLabels && stacked && (
        <span style={{ marginBottom: 6, fontFamily: MONO, fontSize: 13.5, fontWeight: 850, color: row.color ? vizColor(row.color) : INK }}>
          {formatNumber(total, unit)}
        </span>
      )}

      {stacked ? (
        <div
          style={{
            width: 'min(86px, 72%)',
            display: 'flex',
            flexDirection: 'column-reverse',
            gap: 2,
          }}
        >
          {series.map((s, si) => {
            const v = vals[si]!;
            if (v <= 0) return null;
            const totalH = Math.max(6, scale(total));
            const segH = total > 0 ? Math.max(10, (v / total) * totalH) : 0;
            const c = si === 0 && row.color ? vizColor(row.color) : s.color;
            return (
              <motion.div
                key={s.name}
                initial={false}
                animate={{ height: segH }}
                transition={transition}
                data-jbar={`${s.name}:${label}`}
                style={{
                  width: '100%',
                  borderRadius: si === series.length - 1 || vals.slice(si + 1).every((x) => x <= 0) ? '7px 7px 2px 2px' : 2,
                  background: c,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                {segH >= 18 && series.filter((_, j) => vals[j]! > 0).length > 1 && (
                  <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap' }}>
                    {formatNumber(v)}
                  </span>
                )}
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 6, width: '100%', height: plotH }}>
          {series.map((s, si) => {
            const v = vals[si]!;
            const barH = Math.max(v > 0 ? 6 : 0, scale(v));
            const c = series.length === 1 && row.color ? vizColor(row.color) : s.color;
            return (
              <div key={s.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 1 68px', width: series.length === 1 ? 'min(82px, 70%)' : undefined }}>
                {directLabels && (
                  <span style={{ marginBottom: 5, fontFamily: MONO, fontSize: 12.5, fontWeight: 800, color: c, whiteSpace: 'nowrap' }}>
                    {formatNumber(v, unit)}
                  </span>
                )}
                <motion.div
                  initial={false}
                  animate={{ height: barH }}
                  transition={transition}
                  data-jbar={`${s.name}:${label}`}
                  style={{
                    width: '100%',
                    borderRadius: '7px 7px 0 0',
                    background: c,
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BarItemHorizontal({
  row,
  idx,
  id,
  label,
  series,
  stacked,
  scale,
  unit,
  showDirect,
  refObj,
  animate,
  dimmed,
  anchors,
}: {
  row: BarChartRow;
  idx: number;
  id?: string;
  label: string;
  series: { name: string; label: string; color: string }[];
  stacked: boolean;
  scale: (v: number) => number;
  unit: string;
  showDirect: boolean;
  refObj: { value: number; label?: string; color?: string } | null;
  animate: boolean;
  dimmed: boolean;
  anchors: Map<string, PluginIRNode>;
}) {
  const anchorProps = useAnchorAttrs(anchors, id, label);
  const locked = row.locked === true;
  const vals = series.map((s) => (typeof row[s.name] === 'number' && Number.isFinite(row[s.name] as number) ? Math.max(0, row[s.name] as number) : 0));
  const total = vals.reduce((a, b) => a + b, 0);
  const primaryColor = row.color ? vizColor(row.color) : locked ? OK : series[0]!.color;
  const transition = animate ? { duration: 0.68, delay: idx * 0.08, ease: EASE_OUT_EXPO } : { duration: 0 };

  return (
    <div
      {...anchorProps}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
        opacity: dimmed ? 0.26 : 1,
        transition: animate ? 'opacity 260ms ease' : undefined,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: INK }}>{label}</span>
          {locked && (
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 999,
                background: tint(OK, 14),
                color: OK,
                fontSize: 11,
                fontWeight: 850,
                letterSpacing: 0.2,
              }}
            >
              {typeof row.lockedLabel === 'string' ? row.lockedLabel : 'LOCKED · 不变量'}
            </span>
          )}
        </div>
        {showDirect && (
          <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 850, color: primaryColor }}>
            {typeof row.note === 'string' ? row.note : formatNumber(stacked ? total : vals[0]!, unit)}
          </span>
        )}
      </div>

      <div style={{ position: 'relative', height: 26, borderRadius: 7, background: SUBTLE }}>
        {stacked ? (
          <div style={{ display: 'flex', height: '100%', width: '100%', borderRadius: 7, overflow: 'hidden' }}>
            {series.map((s, si) => (
              <motion.div
                key={s.name}
                initial={false}
                animate={{ width: `${scale(vals[si]!)}%` }}
                transition={transition}
                data-jbar={`${s.name}:${idx}`}
                style={{ height: '100%', background: si === 0 && row.color ? vizColor(row.color) : s.color }}
              />
            ))}
          </div>
        ) : (
          <motion.div
            initial={false}
            animate={{ width: `${scale(vals[0]!)}%` }}
            transition={transition}
            data-jbar={`${series[0]!.name}:${idx}`}
            style={{
              height: '100%',
              borderRadius: 7,
              background: primaryColor,
            }}
          />
        )}
        {locked && (
          <div
            style={{
              position: 'absolute',
              left: `${scale(vals[0]!)}%`,
              top: -5,
              bottom: -5,
              borderLeft: `2px solid ${OK}`,
            }}
          />
        )}
        {refObj && (
          <div
            style={{
              position: 'absolute',
              left: `${scale(refObj.value)}%`,
              top: -4,
              bottom: -4,
              borderLeft: `1.5px dashed ${refObj.color ? vizColor(refObj.color) : LINE_STRONG}`,
            }}
          />
        )}
      </div>
    </div>
  );
}

export function BarChartView({ ctx }: { ctx: ComponentCtx }) {
  const { node, p, animate, anchors, isDimmed } = useVizChart(ctx);
  const {
    title,
    subtitle,
    data: rawData,
    dataKey,
    series: rawSeries,
    orientation,
    layout,
    scale: scaleMode,
    unit: rawUnit,
    referenceLine,
    directLabels,
    withLegend,
    itemIds: _ids,
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

  const rows = arr(rawData).filter((r): r is BarChartRow => !!r && typeof r === 'object');
  const key = str(dataKey);
  const series = arr(rawSeries)
    .filter((s): s is ChartSeriesInput => !!s && typeof s === 'object' && typeof (s as ChartSeriesInput).name === 'string')
    .map((s, i) => ({
      name: s.name,
      label: s.label ?? s.name,
      color: vizColor(s.color, i),
    }));

  if (!rows.length || !series.length) return <div {...root} role="status">BarChart · no data</div>;

  const stacked = layout === 'stacked';
  const horizontal = orientation === 'horizontal';
  const unit = str(rawUnit);
  const showDirect = directLabels !== false;
  const showLegend = withLegend === true || (withLegend !== false && series.length > 1 && !horizontal);

  const refObj =
    referenceLine && typeof referenceLine === 'object' && typeof (referenceLine as { value?: unknown }).value === 'number'
      ? (referenceLine as { value: number; label?: string; color?: string })
      : null;

  const peak = Math.max(
    1,
    refObj?.value ?? 0,
    ...rows.map((r) => {
      const vals = series.map((s) => (typeof r[s.name] === 'number' && Number.isFinite(r[s.name] as number) ? Math.max(0, r[s.name] as number) : 0));
      return stacked ? vals.reduce((a, b) => a + b, 0) : Math.max(0, ...vals);
    }),
  );

  // Horizontal mode (supports invariant-locked bars + zero-stretch labels)
  if (horizontal) {
    const scale = scaleLinear().domain([0, peak]).range([0, 100]).clamp(true);
    return (
      <figure {...root} style={{ ...root.style, margin: 0 }} aria-label={typeof title === 'string' ? title : 'BarChart'}>
        <ChartHeader title={typeof title === 'string' ? title : undefined} subtitle={typeof subtitle === 'string' ? subtitle : undefined} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {rows.map((row, idx) => {
            const label = str(row[key]);
            const id = typeof row.id === 'string' ? row.id : undefined;
            return (
              <BarItemHorizontal
                key={id ?? `${label}_${idx}`}
                row={row}
                idx={idx}
                id={id}
                label={label}
                series={series}
                stacked={stacked}
                scale={scale}
                unit={unit}
                showDirect={showDirect}
                refObj={refObj}
                animate={animate}
                dimmed={isDimmed(id, label)}
                anchors={anchors}
              />
            );
          })}
        </div>
      </figure>
    );
  }

  // Vertical mode (grouped & stacked, linear or log scale, crisp HTML axis & direct labels)
  const plotH = Math.max(140, H - (showLegend ? 72 : 46));
  const rawScale =
    scaleMode === 'log'
      ? scaleLog().domain([1, Math.max(10, peak)]).range([14, plotH - 42]).clamp(true)
      : scaleLinear().domain([0, peak]).range([0, plotH - 42]).clamp(true);
  const scaleFn = (v: number) => (v <= 0 ? 0 : rawScale(scaleMode === 'log' ? Math.max(1, v) : v));

  return (
    <figure {...root} style={{ ...root.style, margin: 0 }} aria-label={typeof title === 'string' ? title : 'BarChart'}>
      <ChartHeader title={typeof title === 'string' ? title : undefined} subtitle={typeof subtitle === 'string' ? subtitle : undefined} />
      <div
        style={{
          position: 'relative',
          height: plotH,
          display: 'flex',
          alignItems: 'flex-end',
          gap: 16,
          padding: '0 10px',
          borderBottom: `1.5px solid ${LINE_STRONG}`,
        }}
      >
        {[0.33, 0.66, 1].map((frac) => (
          <div
            key={frac}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: (plotH - 42) * frac,
              borderTop: `1px solid ${LINE}`,
              pointerEvents: 'none',
            }}
          />
        ))}

        {refObj && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: scaleFn(refObj.value),
              borderTop: `1.5px dashed ${refObj.color ? vizColor(refObj.color) : LINE_STRONG}`,
              pointerEvents: 'none',
            }}
          >
            {refObj.label && (
              <span
                style={{
                  position: 'absolute',
                  right: 2,
                  top: -18,
                  fontSize: 11,
                  fontWeight: 800,
                  fontFamily: MONO,
                  color: refObj.color ? vizColor(refObj.color) : DIMMED,
                }}
              >
                {refObj.label}
              </span>
            )}
          </div>
        )}

        {rows.map((row, idx) => {
          const label = str(row[key]);
          const id = typeof row.id === 'string' ? row.id : undefined;
          return (
            <BarItemVertical
              key={id ?? `${label}_${idx}`}
              row={row}
              id={id}
              label={label}
              series={series}
              stacked={stacked}
              scale={scaleFn}
              plotH={plotH}
              unit={unit}
              directLabels={showDirect}
              animate={animate}
              dimmed={isDimmed(id, label)}
              anchors={anchors}
            />
          );
        })}
      </div>

      {/* Zero-stretch HTML X labels */}
      <div style={{ display: 'flex', gap: 16, padding: '8px 10px 0' }}>
        {rows.map((row, idx) => {
          const label = str(row[key]);
          return (
            <div key={idx} style={{ flex: 1, minWidth: 0, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 750, color: INK }}>{label}</span>
              {typeof row.note === 'string' && <span style={{ fontSize: 11.5, color: DIMMED }}>{row.note}</span>}
            </div>
          );
        })}
      </div>

      {showLegend && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center', marginTop: 12, fontSize: 12, color: DIMMED }}>
          {series.map((s) => (
            <span key={s.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </figure>
  );
}
