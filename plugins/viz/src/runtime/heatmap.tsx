import type { ComponentCtx, PluginIRNode } from '@joplo-app/kit/plugin';
import { motion, useRoot } from '@joplo-app/kit/renderer';
import { ChartHeader, useAnchorAttrs, useVizChart } from './hooks.tsx';
import {
  ACCENT,
  DIMMED,
  EASE_OUT_EXPO,
  INK,
  INK2,
  MONO,
  VIZ_FONT_SANS,
  arr,
  dim,
  str,
} from './tokens.ts';

type RGB = [number, number, number];

const SEQ_RAMPS: Record<'indigo' | 'emerald' | 'amber' | 'crimson', [RGB, RGB]> = {
  indigo: [[241, 245, 255], [34, 49, 221]],
  emerald: [[236, 253, 245], [15, 138, 95]],
  amber: [[255, 251, 235], [217, 119, 6]],
  crimson: [[254, 242, 242], [220, 38, 38]],
};

function lerpRgb(a: RGB, b: RGB, t: number): string {
  const c = Math.max(0, Math.min(1, t));
  const r = Math.round(a[0] + (b[0] - a[0]) * c);
  const g = Math.round(a[1] + (b[1] - a[1]) * c);
  const bl = Math.round(a[2] + (b[2] - a[2]) * c);
  return `rgb(${r}, ${g}, ${bl})`;
}

function cellColors(
  val: number,
  domain: [number, number],
  scaleName: 'indigo' | 'emerald' | 'amber' | 'crimson' | 'diverging',
): { bg: string; fg: string } {
  const [min, max] = domain;
  const span = Math.max(1e-9, max - min);
  if (scaleName === 'diverging') {
    const mid = min < 0 && max > 0 ? 0 : (min + max) / 2;
    const negSpan = Math.max(1e-9, mid - min);
    const posSpan = Math.max(1e-9, max - mid);
    if (val >= mid) {
      const t = Math.min(1, (val - mid) / posSpan);
      return {
        bg: lerpRgb([248, 250, 252], [34, 49, 221], t),
        fg: t >= 0.54 ? '#ffffff' : INK,
      };
    }
    const t = Math.min(1, (mid - val) / negSpan);
    return {
      bg: lerpRgb([248, 250, 252], [220, 38, 38], t),
      fg: t >= 0.54 ? '#ffffff' : INK,
    };
  }

  const t = Math.max(0, Math.min(1, (val - min) / span));
  const [lo, hi] = SEQ_RAMPS[scaleName];
  return {
    bg: lerpRgb(lo, hi, t),
    fg: t >= 0.52 ? '#ffffff' : INK,
  };
}

function formatCellValue(v: number, fmt: string): string {
  if (!Number.isFinite(v)) return '—';
  if (fmt === 'percent') return `${Math.round(v * 100)}%`;
  if (fmt === 'int') return String(Math.round(v));
  return v.toFixed(2);
}

function HeatmapCell({
  ri,
  ci,
  rowLabel,
  colLabel,
  value,
  text,
  bg,
  fg,
  cellId,
  dimmed,
  emphasized,
  animate,
  anchors,
}: {
  ri: number;
  ci: number;
  rowLabel: string;
  colLabel: string;
  value: number;
  text: string;
  bg: string;
  fg: string;
  cellId?: string;
  dimmed: boolean;
  emphasized: boolean;
  animate: boolean;
  anchors: Map<string, PluginIRNode>;
}) {
  const anchorProps = useAnchorAttrs(anchors, cellId, `${rowLabel} × ${colLabel}: ${text}`);
  return (
    <motion.div
      {...anchorProps}
      data-jcell={`${ri}:${ci}`}
      title={`${rowLabel} × ${colLabel}: ${value}`}
      initial={false}
      animate={{ opacity: dimmed ? 0.2 : 1, scale: emphasized ? 1.03 : 1 }}
      transition={animate ? { duration: 0.28, ease: EASE_OUT_EXPO } : { duration: 0 }}
      style={{
        height: 44,
        borderRadius: 8,
        background: bg,
        color: fg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: MONO,
        fontSize: 12.5,
        fontWeight: emphasized ? 900 : 750,
        boxShadow: emphasized ? `0 0 0 2px ${ACCENT}` : undefined,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {text}
    </motion.div>
  );
}

export function HeatmapView({ ctx }: { ctx: ComponentCtx }) {
  const { node, p, animate, anchors, focusSet, isDimmed } = useVizChart(ctx);
  const {
    title,
    subtitle,
    rows: rawRows,
    cols: rawCols,
    values: rawValues,
    domain: rawDomain,
    colorScale,
    format: rawFormat,
    cornerLabel,
    showScale,
    cellAnchors: rawCellAnchors,
    cellIds: _cids,
    w,
    h,
    ...rest
  } = p;

  const root = useRoot(node, rest, {
    style: {
      width: dim(w) ?? '100%',
      height: dim(h),
      minWidth: 0,
      fontFamily: VIZ_FONT_SANS,
      color: INK,
    },
  });

  const rows = arr(rawRows).map((r) => str(r));
  const cols = arr(rawCols).map((c) => str(c));
  const values = arr(rawValues).map((row) =>
    arr(row).map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)),
  );

  if (!rows.length || !cols.length || !values.length) {
    return <div {...root} role="status">Heatmap · no data</div>;
  }

  const flat = values.flat();
  const minVal = Math.min(...flat);
  const maxVal = Math.max(...flat);
  const domain: [number, number] =
    Array.isArray(rawDomain) && typeof rawDomain[0] === 'number' && typeof rawDomain[1] === 'number'
      ? [rawDomain[0], rawDomain[1]]
      : [minVal, maxVal === minVal ? minVal + 1 : maxVal];

  const scaleName: 'indigo' | 'emerald' | 'amber' | 'crimson' | 'diverging' =
    colorScale === 'emerald' || colorScale === 'amber' || colorScale === 'crimson' || colorScale === 'diverging'
      ? colorScale
      : 'indigo';
  const fmt = typeof rawFormat === 'string' ? rawFormat : 'fixed2';
  const cellAnchors =
    rawCellAnchors && typeof rawCellAnchors === 'object'
      ? (rawCellAnchors as Record<string, string>)
      : {};

  const gradientCss =
    scaleName === 'diverging'
      ? `linear-gradient(90deg, ${lerpRgb([220, 38, 38], [220, 38, 38], 1)}, rgb(248,250,252), ${lerpRgb([34, 49, 221], [34, 49, 221], 1)})`
      : `linear-gradient(90deg, ${lerpRgb(SEQ_RAMPS[scaleName][0], SEQ_RAMPS[scaleName][1], 0)}, ${lerpRgb(SEQ_RAMPS[scaleName][0], SEQ_RAMPS[scaleName][1], 1)})`;

  return (
    <figure {...root} style={{ ...root.style, margin: 0 }} aria-label={typeof title === 'string' ? title : 'Heatmap'}>
      <ChartHeader title={typeof title === 'string' ? title : undefined} subtitle={typeof subtitle === 'string' ? subtitle : undefined} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `minmax(58px, auto) repeat(${cols.length}, minmax(44px, 1fr))`,
          gap: 7,
          alignItems: 'center',
        }}
      >
        {/* Header row */}
        <div style={{ fontSize: 11.5, fontFamily: MONO, color: DIMMED, paddingRight: 4 }}>
          {str(cornerLabel)}
        </div>
        {cols.map((col) => {
          const colFocused = focusSet ? focusSet.has(`col:${col}`) || focusSet.has(col) : false;
          return (
            <div
              key={col}
              style={{
                textAlign: 'center',
                fontSize: 12.5,
                fontWeight: colFocused ? 850 : 700,
                color: colFocused ? ACCENT : INK2,
                paddingBottom: 2,
                whiteSpace: 'nowrap',
              }}
            >
              {col}
            </div>
          );
        })}

        {/* Matrix rows */}
        {rows.map((rowLabel, ri) => {
          const rowFocused = focusSet ? focusSet.has(`row:${rowLabel}`) || focusSet.has(rowLabel) : false;
          return (
            <div key={`${rowLabel}_${ri}`} style={{ display: 'contents' }}>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: rowFocused ? 850 : 700,
                  color: rowFocused ? ACCENT : INK2,
                  paddingRight: 8,
                  whiteSpace: 'nowrap',
                }}
              >
                {rowLabel}
              </div>
              {cols.map((colLabel, ci) => {
                const v = values[ri]?.[ci] ?? 0;
                const { bg, fg } = cellColors(v, domain, scaleName);
                const cellId = cellAnchors[`${ri}:${ci}`];
                const cellKey = `cell:${ri}:${ci}`;
                const dimmed = isDimmed(cellId, cellKey, `row:${rowLabel}`, `col:${colLabel}`, rowLabel, colLabel);
                const emphasized = !!focusSet && !dimmed && (focusSet.has(cellKey) || (!!cellId && focusSet.has(cellId)));
                return (
                  <HeatmapCell
                    key={`${ri}_${ci}`}
                    ri={ri}
                    ci={ci}
                    rowLabel={rowLabel}
                    colLabel={colLabel}
                    value={v}
                    text={formatCellValue(v, fmt)}
                    bg={bg}
                    fg={fg}
                    cellId={cellId}
                    dimmed={dimmed}
                    emphasized={emphasized}
                    animate={animate}
                    anchors={anchors}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      {showScale !== false && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 14 }}>
          <span style={{ fontFamily: MONO, fontSize: 11.5, color: DIMMED }}>{formatCellValue(domain[0], fmt)}</span>
          <div style={{ flex: 1, maxWidth: 160, height: 8, borderRadius: 999, background: gradientCss }} />
          <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: INK2 }}>{formatCellValue(domain[1], fmt)}</span>
        </div>
      )}
    </figure>
  );
}
