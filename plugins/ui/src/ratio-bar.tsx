import { motion, useCtx, useI18n, useRoot, type NodeProps } from '@joplo-app/kit/renderer';
import { ACCENT, DIMMED, INK, LINE_STRONG, SURFACE, color, dim } from '@joplo-app/kit/renderer-style';
import { ratioParts } from './ratio.ts';

export function RatioBar({ node, p }: NodeProps) {
  const { animate } = useCtx();
  const { t } = useI18n<{ noData: string }>();
  const root = useRoot(node, p, { style: { minWidth: 0, width: '100%', margin: 0 } });
  const parts = ratioParts(p);
  // An unresolved optional binding is missing data, just as an unresolved required binding is.
  if (!parts || ['right', 'threshold'].some(key => node.props?.[key] !== undefined && p[key] === undefined)) {
    return <figure {...root}>{t.stage.noData}</figure>;
  }
  const labels = Array.isArray(p.labels) ? p.labels : [];
  const names = [labels[0] ?? 'A', labels[1] ?? 'B', p.remainderLabel ?? 'Remainder'];
  const defaults = [ACCENT, DIMMED, LINE_STRONG];
  const colors = defaults.map((fallback, i) => color(Array.isArray(p.colors) ? p.colors[i] : undefined) ?? fallback);
  const indices = p.right === undefined ? [0, 2] : [0, 1, 2];
  const value = (n: number) => String(Number.isInteger(n) ? n : Number(n.toPrecision(15))) + String(p.unit ?? '');
  const transition = { duration: animate ? 0.28 : 0, ease: 'easeInOut' };
  return <figure {...root} aria-label={typeof p['aria-label'] === 'string' ? p['aria-label'] : undefined}>
    <div aria-hidden style={{ position: 'relative', display: 'flex', height: dim(p.height) ?? 18, borderRadius: 4, background: SURFACE }}>
      {indices.map(i => <motion.div key={i} initial={false} animate={{ width: `${parts.percentages[i]}%` }} transition={transition}
        style={{ background: colors[i], borderRadius: i === 0 ? '4px 0 0 4px' : i === 2 ? '0 4px 4px 0' : 0 }} />)}
      {parts.threshold !== undefined && <motion.span initial={false} animate={{ left: `${parts.threshold}%` }} transition={transition}
        style={{ position: 'absolute', top: -3, bottom: -3, borderLeft: `2px solid ${INK}`, transform: 'translateX(-50%)', boxShadow: `1px 0 ${SURFACE}` }} />}
    </div>
    <figcaption style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 8, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
      {indices.map(i => <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: colors[i] }} />
        {String(names[i])} {value(parts.counts[i]!)} / {value(parts.total)}
      </span>)}
      {parts.threshold !== undefined && <span><b aria-hidden>│ </b>{String(p.thresholdLabel ?? 'Threshold')} {value(p.threshold as number)}</span>}
    </figcaption>
  </figure>;
}
