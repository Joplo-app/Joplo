import type { ComponentCtx, PluginIRNode } from '@joplo-app/kit/plugin';
import { motion, useI18n, useRoot } from '@joplo-app/kit/renderer';
import { ratioParts, type RatioSegment } from '../schema.ts';
import { ChartHeader, useAnchorAttrs, useVizChart } from './hooks.tsx';
import {
  ACCENT,
  DIMMED,
  EASE_OUT_EXPO,
  INK,
  LINE_STRONG,
  MONO,
  SUBTLE,
  SURFACE,
  VIZ_FONT_SANS,
  dim,
  formatNumber,
  str,
  vizColor,
} from './tokens.ts';

function RatioSegmentBar({
  seg,
  pct,
  color,
  borderRadius,
  transition,
  anchors,
}: {
  seg: RatioSegment;
  pct: number;
  color: string;
  borderRadius: string | number;
  transition: { duration: number; ease?: [number, number, number, number] };
  anchors: Map<string, PluginIRNode>;
}) {
  const anchorProps = useAnchorAttrs(anchors, seg.id, seg.label);
  return (
    <motion.div
      {...anchorProps}
      initial={false}
      animate={{ width: `${pct}%` }}
      transition={transition}
      style={{ background: color, borderRadius }}
    />
  );
}

export function RatioBarView({ ctx }: { ctx: ComponentCtx }) {
  const { node, p, animate, anchors } = useVizChart(ctx);
  const { t } = useI18n<{ noData: string }>();
  const {
    title,
    total: _t,
    left: _l,
    right: _r,
    segments: _s,
    threshold: _th,
    labels: rawLabels,
    remainderLabel,
    thresholdLabel,
    colors: rawColors,
    unit: rawUnit,
    height,
    showDenominator,
    segmentIds: _sids,
    ...rest
  } = p;

  const root = useRoot(node, rest, {
    style: { minWidth: 0, width: '100%', margin: 0, fontFamily: VIZ_FONT_SANS, color: INK },
  });

  const parts = ratioParts(p);
  if (!parts || ['right', 'threshold'].some((key) => node.props?.[key] !== undefined && p[key] === undefined)) {
    return <figure {...root}>{t.stage.noData}</figure>;
  }

  const unit = str(rawUnit);
  const trackH = dim(height) ?? 20;
  const transition = animate ? { duration: 0.45, ease: EASE_OUT_EXPO } : { duration: 0 };
  const fmt = (n: number) =>
    showDenominator === true ? `${formatNumber(n, unit)} / ${formatNumber(parts.total, unit)}` : formatNumber(n, unit);

  if (parts.mode === 'segments') {
    const segColors = parts.segments.map((seg, i) => vizColor(seg.color ?? (Array.isArray(rawColors) ? rawColors[i] : undefined), i));
    const remColor = Array.isArray(rawColors) && rawColors[parts.segments.length]
      ? vizColor(rawColors[parts.segments.length])
      : SUBTLE;

    return (
      <figure {...root} aria-label={typeof p['aria-label'] === 'string' ? p['aria-label'] : typeof title === 'string' ? title : undefined}>
        <ChartHeader title={typeof title === 'string' ? title : undefined} />
        <div style={{ position: 'relative', display: 'flex', height: trackH, borderRadius: 6, background: SUBTLE, overflow: 'visible' }}>
          {parts.segments.map((seg, i) => (
            <RatioSegmentBar
              key={seg.id ?? i}
              seg={seg}
              pct={parts.percentages[i]!}
              color={segColors[i]!}
              borderRadius={i === 0 ? '6px 0 0 6px' : i === parts.segments.length - 1 && parts.remainder <= 0 ? '0 6px 6px 0' : 0}
              transition={transition}
              anchors={anchors}
            />
          ))}
          {parts.remainder > 0 && (
            <motion.div
              initial={false}
              animate={{ width: `${parts.remainderPct}%` }}
              transition={transition}
              style={{ background: remColor, borderRadius: '0 6px 6px 0' }}
            />
          )}
          {parts.threshold !== undefined && (
            <motion.span
              initial={false}
              animate={{ left: `${parts.threshold}%` }}
              transition={transition}
              style={{
                position: 'absolute',
                top: -4,
                bottom: -4,
                borderLeft: `2px solid ${INK}`,
                transform: 'translateX(-50%)',
                boxShadow: `1px 0 ${SURFACE}`,
              }}
            />
          )}
        </div>

        <figcaption style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', marginTop: 9, fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>
          {parts.segments.map((seg, i) => (
            <span key={seg.id ?? i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: segColors[i] }} />
              <span style={{ fontWeight: 700, color: INK }}>{seg.label ?? `Segment ${i + 1}`}</span>
              <span style={{ fontFamily: MONO, fontWeight: 800, color: segColors[i] }}>{fmt(seg.value)}</span>
            </span>
          ))}
          {parts.remainder > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: DIMMED }}>
              <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: remColor }} />
              {str(remainderLabel, 'Remainder')} {fmt(parts.remainder)}
            </span>
          )}
          {parts.threshold !== undefined && (
            <span style={{ fontFamily: MONO, fontSize: 12.5, color: INK }}>
              <b aria-hidden>│ </b>
              {str(thresholdLabel, 'Threshold')} {formatNumber(p.threshold as number, unit)}
            </span>
          )}
        </figcaption>
      </figure>
    );
  }

  // Pair / single-value mode
  const labels = Array.isArray(rawLabels) ? rawLabels : [];
  const isSingle = p.right === undefined;
  const userColors = Array.isArray(rawColors) ? rawColors : [];
  // Smart 2-color mapping when right is omitted: colors={[left, remainder]} works naturally without falling back to gray!
  const leftColor = userColors[0] ? vizColor(userColors[0], 0) : ACCENT;
  const rightColor = !isSingle && userColors[1] ? vizColor(userColors[1], 1) : DIMMED;
  const remColor = isSingle
    ? userColors[2]
      ? vizColor(userColors[2], 2)
      : userColors[1]
        ? vizColor(userColors[1], 2)
        : LINE_STRONG
    : userColors[2]
      ? vizColor(userColors[2], 2)
      : LINE_STRONG;

  const colors = [leftColor, rightColor, remColor];
  const names = [labels[0] ?? 'A', labels[1] ?? 'B', str(remainderLabel, 'Remainder')];
  const indices = isSingle ? [0, 2] : [0, 1, 2];

  // Clean editorial single-value layout: label + direct bold value on top, crisp bar below, threshold note cleanly aligned
  if (isSingle && showDenominator !== true) {
    return (
      <figure {...root} aria-label={typeof p['aria-label'] === 'string' ? p['aria-label'] : str(labels[0], 'RatioBar')}>
        <ChartHeader title={typeof title === 'string' ? title : undefined} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 7 }}>
          <span style={{ fontSize: 14, fontWeight: 750, color: INK }}>{str(names[0])}</span>
          <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 12, fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ fontFamily: MONO, fontSize: 16.5, fontWeight: 900, color: leftColor }}>
              {formatNumber(parts.counts[0], unit)}
            </span>
            {parts.counts[2] > 0 && (
              <span style={{ fontSize: 12.5, fontWeight: 650, color: remColor === LINE_STRONG ? DIMMED : remColor }}>
                {formatNumber(parts.counts[2], unit)} {str(names[2])}
              </span>
            )}
          </div>
        </div>
        <div aria-hidden style={{ position: 'relative', display: 'flex', height: trackH, borderRadius: 6, background: SUBTLE }}>
          <motion.div
            initial={false}
            animate={{ width: `${parts.percentages[0]}%` }}
            transition={transition}
            style={{ background: leftColor, borderRadius: parts.percentages[2]! > 0 ? '6px 0 0 6px' : 6 }}
          />
          <motion.div
            initial={false}
            animate={{ width: `${parts.percentages[2]}%` }}
            transition={transition}
            style={{ background: remColor === LINE_STRONG ? SUBTLE : `color-mix(in srgb, ${remColor} 18%, ${SURFACE})`, borderRadius: '0 6px 6px 0' }}
          />
          {parts.threshold !== undefined && (
            <motion.span
              initial={false}
              animate={{ left: `${parts.threshold}%` }}
              transition={transition}
              style={{
                position: 'absolute',
                top: -4,
                bottom: -4,
                borderLeft: `2px solid ${INK}`,
                transform: 'translateX(-50%)',
                boxShadow: `1px 0 ${SURFACE}`,
              }}
            />
          )}
        </div>
        {parts.threshold !== undefined && (
          <figcaption style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6, fontSize: 11.5, fontFamily: MONO, color: DIMMED }}>
            │ {str(thresholdLabel, 'Threshold')} {formatNumber(p.threshold as number, unit)}
          </figcaption>
        )}
      </figure>
    );
  }

  return (
    <figure {...root} aria-label={typeof p['aria-label'] === 'string' ? p['aria-label'] : undefined}>
      <ChartHeader title={typeof title === 'string' ? title : undefined} />
      <div aria-hidden style={{ position: 'relative', display: 'flex', height: trackH, borderRadius: 6, background: SUBTLE }}>
        {indices.map((i) => (
          <motion.div
            key={i}
            initial={false}
            animate={{ width: `${parts.percentages[i]}%` }}
            transition={transition}
            style={{ background: colors[i], borderRadius: i === 0 ? '6px 0 0 6px' : i === 2 ? '0 6px 6px 0' : 0 }}
          />
        ))}
        {parts.threshold !== undefined && (
          <motion.span
            initial={false}
            animate={{ left: `${parts.threshold}%` }}
            transition={transition}
            style={{
              position: 'absolute',
              top: -4,
              bottom: -4,
              borderLeft: `2px solid ${INK}`,
              transform: 'translateX(-50%)',
              boxShadow: `1px 0 ${SURFACE}`,
            }}
          />
        )}
      </div>
      <figcaption style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 8, fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>
        {indices.map((i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: colors[i] }} />
            {str(names[i])} {fmt(parts.counts[i]!)}
          </span>
        ))}
        {parts.threshold !== undefined && (
          <span>
            <b aria-hidden>│ </b>
            {str(thresholdLabel, 'Threshold')} {formatNumber(p.threshold as number, unit)}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
