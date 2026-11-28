import { scaleLinear } from 'd3-scale';
import type { ComponentCtx, PluginIRNode } from '@joplo-app/kit/plugin';
import { motion, useRoot } from '@joplo-app/kit/renderer';
import { computeWaterfall, type WaterfallBar, type WaterfallStepInput } from '../schema.ts';
import { ChartHeader, useAnchorAttrs, useVizChart } from './hooks.tsx';
import {
  ACCENT,
  DANGER,
  DIMMED,
  EASE_OUT_EXPO,
  INK,
  LINE,
  LINE_STRONG,
  MONO,
  OK,
  VIZ_FONT_SANS,
  arr,
  dim,
  formatNumber,
  num,
  str,
  vizColor,
} from './tokens.ts';

function WaterfallColumn({
  bar,
  nextBar,
  scale,
  plotH,
  unit,
  lowerIsBetter,
  visible,
  dimmed,
  animate,
  anchors,
}: {
  bar: WaterfallBar;
  nextBar?: WaterfallBar;
  scale: (v: number) => number;
  plotH: number;
  unit: string;
  lowerIsBetter: boolean;
  visible: boolean;
  dimmed: boolean;
  animate: boolean;
  anchors: Map<string, PluginIRNode>;
}) {
  const anchorProps = useAnchorAttrs(anchors, bar.id, bar.label);
  const topVal = Math.max(bar.start, bar.end);
  const botVal = Math.min(bar.start, bar.end);
  const topY = scale(topVal);
  const botY = scale(botVal);
  const barH = Math.max(8, botY - topY);

  const isTotal = bar.kind === 'total' || bar.kind === 'subtotal';
  const isStart = bar.kind === 'start';
  const improved = lowerIsBetter ? bar.value < 0 : bar.value > 0;
  const fill = bar.color
    ? vizColor(bar.color)
    : isStart
      ? '#475569'
      : isTotal
        ? ACCENT
        : improved
          ? OK
          : DANGER;

  const badgeText =
    bar.deltaLabel ??
    (isStart || isTotal
      ? formatNumber(bar.end, unit)
      : `${bar.value > 0 ? '+' : '−'}${formatNumber(Math.abs(bar.value), unit)}`);

  const endY = scale(bar.end);

  return (
    <div
      {...anchorProps}
      data-jstep={bar.id ?? bar.label}
      style={{
        flex: 1,
        minWidth: 0,
        position: 'relative',
        height: plotH,
        opacity: !visible ? 0.12 : dimmed ? 0.24 : 1,
        transition: animate ? 'opacity 300ms ease' : undefined,
      }}
    >
      {/* Floating or anchored bar */}
      <motion.div
        initial={animate ? { scaleY: 0.2, opacity: 0 } : false}
        animate={{ scaleY: visible ? 1 : 0.2, opacity: visible ? 1 : 0.12 }}
        transition={animate ? { duration: 0.52, delay: bar.index * 0.08, ease: EASE_OUT_EXPO } : { duration: 0 }}
        style={{
          position: 'absolute',
          left: '16%',
          right: '16%',
          top: topY,
          height: barH,
          borderRadius: 7,
          background: fill,
          transformOrigin: bar.value < 0 && !isStart && !isTotal ? 'top' : 'bottom',
          boxShadow: '0 2px 6px rgba(23, 24, 26, 0.08)',
        }}
      />

      {/* Direct numeric value label above bar */}
      <span
        style={{
          position: 'absolute',
          left: '50%',
          top: Math.max(0, topY - 22),
          transform: 'translateX(-50%)',
          fontFamily: MONO,
          fontSize: 12,
          fontWeight: 850,
          color: fill,
          whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {badgeText}
      </span>

      {/* Dashed stair connector to the next step */}
      {nextBar && visible && (
        <div
          style={{
            position: 'absolute',
            left: '84%',
            width: '48%',
            top: endY,
            borderTop: `1.5px dashed ${LINE_STRONG}`,
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
      )}
    </div>
  );
}

export function WaterfallView({ ctx }: { ctx: ComponentCtx }) {
  const { node, p, animate, snap, anchors, isDimmed } = useVizChart(ctx);
  const {
    title,
    subtitle,
    steps: rawSteps,
    unit: rawUnit,
    lowerIsBetter,
    stepIds: _sids,
    w,
    h,
    ...rest
  } = p;

  const H = num(h, 250)!;
  const root = useRoot(node, rest, {
    style: {
      width: dim(w) ?? '100%',
      minWidth: 0,
      fontFamily: VIZ_FONT_SANS,
      color: INK,
    },
  });

  const steps = arr(rawSteps).filter(
    (s): s is WaterfallStepInput => !!s && typeof s === 'object' && typeof (s as WaterfallStepInput).value === 'number',
  );
  if (!steps.length) return <div {...root} role="status">Waterfall · no steps</div>;

  const unit = str(rawUnit);
  const bars = computeWaterfall(steps);
  const allVals = [0, ...bars.flatMap((b) => [b.start, b.end])];
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(1, ...allVals);

  const plotH = Math.max(140, H - 52);
  const scale = scaleLinear()
    .domain([minVal, maxVal * 1.16])
    .range([plotH - 6, 26]);

  // Progressive reveal support via revealTo(chart, indexOrId)
  let visibleCount = bars.length;
  if (typeof snap.reveal === 'number' && Number.isFinite(snap.reveal)) {
    visibleCount = Math.max(1, Math.min(bars.length, Math.round(snap.reveal)));
  } else if (typeof snap.reveal === 'string') {
    const idx = bars.findIndex((b) => b.id === snap.reveal || b.label === snap.reveal);
    if (idx >= 0) visibleCount = idx + 1;
  }

  const ticks = scale.ticks(4);

  return (
    <figure {...root} style={{ ...root.style, margin: 0 }} aria-label={typeof title === 'string' ? title : 'Waterfall'}>
      <ChartHeader title={typeof title === 'string' ? title : undefined} subtitle={typeof subtitle === 'string' ? subtitle : undefined} />

      <div style={{ position: 'relative', height: plotH, display: 'flex', alignItems: 'stretch', gap: 10, borderBottom: `1.5px solid ${LINE_STRONG}` }}>
        {ticks.map((tk) => (
          <div
            key={tk}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: scale(tk),
              borderTop: tk === 0 ? `1.5px solid ${LINE_STRONG}` : `1px solid ${LINE}`,
              pointerEvents: 'none',
            }}
          />
        ))}

        {bars.map((bar, idx) => (
          <WaterfallColumn
            key={bar.id ?? `${bar.label}_${idx}`}
            bar={bar}
            nextBar={bars[idx + 1]}
            scale={scale}
            plotH={plotH}
            unit={unit}
            lowerIsBetter={lowerIsBetter === true}
            visible={idx < visibleCount}
            dimmed={isDimmed(bar.id, bar.label)}
            animate={animate}
            anchors={anchors}
          />
        ))}
      </div>

      {/* Zero-stretch X labels */}
      <div style={{ display: 'flex', gap: 10, paddingTop: 9 }}>
        {bars.map((bar, idx) => (
          <div
            key={bar.id ?? idx}
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: 'center',
              fontSize: 12,
              fontWeight: bar.kind === 'total' || bar.kind === 'start' ? 800 : 650,
              color: idx < visibleCount ? INK : DIMMED,
            }}
          >
            {bar.label}
          </div>
        ))}
      </div>
    </figure>
  );
}
