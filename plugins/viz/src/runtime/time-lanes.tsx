import { scaleLinear } from 'd3-scale';
import type { ComponentCtx, PluginIRNode } from '@joplo-app/kit/plugin';
import { motion, useRoot } from '@joplo-app/kit/renderer';
import { Fragment } from 'react';
import { layoutTimeLanes, readTimeLanes, type TimeSpan } from '../schema.ts';
import { ChartHeader, useAnchorAttrs, useVizChart } from './hooks.tsx';
import {
  ACCENT,
  DANGER,
  DIMMED,
  EASE_OUT_EXPO,
  INFO,
  INK,
  INK2,
  LINE,
  LINE_STRONG,
  MONO,
  OK,
  SUBTLE,
  VIZ_FONT_SANS,
  WARN,
  dim,
  str,
  tint,
  vizColor,
} from './tokens.ts';

const STATUS_TONE: Record<string, string> = {
  ok: OK,
  warn: WARN,
  fail: DANGER,
  info: INFO,
  accent: ACCENT,
};

function LaneBar({
  span,
  row,
  rowHeight,
  barHeight,
  domain: [min, max],
  unit,
  dimmed,
  animate,
  anchors,
}: {
  span: TimeSpan;
  row: number;
  rowHeight: number;
  barHeight: number;
  domain: [number, number];
  unit: string;
  dimmed: boolean;
  animate: boolean;
  anchors: Map<string, PluginIRNode>;
}) {
  const fullLabel = span.label ?? span.id;
  const anchorProps = useAnchorAttrs(anchors, span.id, fullLabel);
  const startPct = ((span.start - min) / (max - min)) * 100;
  const widthPct = ((span.end - span.start) / (max - min)) * 100;
  const accent = span.color ? vizColor(span.color) : span.status ? STATUS_TONE[span.status] ?? INFO : INFO;
  const description = `${fullLabel} · ${span.lane} · ${span.start}–${span.end} ${unit}${span.status ? ' · ' + span.status : ''}`;
  const isNarrow = !!span.shortLabel || (widthPct < 24 && fullLabel.length > 7);
  const insideText = span.shortLabel ?? (widthPct >= 14 ? fullLabel : '');
  const rangeText = span.rangeLabel ?? (widthPct >= 26 ? `${span.start}–${span.end} ${unit}` : '');
  const topOffset = row * rowHeight + (rowHeight - barHeight) / 2;
  // Place external label on the roomier side of the track (left if bar sits near right edge, else right)
  const floatLeft = startPct > 45;

  return (
    <>
      {isNarrow && (
        <div
          style={{
            position: 'absolute',
            top: topOffset,
            height: barHeight,
            ...(floatLeft ? { right: `${100 - startPct + 1.4}%` } : { left: `${startPct + widthPct + 1.4}%` }),
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            whiteSpace: 'nowrap',
            opacity: dimmed ? 0.36 : 1,
            transition: animate ? 'opacity 260ms ease' : undefined,
            pointerEvents: 'none',
          }}
        >
          <span style={{ fontSize: Math.max(12.5, barHeight * 0.29), fontWeight: 750, color: INK2 }}>{fullLabel}</span>
          <span style={{ fontFamily: MONO, fontSize: Math.max(11, barHeight * 0.24), fontWeight: 700, color: accent }}>
            {span.rangeLabel ?? `${span.start}–${span.end} ${unit}`}
          </span>
        </div>
      )}

      <div
        {...anchorProps}
        role="img"
        aria-label={description}
        title={description}
        style={{
          position: 'absolute',
          top: topOffset,
          left: `${startPct}%`,
          width: widthPct === 0 ? 2 : `${widthPct}%`,
          height: barHeight,
          borderRadius: 8,
          color: INK,
          backgroundColor: dimmed ? SUBTLE : tint(accent, 16),
          borderLeft: `${widthPct === 0 ? 2 : 4}px solid ${dimmed ? LINE_STRONG : accent}`,
          borderTop: `1px solid ${dimmed ? LINE : accent}`,
          borderRight: `1px solid ${dimmed ? LINE : accent}`,
          borderBottom: `1px solid ${dimmed ? LINE : accent}`,
          boxSizing: 'border-box',
          padding: widthPct === 0 ? 0 : '0 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isNarrow ? 'center' : 'space-between',
          gap: 10,
          overflow: 'hidden',
          opacity: dimmed ? 0.5 : 1,
          transition: animate ? 'opacity 260ms ease, background-color 260ms ease' : undefined,
        }}
      >
        {insideText && (
          <span
            style={{
              fontSize: Math.max(12.5, barHeight * 0.3),
              fontWeight: dimmed ? 650 : 800,
              color: dimmed ? INK2 : INK,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {insideText}
          </span>
        )}
        {!isNarrow && rangeText && (
          <span
            style={{
              fontFamily: MONO,
              fontSize: Math.max(11, barHeight * 0.24),
              fontWeight: 700,
              color: dimmed ? DIMMED : accent,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {rangeText}
          </span>
        )}
      </div>
    </>
  );
}

export function TimeLanesView({ ctx }: { ctx: ComponentCtx }) {
  const { node, p, animate, snap, anchors, isDimmed } = useVizChart(ctx);
  const {
    title,
    subtitle,
    domain: _d,
    spans: _s,
    unit: _u,
    ticks: rawTicks,
    cursor: propCursor,
    cursorLabel: propCursorLabel,
    spanIds: _sids,
    compact,
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

  const chart = readTimeLanes(p);
  if (!chart.data) return <div {...root} role="status">TimeLanes · {chart.error}</div>;

  const { domain, spans, unit } = chart.data;
  const [min, max] = domain;
  const scale = scaleLinear().domain([min, max]).range([0, 100]);
  const ticks = Array.isArray(rawTicks) && rawTicks.every((t) => typeof t === 'number')
    ? (rawTicks as number[])
    : scale.ticks(Math.min(8, Math.max(4, Math.round(max - min))));

  const rowHeight = compact === true ? 40 : 62;
  const barHeight = compact === true ? 30 : 46;
  const rowGap = compact === true ? 8 : 14;
  const lanes = layoutTimeLanes(spans);

  // Cursor: effect snapshot wins over prop
  const activeCursor = snap.cursor !== undefined ? snap.cursor : typeof propCursor === 'number' ? { value: propCursor, label: typeof propCursorLabel === 'string' ? propCursorLabel : undefined } : null;
  const cursorNum = activeCursor && typeof activeCursor.value === 'number' && Number.isFinite(activeCursor.value) ? activeCursor.value : null;
  const cursorPct = cursorNum !== null ? Math.max(0, Math.min(100, scale(cursorNum))) : null;

  return (
    <figure {...root} style={{ ...root.style, margin: 0 }} aria-label={typeof title === 'string' ? title : 'TimeLanes'}>
      <ChartHeader title={typeof title === 'string' ? title : undefined} subtitle={typeof subtitle === 'string' ? subtitle : undefined} />

      {/* Tick header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(92px, 132px) minmax(0, 1fr)', columnGap: 18, alignItems: 'end', marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: DIMMED }} />
        <div style={{ position: 'relative', height: 24, borderBottom: `1.5px solid ${LINE_STRONG}` }}>
          {ticks.map((tk, i) => {
            const pct = scale(tk);
            const isFirst = i === 0;
            const isLast = i === ticks.length - 1;
            return (
              <span
                key={tk}
                style={{
                  position: 'absolute',
                  left: `${pct}%`,
                  bottom: 5,
                  transform: isFirst ? 'none' : isLast ? 'translateX(-100%)' : 'translateX(-50%)',
                  fontFamily: MONO,
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: INK2,
                  whiteSpace: 'nowrap',
                }}
              >
                {tk} {unit}
              </span>
            );
          })}
        </div>
      </div>

      {/* Lanes + vertical gridlines + animated playhead cursor */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(92px, 132px) minmax(0, 1fr)', columnGap: 18, paddingBottom: cursorPct !== null ? 28 : 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: rowGap }}>
          {lanes.map(({ lane, rows }) => (
            <div
              key={lane}
              style={{
                height: rows * rowHeight,
                display: 'flex',
                alignItems: 'center',
                fontSize: compact === true ? 13.5 : 15,
                fontWeight: 800,
                color: INK,
                overflowWrap: 'anywhere',
              }}
            >
              {lane}
            </div>
          ))}
        </div>

        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: rowGap }}>
          {/* Vertical tick hairlines spanning all lanes */}
          {ticks.map((tk, i) => {
            const pct = scale(tk);
            if (i === 0 || i === ticks.length - 1) return null;
            return (
              <div
                key={tk}
                style={{
                  position: 'absolute',
                  left: `${pct}%`,
                  top: 0,
                  bottom: 0,
                  borderLeft: `1px dashed ${LINE}`,
                  pointerEvents: 'none',
                }}
              />
            );
          })}

          {lanes.map(({ lane, bars, rows }) => (
            <div
              key={lane}
              style={{
                position: 'relative',
                height: rows * rowHeight,
                borderRadius: 8,
                background: SUBTLE,
              }}
            >
              {bars.map(({ span, row }) => (
                <Fragment key={span.id}>
                  <LaneBar
                    span={span}
                    row={row}
                    rowHeight={rowHeight}
                    barHeight={barHeight}
                    domain={domain}
                    unit={unit}
                    dimmed={isDimmed(span.id, span.lane)}
                    animate={animate}
                    anchors={anchors}
                  />
                </Fragment>
              ))}
            </div>
          ))}

          {/* Animated vertical playhead cursor (label anchored cleanly below the tracks to never collide with top axis ticks) */}
          {cursorPct !== null && (
            <motion.div
              initial={false}
              animate={{ left: `${cursorPct}%` }}
              transition={animate ? { duration: 0.65, ease: EASE_OUT_EXPO } : { duration: 0 }}
              style={{
                position: 'absolute',
                top: -12,
                bottom: -6,
                width: 2.5,
                background: ACCENT,
                pointerEvents: 'none',
                zIndex: 5,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: -4,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: ACCENT,
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  bottom: -24,
                  left: cursorPct > 86 ? undefined : cursorPct < 14 ? 0 : '50%',
                  right: cursorPct > 86 ? 0 : undefined,
                  transform: cursorPct > 86 || cursorPct < 14 ? 'none' : 'translateX(-50%)',
                  padding: '2px 9px',
                  borderRadius: 999,
                  background: ACCENT,
                  color: '#ffffff',
                  fontFamily: MONO,
                  fontSize: 11.5,
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                }}
              >
                {activeCursor?.label ?? `${str(cursorNum)} ${unit}`}
              </span>
            </motion.div>
          )}
        </div>
      </div>
    </figure>
  );
}
