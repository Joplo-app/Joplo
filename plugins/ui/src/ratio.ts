type RatioProps = { total?: unknown; left?: unknown; right?: unknown; threshold?: unknown };

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** A bound operand is unknown until playback. Other known counts still constrain it. */
export function ratioError(p: RatioProps, isBinding: (v: unknown) => boolean = () => false): string | undefined {
  for (const key of ['total', 'left', 'right', 'threshold'] as const) {
    const v = p[key];
    const optional = key === 'right' || key === 'threshold';
    if ((optional && v === undefined) || isBinding(v)) continue;
    if (!finite(v) || (key === 'total' ? v <= 0 : v < 0)) {
      return `${key} must be a finite ${key === 'total' ? 'positive' : 'nonnegative'} number`;
    }
  }
  if (!finite(p.total)) return;
  if (finite(p.threshold) && p.threshold > p.total) return 'threshold must be at most total';
  const left = finite(p.left) ? p.left : 0;
  const right = finite(p.right) ? p.right : 0;
  // Allow the single rounding step in additions such as 0.1 + 0.2.
  if (Math.max(left, right) > p.total || left + right - p.total > Number.EPSILON * p.total) return 'left + right must be at most total';
}

export function ratioParts(p: RatioProps) {
  if (ratioError(p)) return null;
  const total = p.total as number;
  const left = p.left as number;
  const right = (p.right ?? 0) as number;
  const remainder = Math.max(0, total - (left + right));
  return {
    total, counts: [left, right, remainder] as const,
    percentages: [left, right, remainder].map(n => n / total * 100),
    threshold: finite(p.threshold) ? p.threshold / total * 100 : undefined,
  };
}
