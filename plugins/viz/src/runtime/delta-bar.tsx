import { scaleLinear } from 'd3-scale';
import type { ComponentCtx, PluginIRNode } from '@joplo-app/kit/plugin';
import { motion, useRoot } from '@joplo-app/kit/renderer';
import { formatDeltaPercent, type DeltaBarItemInput } from '../schema.ts';
import { ChartHeader, useAnchorAttrs, useVizChart } from './hooks.tsx';
import {
  DANGER,
  DIMMED,
  EASE_OUT_EXPO,
  INK,
  INK2,
  LINE,
  LINE_STRONG,
  MONO,
  OK,
  SUBTLE,
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

function DeltaRow({
  item,
  index,
  baseline,
  scale,
  ticks,
  unit,
  variant,
  lowerIsBetter,
  baselineLabel,
  afterLabel,
  animate,
  dimmed,
  anchors,
}: {
  item: DeltaBarItemInput;
  index: number;
  baseline: number;
  scale: (v: number) => number;
  ticks: number[];
  unit: string;
  variant: 'ghost' | 'paired';
  lowerIsBetter: boolean;
  baselineLabel: string;
  afterLabel: string;
  animate: boolean;
  dimmed: boolean;
  anchors: Map<string, PluginIRNode>;
}) {
  const anchorProps = useAnchorAttrs(anchors, item.id, item.label);
  const current = item.value;
  const changed = Math.abs(current - baseline) > 1e-6;
  const improved = lowerIsBetter ? current < baseline : current > baseline;
  const deltaTone = !changed ? DIMMED : improved ? OK : DANGER;
  const deltaText = formatDeltaPercent(baseline, current, item.deltaLabel);
  const basePct = Math.max(0, Math.min(100, scale(baseline)));
  const curPct = Math.max(0, Math.min(100, scale(current)));
  const barColor = item.color ? vizColor(item.color) : changed ? vizColor('indigo') : '#475569';
  const delaySec = animate ? index * 0.12 : 0;
  const barTrans = animate
    ? { duration: 0.78, delay: delaySec, ease: EASE_OUT_EXPO }
    : { duration: 0 };
  const revealTrans = animate
    ? { duration: 0.34, delay: delaySec + 0.34, ease: EASE_OUT_EXPO }
    : { duration: 0 };

  if (variant === 'paired') {
    return (
      <div
        {...anchorProps}
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(112px, 154px) 1fr minmax(108px, 146px)',
          alignItems: 'center',
          columnGap: 20,
          opacity: dimmed ? 0.26 : 1,
          transition: animate ? 'opacity 280ms ease' : undefined,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 14.5, fontWeight: 800, color: INK }}>{item.label}</span>
          {item.sub && <span style={{ fontSize: 12, color: DIMMED }}>{item.sub}</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 14, borderRadius: 4, background: SUBTLE, overflow: 'hidden' }}>
              <div style={{ width: `${basePct}%`, height: '100%', borderRadius: 4, background: '#94a3b8' }} />
            </div>
            <span style={{ fontFamily: MONO, fontSize: 11.5, color: DIMMED, minWidth: 60 }}>
              {baselineLabel} {formatNumber(baseline, unit)}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 18, borderRadius: 5, background: SUBTLE, overflow: 'hidden' }}>
              <motion.div
                initial={false}
                animate={{ width: `${curPct}%`, backgroundColor: barColor }}
                transition={barTrans}
                style={{ height: '100%', borderRadius: 5 }}
              />
            </div>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: barColor, minWidth: 60 }}>
              {afterLabel} {formatNumber(current, unit)}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ fontFamily: MONO, fontSize: changed ? 18 : 13.5, fontWeight: changed ? 900 : 700, color: deltaTone }}>
            {changed ? deltaText : `${formatNumber(baseline, unit)} ${baselineLabel}`}
          </span>
          {changed && item.note && <span style={{ fontSize: 11.5, color: DIMMED }}>{item.note}</span>}
        </div>
      </div>
    );
  }

  // Default variant="ghost": curtain-uncover retract with dashed ghost baseline + staggered delta pill
  const bandLeft = Math.min(curPct, basePct);
  const bandWidth = Math.abs(basePct - curPct);

  return (
    <div
      {...anchorProps}
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(112px, 154px) 1fr minmax(112px, 148px)',
        alignItems: 'center',
        columnGap: 20,
        padding: '4px 0',
        opacity: dimmed ? 0.26 : 1,
        transition: animate ? 'opacity 280ms ease' : undefined,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 14.5, fontWeight: 800, color: INK }}>{item.label}</span>
        {item.sub && <span style={{ fontSize: 12, color: DIMMED }}>{item.sub}</span>}
      </div>

      <div style={{ position: 'relative', height: 46, borderRadius: 8, background: SUBTLE, overflow: 'hidden' }}>
        {ticks.slice(1, -1).map((tk) => (
          <div
            key={tk}
            style={{
              position: 'absolute',
              left: `${scale(tk)}%`,
              top: 0,
              bottom: 0,
              borderLeft: `1px solid ${LINE}`,
              pointerEvents: 'none',
            }}
          />
        ))}

        {/* Curtain under-layer: dashed ghost baseline footprint + tinted delta band */}
        {changed && (
          <motion.div
            initial={animate ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={animate ? { duration: 0.24, delay: delaySec } : { duration: 0 }}
            style={{
              position: 'absolute',
              left: 0,
              top: 4,
              width: `${Math.max(basePct, curPct)}%`,
              height: 38,
              borderRadius: 7,
              background: tint(deltaTone, 14),
              border: `1.5px dashed ${tint(deltaTone, 42)}`,
              boxSizing: 'border-box',
              zIndex: 1,
            }}
          />
        )}

        {/* Single persistent solid bar: animates real width (zero FLIP text stretch!) */}
        <motion.div
          initial={false}
          animate={{ width: `${curPct}%`, backgroundColor: barColor }}
          transition={barTrans}
          style={{
            position: 'absolute',
            left: 0,
            top: 4,
            height: 38,
            borderRadius: 7,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: curPct > 12 ? 12 : 6,
            boxSizing: 'border-box',
            zIndex: 2,
            boxShadow: '0 2px 8px rgba(23, 24, 26, 0.08)',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              fontFamily: MONO,
              fontSize: 12.5,
              fontWeight: 800,
              color: '#ffffff',
              whiteSpace: 'nowrap',
            }}
          >
            {changed ? formatNumber(current, unit) : `${baselineLabel} ${formatNumber(baseline, unit)}`}
          </span>
        </motion.div>

        {/* Delta pill gently rising inside the newly uncovered band */}
        {changed && bandWidth >= 14 && (
          <motion.div
            initial={animate ? { opacity: 0, y: 6 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={revealTrans}
            style={{
              position: 'absolute',
              left: `${bandLeft}%`,
              width: `${bandWidth}%`,
              top: 4,
              height: 38,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 3,
              pointerEvents: 'none',
            }}
          >
            <span
              style={{
                padding: '2px 9px',
                borderRadius: 999,
                background: SURFACE,
                border: `1px solid ${tint(deltaTone, 36)}`,
                fontFamily: MONO,
                fontSize: 12,
                fontWeight: 850,
                color: deltaTone,
                whiteSpace: 'nowrap',
              }}
            >
              {current < baseline ? '← ' : '→ '}
              {deltaText}
            </span>
          </motion.div>
        )}
      </div>

      {/* Right-hand direct summary */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 2,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {!changed ? (
          <span style={{ fontFamily: MONO, fontSize: 13.5, fontWeight: 700, color: DIMMED }}>
            {formatNumber(baseline, unit)} {baselineLabel}
          </span>
        ) : (
          <motion.div
            initial={animate ? { opacity: 0, y: 6 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={revealTrans}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}
          >
            <span style={{ fontFamily: MONO, fontSize: 19, fontWeight: 900, color: deltaTone }}>{deltaText}</span>
            <span style={{ fontSize: 11.5, color: DIMMED, whiteSpace: 'nowrap' }}>
              {item.note ?? `${formatNumber(baseline, unit)} → ${formatNumber(current, unit)}`}
            </span>
          </motion.div>
        )}
      </div>
    </div>
  );
}

export function DeltaBarView({ ctx }: { ctx: ComponentCtx }) {
  const { node, p, animate, snap, anchors, isDimmed } = useVizChart(ctx);
  const {
    items: rawItems,
    itemIds: _ids,
    title,
    subtitle,
    variant,
    domain: rawDomain,
    unit: rawUnit,
    lowerIsBetter,
    ticks: rawTicks,
    baselineLabel,
    afterLabel,
    showAxis,
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

  const items = arr(rawItems).filter(
    (x): x is DeltaBarItemInput => !!x && typeof x === 'object' && typeof (x as DeltaBarItemInput).value === 'number',
  );
  if (!items.length) return <div {...root} role="status">DeltaBar · no items</div>;

  const unit = str(rawUnit, '%');
  const mode: 'ghost' | 'paired' = variant === 'paired' ? 'paired' : 'ghost';
  const baselines = items.map((item, i) => {
    const key = item.id ?? String(i);
    if (typeof item.baseline === 'number' && Number.isFinite(item.baseline)) return item.baseline;
    if (snap.baselines && typeof snap.baselines[key] === 'number') return snap.baselines[key]!;
    return item.value;
  });

  const maxData = Math.max(
    1,
    ...items.map((x) => x.value),
    ...baselines,
  );
  const domain: [number, number] =
    Array.isArray(rawDomain) && typeof rawDomain[0] === 'number' && typeof rawDomain[1] === 'number'
      ? [rawDomain[0], rawDomain[1]]
      : [0, maxData];

  const scale = scaleLinear().domain(domain).range([0, 100]).clamp(true);
  const ticks = Array.isArray(rawTicks) && rawTicks.every((t) => typeof t === 'number')
    ? (rawTicks as number[])
    : scale.ticks(4);

  const anyChanged = items.some((item, i) => Math.abs(item.value - baselines[i]!) > 1e-6);

  return (
    <figure {...root} style={{ ...root.style, margin: 0 }} aria-label={typeof title === 'string' ? title : 'DeltaBar'}>
      <ChartHeader
        title={typeof title === 'string' ? title : undefined}
        subtitle={typeof subtitle === 'string' ? subtitle : undefined}
      />
      {showAxis !== false && mode === 'ghost' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(112px, 154px) 1fr minmax(112px, 148px)',
            alignItems: 'center',
            columnGap: 20,
            marginBottom: 10,
          }}
        >
          <span style={{ fontSize: 11.5, fontWeight: 700, color: DIMMED }}>指标</span>
          <div style={{ position: 'relative', height: 18, fontFamily: MONO, fontSize: 11, color: DIMMED }}>
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
                    transform: isFirst ? 'none' : isLast ? 'translateX(-100%)' : 'translateX(-50%)',
                    fontWeight: isLast ? 750 : 500,
                    color: isLast ? INK2 : DIMMED,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatNumber(tk, unit)}
                </span>
              );
            })}
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: DIMMED, textAlign: 'right' }}>
            {anyChanged ? '实测变化' : '基准态'}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {items.map((item, index) => (
          <DeltaRow
            key={item.id ?? `${item.label}_${index}`}
            item={item}
            index={index}
            baseline={baselines[index]!}
            scale={scale}
            ticks={ticks}
            unit={unit}
            variant={mode}
            lowerIsBetter={item.lowerIsBetter ?? lowerIsBetter === true}
            baselineLabel={str(baselineLabel, '基准')}
            afterLabel={str(afterLabel, '新值')}
            animate={animate}
            dimmed={isDimmed(item.id, item.label)}
            anchors={anchors}
          />
        ))}
      </div>
    </figure>
  );
}
